import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';
import { hasPermission } from '../../shared/permissions.ts';

const STAFF_ROLES = new Set(['owner', 'dev', 'admin', 'moderator', 'support', 'staff']);
const OPEN = new Set(['novo', 'em_atendimento', 'aguardando_usuario']);
const STATUSES = new Set(['novo', 'em_atendimento', 'aguardando_usuario', 'resolvido', 'fechado']);
const ATTACH_TYPES = new Set(['image', 'video', 'audio', 'link', 'file']);
const text = (v: any, max = 5000) => typeof v === 'string' ? v.trim().slice(0, max) : '';

function isSafePrivateFileUri(value: any) {
  const uri = typeof value === 'string' ? value.trim() : '';
  if (!uri || uri.length > 1200 || uri.includes('..') || /[\s<>"'\\]/.test(uri)) return false;
  return /^(mp|b44|base44)(:\/\/|\/)/i.test(uri) || /^private(:\/\/|\/)/i.test(uri);
}

function actorName(user: any) {
  const p = user?.profile || {};
  return p.display_name || p.name || p.discord_username || user?.full_name || 'Usuário';
}

function safeMentions(value: any) {
  return (Array.isArray(value) ? value : [])
    .filter((m: any) => m && typeof m.id === 'string' && typeof m.name === 'string')
    .slice(0, 5)
    .map((m: any) => ({ id: m.id.trim().slice(0, 120), name: m.name.trim().slice(0, 80) }))
    .filter((m: any) => m.id && m.name);
}

function safeAttachments(value: any) {
  return (Array.isArray(value) ? value : [])
    .filter((a: any) => {
      if (!a || !ATTACH_TYPES.has(a.type) || typeof a.url !== 'string') return false;
      const url = a.url.trim();
      return url.length <= 1200 && !url.includes('..') && (/^https?:\/\//i.test(url) || isSafePrivateFileUri(url));
    })
    .slice(0, 5)
    .map((a: any) => ({ type: a.type, url: a.url.trim().slice(0, 1200), name: text(a.name, 120) || undefined }));
}

async function clearTicketMentionBadges(svc: any, ticketId: string) {
  if (!ticketId) return;
  const rows = await svc.entities.Mention.list('-created_date', 1000).catch(() => []);
  const now = new Date().toISOString();
  const related = (rows || []).filter((row: any) => {
    if (row?.ticket_id === ticketId) return true;
    const match = String(row?.context_url || '').match(/[?&]ticket=([^&]+)/);
    if (!match?.[1]) return false;
    let legacyId = match[1];
    try { legacyId = decodeURIComponent(legacyId); } catch {}
    return legacyId === ticketId;
  });
  await Promise.all(related.filter((row: any) => row.viewed !== true).map((row: any) =>
    svc.entities.Mention.update(row.id, {
      viewed: true,
      viewed_at: now,
      ...(row.ticket_id ? {} : { ticket_id: ticketId }),
    }).catch(() => null)
  ));
}

async function getTicket(base44: any, svc: any, id: string) {
  if (!id) return null;
  // No site publicado, priorizamos a leitura autenticada/RLS. O service role
  // fica como fallback para staff e para compatibilidade com o preview.
  try {
    const rows = await base44.entities.Ticket.filter({ id }, '-created_date', 1);
    if (rows?.[0]) return rows[0];
  } catch (error) {
    console.error('[ticketOps] authenticated ticket lookup failed', error);
  }
  try {
    const rows = await svc.entities.Ticket.filter({ id }, '-created_date', 1);
    return rows?.[0] || null;
  } catch (error) {
    console.error('[ticketOps] service ticket lookup failed', error);
    return null;
  }
}

function ticketOwner(ticket: any) {
  return ticket?.requester_user_id || ticket?.created_by_id || '';
}

function canAccess(ticket: any, user: any) {
  return !!ticket && (ticketOwner(ticket) === user.id || STAFF_ROLES.has(user.role));
}

async function staffLog(svc: any, user: any, action: string, details: string, target = '') {
  if (!STAFF_ROLES.has(user.role)) return;
  try {
    await svc.entities.StaffLog.create({
      actor_name: actorName(user), actor_id: user.id, action, details: details.slice(0, 1000), target_id: target,
    });
  } catch {}
}

async function notifyStaff(svc: any, title: string, body: string, ticketId: string, severity = 'notice', excludeIds: string[] = []) {
  try {
    const excluded = new Set(excludeIds.filter(Boolean));
    const users = await svc.entities.User.list('-created_date', 500);
    const audience = users.filter((u: any) => STAFF_ROLES.has(u.role) && !excluded.has(u.id)).map((u: any) => u.id).filter(Boolean);
    if (!audience.length) return;
    await svc.entities.CoreOsNotification.create({
      title: title.slice(0, 160),
      body: body.slice(0, 600),
      severity,
      category: 'support',
      audience_ids: audience,
      dedupe_key: `ticket:${ticketId}:${Date.now()}`,
      source: 'tickets',
      action_url: `/painel?view=staff&tab=tickets&ticket=${encodeURIComponent(ticketId)}`,
      read_by: [],
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch {}
}

async function notifyRequester(svc: any, requesterId: string, ticketId: string, title: string, body: string) {
  if (!requesterId) return;
  try {
    await svc.entities.UserNotification.create({
      recipient_user_id: requesterId,
      actor_name: 'Equipe Nébula',
      type: 'system',
      title: title.slice(0, 160),
      body: body.slice(0, 600),
      context_url: `/tickets?ticket=${encodeURIComponent(ticketId)}`,
      context_type: 'ticket',
      context_id: ticketId,
      read: false,
      dedupe_key: `ticket-reply:${ticketId}:${Date.now()}`,
    });
  } catch {}
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    try {
      await guardRequest(req, base44, { route: 'ticketOps', user, body, limit: 80, windowMs: 60_000, maxBodyBytes: 35_000 });
    } catch (guardError) {
      // Bloqueios reais continuam sendo respeitados. Porém, se a infraestrutura
      // de telemetria/segurança falhar no ambiente publicado, isso não pode
      // derrubar operações legítimas de ticket do usuário autenticado.
      const blocked = securityResponse(guardError);
      if (blocked) return blocked;
      console.error('[ticketOps] guard infrastructure failure', guardError);
    }
    const svc = base44.asServiceRole;
    const action = text(body.action, 40);

    if (action === 'list_my_ticket_mentions') {
      const mentionRows = await svc.entities.Mention.filter({ mentioned_user_id: user.id }, '-created_date', 500).catch(() => []);
      const ids = new Set<string>();
      for (const row of mentionRows || []) {
        if (row?.viewed === true) continue;
        if (row?.ticket_id) {
          ids.add(row.ticket_id);
          continue;
        }
        const match = String(row?.context_url || '').match(/[?&]ticket=([^&]+)/);
        if (match?.[1]) {
          try { ids.add(decodeURIComponent(match[1])); } catch { ids.add(match[1]); }
        }
      }
      return Response.json({ ticket_ids: [...ids].slice(0, 500) });
    }

    if (action === 'mark_ticket_mentions_seen') {
      const ticketId = text(body.ticket_id, 120);
      if (!ticketId) return Response.json({ error: 'Ticket inválido' }, { status: 400 });

      // Inclui menções legadas que ainda não possuíam ticket_id e guardavam
      // o ticket apenas na context_url. Isso evita o @ reaparecer ao reabrir
      // um ticket antigo já visualizado.
      const allMentions = await svc.entities.Mention.filter({ mentioned_user_id: user.id }, '-created_date', 500).catch(() => []);
      const mentions = (allMentions || []).filter((row: any) => {
        if (row?.ticket_id === ticketId) return true;
        const match = String(row?.context_url || '').match(/[?&]ticket=([^&]+)/);
        if (!match?.[1]) return false;
        let legacyId = match[1];
        try { legacyId = decodeURIComponent(legacyId); } catch {}
        return legacyId === ticketId;
      });

      const now = new Date().toISOString();
      await Promise.all(mentions.filter((row: any) => row.viewed !== true).map((row: any) =>
        svc.entities.Mention.update(row.id, { viewed: true, viewed_at: now, ...(row.ticket_id ? {} : { ticket_id: ticketId }) }).catch(() => null)
      ));
      return Response.json({ ok: true, ticket_id: ticketId, count: mentions.length });
    }

    if (action === 'list_staff_tickets') {
      const isStaffUser = STAFF_ROLES.has(user.role);
      if (!isStaffUser || !(await hasPermission(base44, user, 'tickets.view'))) {
        return Response.json({ error: 'Sem permissão para visualizar tickets' }, { status: 403 });
      }
      try {
        const rows = await svc.entities.Ticket.list('-created_date', 500);
        return Response.json({ tickets: Array.isArray(rows) ? rows : [] });
      } catch (error) {
        console.error('[ticketOps] staff ticket list service failed', error);
        try {
          const rows = await base44.entities.Ticket.list('-created_date', 500);
          return Response.json({ tickets: Array.isArray(rows) ? rows : [], fallback: true });
        } catch (fallbackError) {
          console.error('[ticketOps] staff ticket list authenticated fallback failed', fallbackError);
          return Response.json({ error: 'Não foi possível carregar os tickets agora.' }, { status: 503 });
        }
      }
    }

    const ticketId = text(body.ticket_id, 120);
    const ticket = await getTicket(base44, svc, ticketId);
    if (!ticket || !canAccess(ticket, user)) return Response.json({ error: 'Ticket não encontrado ou acesso negado' }, { status: 403 });
    const isStaff = STAFF_ROLES.has(user.role);
    if (ticket.deleted === true && !isStaff) return Response.json({ error: 'Ticket arquivado' }, { status: 404 });
    const ownerId = ticketOwner(ticket);

    if (action === 'validate_ticket_call') {
      if (ticket.deleted === true || (ticket.status || 'novo') === 'fechado') {
        return Response.json({
          allowed: false,
          error: 'A call deste ticket está indisponível enquanto ele estiver fechado.',
        }, { status: 409 });
      }
      return Response.json({ allowed: true, ticket_id: ticket.id, status: ticket.status || 'novo' });
    }

    if (action === 'list_messages') {
      let rows: any[] = [];
      try {
        // Acesso já foi validado acima. O service role é a fonte de verdade aqui:
        // evita histórico vazio/intermitente quando RLS/realtime do cliente atrasa.
        rows = await svc.entities.TicketMessage.filter({ ticket_id: ticket.id }, 'created_date', 500);
      } catch (error) {
        console.error('[ticketOps] service message lookup failed', error);
        try {
          rows = await base44.entities.TicketMessage.filter({ ticket_id: ticket.id }, 'created_date', 500);
        } catch (fallbackError) {
          console.error('[ticketOps] authenticated message lookup fallback failed', fallbackError);
          return Response.json({ error: 'Não foi possível carregar o histórico do ticket agora.' }, { status: 503 });
        }
      }
      const canonicalRows = [...(rows || [])]
        .sort((a: any, b: any) => {
          const aTime = new Date(a.created_date || a.created_at || 0).getTime() || 0;
          const bTime = new Date(b.created_date || b.created_at || 0).getTime() || 0;
          if (aTime !== bTime) return aTime - bTime;
          return String(a.id || '').localeCompare(String(b.id || ''));
        });
      const normalizedRows = canonicalRows.map((row: any, index: number) => ({ ...row, message_order: index + 1 }));
      const orderRepairs = canonicalRows
        .map((row: any, index: number) => ({ row, expected: index + 1 }))
        .filter(({ row, expected }) => Number(row.message_order) !== expected);
      if (orderRepairs.length) {
        await Promise.all(orderRepairs.map(({ row, expected }) =>
          svc.entities.TicketMessage.update(row.id, { message_order: expected }).catch(() => null)
        ));
      }
      const rawMessages = normalizedRows.map((row: any) => row.deleted ? {
        ...row,
        message: '',
        attachments: [],
        reply_preview: row.reply_preview === 'Mensagem original removida.' ? row.reply_preview : row.reply_preview,
      } : row);

      const privateUris = Array.from(new Set(rawMessages.flatMap((row: any) =>
        (row.attachments || [])
          .map((attachment: any) => attachment?.url)
          .filter((url: any) => isSafePrivateFileUri(url))
      ))).slice(0, 250);
      const signedMap = new Map<string, string>();
      await Promise.all(privateUris.map(async (fileUri: any) => {
        try {
          const signed = await svc.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 900 });
          if (signed?.signed_url) signedMap.set(fileUri, signed.signed_url);
        } catch {}
      }));
      const messages = rawMessages.map((row: any) => ({
        ...row,
        attachments: (row.attachments || []).map((attachment: any) => ({
          ...attachment,
          ...(signedMap.get(attachment?.url) ? { signed_url: signedMap.get(attachment.url) } : {}),
        })),
      }));
      return Response.json({ messages });
    }

    if (action === 'send_message') {
      if (isStaff && !(await hasPermission(base44, user, 'tickets.reply'))) return Response.json({ error: 'Sem permissão para responder tickets' }, { status: 403 });
      if (!isStaff && (ticket.status || 'novo') === 'fechado') return Response.json({ error: 'Ticket fechado' }, { status: 409 });
      const message = text(body.message, 5000);
      const attachments = safeAttachments(body.attachments);
      const mentions = safeMentions(body.mentions);
      const clientRequestId = text(body.client_request_id, 120);
      if (!message && attachments.length === 0) return Response.json({ error: 'Mensagem vazia' }, { status: 400 });

      if (clientRequestId) {
        const duplicates = await svc.entities.TicketMessage.filter({
          ticket_id: ticket.id,
          author_id: user.id,
          client_request_id: clientRequestId,
        }, '-created_date', 1).catch(() => []);
        if (duplicates?.[0]) {
          if (isStaff && (ticket.status || 'novo') !== 'aguardando_usuario') {
            await svc.entities.Ticket.update(ticket.id, { status: 'aguardando_usuario' }).catch(() => {});
          } else if (!isStaff && (ticket.status || 'novo') === 'aguardando_usuario') {
            await svc.entities.Ticket.update(ticket.id, { status: 'em_atendimento' }).catch(() => {});
          }
          return Response.json({ message: duplicates[0], deduplicated: true });
        }
      }
      let replyMeta: any = {};
      const replyToId = text(body.reply_to_id, 120);
      if (replyToId) {
        const rows = await svc.entities.TicketMessage.filter({ id: replyToId, ticket_id: ticket.id }, '-created_date', 1);
        const target = rows?.[0];
        if (target) replyMeta = {
          reply_to_id: target.id,
          reply_to_message_id: target.id,
          reply_author_name: target.author_name || 'Usuário',
          reply_preview: target.deleted ? 'Mensagem original removida.' : text(target.message, 180),
        };
      }
      const storedMessage = message || (attachments.length ? `${attachments[0].type === 'audio' ? 'Áudio' : 'Anexo'} enviado` : '');
      const existingRows = await svc.entities.TicketMessage.filter({ ticket_id: ticket.id }, 'created_date', 500).catch(() => []);
      const canonicalExisting = [...(existingRows || [])].sort((a: any, b: any) => {
        const aTime = new Date(a.created_date || a.created_at || 0).getTime() || 0;
        const bTime = new Date(b.created_date || b.created_at || 0).getTime() || 0;
        if (aTime !== bTime) return aTime - bTime;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });
      await Promise.all(canonicalExisting.map((row: any, index: number) => {
        const expected = index + 1;
        return Number(row.message_order) === expected
          ? Promise.resolve(null)
          : svc.entities.TicketMessage.update(row.id, { message_order: expected }).catch(() => null);
      }));
      const nextMessageOrder = canonicalExisting.length + 1;
      const created = await svc.entities.TicketMessage.create({
        ticket_id: ticket.id,
        ticket_owner_id: ownerId,
        author_id: user.id,
        author_role: user.role || 'user',
        message: storedMessage,
        author_name: isStaff ? `${actorName(user)} · Staff` : actorName(user),
        is_staff: isStaff,
        ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
        message_order: nextMessageOrder,
        edited: false,
        deleted: false,
        attachments,
        mentions,
        ...replyMeta,
      });
      const messagePreview = storedMessage || 'Mensagem';

      // Menções em tickets são persistidas/avisadas no próprio envio para não
      // depender de uma segunda chamada do frontend. Isso garante que o aviso
      // seja "mencionou você" e que o card do ticket receba o ícone de @.
      const mentionedIds: string[] = [];
      if (mentions.length) {
        const users = await svc.entities.User.list('-created_date', 500).catch(() => []);
        const allowedMentionIds = new Set((users || [])
          .filter((u: any) => STAFF_ROLES.has(u.role) || u.id === ownerId)
          .map((u: any) => u.id));
        for (const mention of mentions) {
          const targetId = mention?.id;
          if (!targetId || targetId === user.id || !allowedMentionIds.has(targetId)) continue;
          const dedupeKey = `ticket_message:${created.id}:${targetId}`;
          const existingMention = await svc.entities.Mention.filter({ dedupe_key: dedupeKey }, '-created_date', 1).catch(() => []);
          if (existingMention?.length) {
            mentionedIds.push(targetId);
            continue;
          }
          const contextUrl = STAFF_ROLES.has((users || []).find((u: any) => u.id === targetId)?.role)
            ? `/painel?view=staff&tab=tickets&ticket=${encodeURIComponent(ticket.id)}`
            : `/tickets?ticket=${encodeURIComponent(ticket.id)}`;
          const target = (users || []).find((u: any) => u.id === targetId);
          const targetIsStaff = STAFF_ROLES.has(target?.role);
          const notification = targetIsStaff
            ? await svc.entities.CoreOsNotification.create({
                title: `${actorName(user)} mencionou você`,
                body: `Você foi mencionado no ticket “${ticket.subject || 'Ticket'}”.`,
                severity: 'notice',
                category: 'support',
                audience_ids: [targetId],
                dedupe_key: `mention:${dedupeKey}`,
                source: 'tickets',
                action_url: contextUrl,
                read_by: [],
                expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
              }).catch(() => null)
            : await svc.entities.UserNotification.create({
                recipient_user_id: targetId,
                actor_user_id: user.id,
                actor_name: actorName(user),
                type: 'mention',
                title: `${actorName(user)} mencionou você`,
                body: `Você foi mencionado no ticket “${ticket.subject || 'Ticket'}”.`,
                context_url: contextUrl,
                context_type: 'ticket_message',
                context_id: created.id,
                read: false,
                dedupe_key: dedupeKey,
              }).catch(() => null);
          await svc.entities.Mention.create({
            content_type: 'ticket_message',
            content_id: created.id,
            ticket_id: ticket.id,
            author_user_id: user.id,
            mentioned_user_id: targetId,
            context_url: contextUrl,
            notification_id: notification?.id || '',
            dedupe_key: dedupeKey,
          }).catch(() => null);
          mentionedIds.push(targetId);
        }
      }

      if (isStaff) {
        // Resposta de Staff sempre torna o ticket ativo novamente. Isso evita
        // ficar impossível responder quando um status antigo/fechado foi persistido por engano.
        const patch: any = { status: 'aguardando_usuario' };
        if (!ticket.assigned_to_name) patch.assigned_to_name = actorName(user);
        await svc.entities.Ticket.update(ticket.id, patch);
        await staffLog(svc, user, 'respondeu_ticket', `Respondeu o ticket #${ticket.id.slice(-4)}`, ticket.id);
        await notifyRequester(svc, ownerId, ticket.id, 'Nova resposta no seu ticket', `${actorName(user)} respondeu: ${messagePreview.slice(0, 180)}`);
      } else {
        if ((ticket.status || 'novo') === 'aguardando_usuario') await svc.entities.Ticket.update(ticket.id, { status: 'em_atendimento' });
        await notifyStaff(
          svc,
          'Usuário respondeu um ticket',
          `${ticket.requester_name || actorName(user)} respondeu em “${ticket.subject}”.`,
          ticket.id,
          'notice',
          mentionedIds
        );
      }
      return Response.json({ message: created });
    }

    if (action === 'edit_message') {
      const messageId = text(body.message_id, 120);
      const rows = await svc.entities.TicketMessage.filter({ id: messageId, ticket_id: ticket.id }, '-created_date', 1);
      const item = rows?.[0];
      if (!item) return Response.json({ error: 'Mensagem não encontrada' }, { status: 404 });
      if (item.deleted) return Response.json({ error: 'Mensagem removida não pode ser editada' }, { status: 409 });
      if ((item.author_id || item.created_by_id) !== user.id) return Response.json({ error: 'Você só pode editar suas próprias mensagens' }, { status: 403 });
      const message = text(body.message, 5000);
      if (!message) return Response.json({ error: 'Mensagem vazia' }, { status: 400 });
      const updated = await svc.entities.TicketMessage.update(item.id, { message, edited: true, edited_at: new Date().toISOString() });
      if (isStaff) await staffLog(svc, user, 'ticket_message_edit', `Editou a própria mensagem no ticket #${ticket.id.slice(-4)}`, ticket.id);
      return Response.json({ message: updated });
    }

    if (action === 'pin_message') {
      const messageId = text(body.message_id, 120);
      const rows = await svc.entities.TicketMessage.filter({ id: messageId, ticket_id: ticket.id }, '-created_date', 1);
      const item = rows?.[0];
      if (!item) return Response.json({ error: 'Mensagem não encontrada' }, { status: 404 });
      if (item.deleted) return Response.json({ error: 'Mensagem removida não pode ser fixada' }, { status: 409 });
      const own = (item.author_id || item.created_by_id) === user.id;
      if (!own && (!isStaff || !(await hasPermission(base44, user, 'tickets.manage')))) {
        return Response.json({ error: 'Sem permissão para fixar esta mensagem' }, { status: 403 });
      }
      const nextPinned = body.pinned !== false;
      const changedIds: string[] = [];
      if (nextPinned) {
        const pinnedRows = await svc.entities.TicketMessage.filter({ ticket_id: ticket.id, pinned: true }, 'created_date', 50).catch(() => []);
        for (const pinnedRow of pinnedRows) {
          if (pinnedRow.id === item.id) continue;
          await svc.entities.TicketMessage.update(pinnedRow.id, {
            pinned: false,
            pinned_at: null,
            pinned_by: '',
            pinned_by_name: '',
          });
          changedIds.push(pinnedRow.id);
        }
      }
      const updated = await svc.entities.TicketMessage.update(item.id, {
        pinned: nextPinned,
        pinned_at: nextPinned ? new Date().toISOString() : null,
        pinned_by: nextPinned ? user.id : '',
        pinned_by_name: nextPinned ? actorName(user) : '',
      });
      if (isStaff) await staffLog(svc, user, nextPinned ? 'ticket_message_pin' : 'ticket_message_unpin', `${nextPinned ? 'Fixou' : 'Desfixou'} mensagem no ticket #${ticket.id.slice(-4)}`, ticket.id);
      return Response.json({ ok: true, message: updated, unpinned_ids: changedIds });
    }

    if (action === 'delete_message') {
      const messageId = text(body.message_id, 120);
      const rows = await svc.entities.TicketMessage.filter({ id: messageId, ticket_id: ticket.id }, '-created_date', 1);
      const item = rows?.[0];
      if (!item) return Response.json({ error: 'Mensagem não encontrada' }, { status: 404 });
      const own = (item.author_id || item.created_by_id) === user.id;
      if (!own && (!isStaff || !(await hasPermission(base44, user, 'tickets.manage')))) return Response.json({ error: 'Sem permissão para apagar esta mensagem' }, { status: 403 });
      if (item.deleted) {
        return Response.json({
          ok: true,
          already_deleted: true,
          message: { ...item, deleted: true, message: '', attachments: [] },
        });
      }
      const deletedAt = new Date().toISOString();
      const deletionPatch = {
        message: '[Mensagem removida]',
        attachments: [],
        deleted: true,
        deleted_at: deletedAt,
        deleted_by: user.id,
        deleted_by_role: user.role || 'user',
      };

      // A exclusão precisa ser a operação principal e idempotente. Alguns
      // efeitos secundários (reply preview/log) podem falhar sem jamais
      // transformar uma exclusão já concluída em erro para o cliente.
      let updated = await svc.entities.TicketMessage.update(item.id, deletionPatch);

      // Confirma persistência; se o backend estiver momentaneamente
      // inconsistente, reaplica uma vez antes de responder.
      const confirmRows = await svc.entities.TicketMessage.filter({ id: item.id, ticket_id: ticket.id }, '-created_date', 1).catch(() => []);
      let confirmed = confirmRows?.[0];
      if (confirmed && confirmed.deleted !== true) {
        updated = await svc.entities.TicketMessage.update(item.id, deletionPatch);
        const retryRows = await svc.entities.TicketMessage.filter({ id: item.id, ticket_id: ticket.id }, '-created_date', 1).catch(() => []);
        confirmed = retryRows?.[0] || updated;
      }

      if (!confirmed || confirmed.deleted !== true) {
        return Response.json({ error: 'Não foi possível confirmar a exclusão da mensagem' }, { status: 503 });
      }

      const replies = await svc.entities.TicketMessage.filter({ ticket_id: ticket.id, reply_to_id: item.id }, 'created_date', 250).catch(() => []);
      await Promise.allSettled((replies || []).map((reply: any) =>
        svc.entities.TicketMessage.update(reply.id, { reply_preview: 'Mensagem original removida.' })
      ));
      if (isStaff) await staffLog(svc, user, 'ticket_message_delete', `Removeu mensagem de ${item.author_name || 'usuário'} no ticket #${ticket.id.slice(-4)}`, ticket.id);

      return Response.json({
        ok: true,
        message: { ...confirmed, ...updated, deleted: true, message: '', attachments: [] },
      });
    }

    if (action === 'request_help' || action === 'transfer_ticket') {
      if (!isStaff || !(await hasPermission(base44, user, 'tickets.manage'))) return Response.json({ error: 'Sem permissão para gerenciar tickets' }, { status: 403 });
      const targetUserId = text(body.target_user_id, 120);
      if (!targetUserId) return Response.json({ error: 'Staff de destino obrigatório' }, { status: 400 });
      const targets = await svc.entities.User.filter({ id: targetUserId }, '-created_date', 1);
      const target = targets?.[0];
      if (!target || !STAFF_ROLES.has(target.role)) return Response.json({ error: 'Staff de destino inválido' }, { status: 400 });
      const targetName = actorName(target);
      const view = target.role === 'owner' ? 'owner' : 'staff';
      const actionUrl = `/painel?view=${view}&tab=tickets&ticket=${encodeURIComponent(ticket.id)}`;

      if (action === 'transfer_ticket') {
        const updated = await svc.entities.Ticket.update(ticket.id, { assigned_to_name: targetName, status: 'em_atendimento' });
        await svc.entities.UserNotification.create({
          recipient_user_id: target.id,
          actor_user_id: user.id,
          actor_name: actorName(user),
          type: 'system',
          title: 'Ticket transferido para você',
          body: `${actorName(user)} transferiu “${ticket.subject || 'Ticket'}” para seu atendimento.`,
          context_url: actionUrl,
          context_type: 'ticket',
          context_id: ticket.id,
          read: false,
          dedupe_key: `ticket-transfer:${ticket.id}:${target.id}:${Date.now()}`,
        }).catch(() => {});
        await staffLog(svc, user, 'ticket_transferido', `Transferiu o ticket #${ticket.id.slice(-4)} para ${targetName}`, ticket.id);
        return Response.json({ ok: true, ticket: updated, target: { id: target.id, name: targetName } });
      }

      await svc.entities.UserNotification.create({
        recipient_user_id: target.id,
        actor_user_id: user.id,
        actor_name: actorName(user),
        type: 'system',
        title: 'Ajuda solicitada em ticket',
        body: `${actorName(user)} pediu sua ajuda em “${ticket.subject || 'Ticket'}”.`,
        context_url: actionUrl,
        context_type: 'ticket',
        context_id: ticket.id,
        read: false,
        dedupe_key: `ticket-help:${ticket.id}:${target.id}:${Date.now()}`,
      }).catch(() => {});
      await svc.entities.CoreOsNotification.create({
        title: 'Ajuda solicitada em ticket',
        body: `${actorName(user)} pediu ajuda de ${targetName} em “${ticket.subject || 'Ticket'}”.`,
        severity: 'notice',
        category: 'support',
        audience_ids: [target.id],
        dedupe_key: `ticket-help-core:${ticket.id}:${target.id}:${Date.now()}`,
        source: 'tickets',
        action_url: actionUrl,
        read_by: [],
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }).catch(() => {});
      await staffLog(svc, user, 'ticket_ajuda_solicitada', `Solicitou ajuda de ${targetName} no ticket #${ticket.id.slice(-4)}`, ticket.id);
      return Response.json({ ok: true, target: { id: target.id, name: targetName } });
    }

    if (action === 'reorder_ticket' || action === 'reorder_ticket_list') {
      if (!isStaff || !(await hasPermission(base44, user, 'tickets.manage'))) {
        return Response.json({ error: 'Sem permissão para gerenciar tickets' }, { status: 403 });
      }

      const orderedIds = (Array.isArray(body.ordered_ids) ? body.ordered_ids : [])
        .map((id: any) => text(id, 120))
        .filter(Boolean)
        .slice(0, 300);

      const uniqueIds = Array.from(new Set(orderedIds));
      if (!uniqueIds.length || !uniqueIds.includes(ticket.id)) {
        return Response.json({ error: 'Ordem de tickets inválida' }, { status: 400 });
      }

      const status = text(body.status, 40);
      if (action === 'reorder_ticket' && !STATUSES.has(status)) {
        return Response.json({ error: 'Status inválido' }, { status: 400 });
      }
      const closeReason = text(body.reason, 500);
      const closingByDrag = action === 'reorder_ticket' && status === 'fechado' && (ticket.status || 'novo') !== 'fechado';
      if (closingByDrag && !closeReason) {
        return Response.json({ error: 'Informe o motivo do fechamento do ticket' }, { status: 400 });
      }

      const movedIndex = Math.max(0, uniqueIds.indexOf(ticket.id));
      if (action === 'reorder_ticket') {
        const restoringArchived = ticket.deleted === true && status !== 'fechado';
        const movedPatch: any = { status, kanban_order: movedIndex + 1 };
        if (restoringArchived) {
          await clearTicketMentionBadges(svc, ticket.id);
          movedPatch.deleted = false;
          movedPatch.deleted_at = null;
          movedPatch.deleted_by = '';
          movedPatch.deleted_by_name = '';
          movedPatch.delete_reason = '';
        }
        if ((ticket.status || 'novo') === 'fechado' && status !== 'fechado') {
          await clearTicketMentionBadges(svc, ticket.id);
          movedPatch.closed_at = null;
          movedPatch.closed_by = '';
          movedPatch.closed_by_name = '';
          movedPatch.close_reason = '';
        }
        if (closingByDrag) {
          movedPatch.close_reason = closeReason;
          movedPatch.closed_at = new Date().toISOString();
          movedPatch.closed_by = user.id;
          movedPatch.closed_by_name = actorName(user);
        }
        await svc.entities.Ticket.update(ticket.id, movedPatch);
      }

      const updates = [];
      for (let index = 0; index < uniqueIds.length; index += 1) {
        const id = uniqueIds[index];
        if (id === ticket.id) continue;
        const rows = await svc.entities.Ticket.filter({ id }, '-created_date', 1).catch(() => []);
        const target = rows?.[0];
        if (!target || target.deleted === true) continue;
        const patch: any = action === 'reorder_ticket'
          ? { kanban_order: index + 1 }
          : { ticket_list_order: index + 1 };
        updates.push(svc.entities.Ticket.update(id, patch));
      }
      await Promise.all(updates);
      await staffLog(
        svc,
        user,
        action === 'reorder_ticket' ? 'ticket_reordenado' : 'ticket_lista_reordenada',
        action === 'reorder_ticket'
          ? `${ticket.deleted === true && status !== 'fechado' ? 'Restaurou e moveu' : 'Reordenou'} ticket #${ticket.id.slice(-4)} no Kanban`
          : `Reordenou ticket #${ticket.id.slice(-4)} na lista de tickets`,
        ticket.id
      );
      return Response.json({ ok: true });
    }

    if (action === 'restore_ticket') {
      if (!isStaff || !(await hasPermission(base44, user, 'tickets.manage'))) {
        return Response.json({ error: 'Sem permissão para restaurar tickets' }, { status: 403 });
      }
      if (ticket.deleted !== true) return Response.json({ ticket, already_restored: true });
      await clearTicketMentionBadges(svc, ticket.id);
      const restored = await svc.entities.Ticket.update(ticket.id, {
        deleted: false,
        deleted_at: null,
        deleted_by: '',
        deleted_by_name: '',
        delete_reason: '',
        status: 'em_atendimento',
        closed_at: null,
        closed_by: '',
        closed_by_name: '',
        close_reason: '',
      });
      await staffLog(svc, user, 'ticket_restaurado', `Restaurou o ticket #${ticket.id.slice(-4)} para atendimento`, ticket.id);
      return Response.json({ ok: true, ticket: restored });
    }

    if (action === 'update_ticket') {
      const status = text(body.status, 40);
      const reason = text(body.reason, 500);
      const patch: any = {};
      if (isStaff) {
        if (!(await hasPermission(base44, user, 'tickets.manage'))) return Response.json({ error: 'Sem permissão para gerenciar tickets' }, { status: 403 });
        if (status && STATUSES.has(status)) {
          patch.status = status;
          if (OPEN.has(status) && !OPEN.has(ticket.status || 'novo')) {
            await clearTicketMentionBadges(svc, ticket.id);
            // Reabertura pela Staff deve limpar os metadados do fechamento.
            patch.closed_at = null;
            patch.closed_by = '';
            patch.closed_by_name = '';
            patch.close_reason = '';
          }
        }
        if (status === 'fechado' && (ticket.status || 'novo') !== 'fechado') {
          if (!reason) return Response.json({ error: 'Informe o motivo do fechamento do ticket' }, { status: 400 });
          patch.close_reason = reason;
          patch.closed_at = new Date().toISOString();
          patch.closed_by = user.id;
          patch.closed_by_name = actorName(user);
        }
        const assigned = text(body.assigned_to_name, 120);
        if (assigned) patch.assigned_to_name = assigned;
        const subject = text(body.subject, 120);
        if (subject) patch.subject = subject;
        const priority = text(body.priority, 20);
        if (['low', 'normal', 'high', 'urgent'].includes(priority)) patch.priority = priority;

        const kanbanOrder = Number(body.kanban_order);
        if (Number.isFinite(kanbanOrder) && kanbanOrder >= 0) patch.kanban_order = Math.floor(kanbanOrder);

        const ticketListOrder = Number(body.ticket_list_order);
        if (Number.isFinite(ticketListOrder) && ticketListOrder >= 0) patch.ticket_list_order = Math.floor(ticketListOrder);
      } else {
        if (status === 'fechado') {
          if (!reason) return Response.json({ error: 'Informe o motivo do fechamento do ticket' }, { status: 400 });
          patch.status = status;
          patch.close_reason = reason;
          patch.closed_at = new Date().toISOString();
          patch.closed_by = user.id;
          patch.closed_by_name = actorName(user);
        } else if (status === 'novo') {
          // Anti-spam: quando o próprio usuário acabou de fechar o ticket,
          // precisa aguardar 60s antes de reabrir. Staff/Owner não passa por
          // este bloco e pode reabrir imediatamente.
          if (ticket.closed_by === user.id && ticket.closed_at) {
            const closedAtMs = new Date(ticket.closed_at).getTime();
            if (Number.isFinite(closedAtMs)) {
              const elapsedSeconds = Math.floor((Date.now() - closedAtMs) / 1000);
              const retryAfterSeconds = Math.max(0, 60 - elapsedSeconds);
              if (retryAfterSeconds > 0) {
                return Response.json({
                  error: `Aguarde ${retryAfterSeconds}s para reabrir este ticket.`,
                  code: 'ticket_reopen_cooldown',
                  retry_after_seconds: retryAfterSeconds,
                }, {
                  status: 429,
                  headers: { 'Retry-After': String(retryAfterSeconds) },
                });
              }
            }
          }

          const mine = await svc.entities.Ticket.filter({ requester_user_id: user.id }, '-created_date', 200).catch(() => []);
          const otherOpen = (mine || []).find((candidate: any) =>
            candidate.id !== ticket.id &&
            candidate.deleted !== true &&
            ['novo', 'em_atendimento', 'aguardando_usuario'].includes(candidate.status || 'novo')
          );
          if (otherOpen) {
            return Response.json({
              error: 'Você já possui outro ticket em aberto. Feche ou continue nele antes de reabrir este.',
              open_ticket_id: otherOpen.id,
            }, { status: 409 });
          }
          patch.status = status;
          patch.closed_at = null;
          patch.closed_by = '';
          patch.closed_by_name = '';
          patch.close_reason = '';
          await clearTicketMentionBadges(svc, ticket.id);
        } else return Response.json({ error: 'Alteração não permitida' }, { status: 403 });
      }
      if (!Object.keys(patch).length) return Response.json({ error: 'Nenhuma alteração válida' }, { status: 400 });
      let updated: any = null;
      if (!isStaff) {
        try {
          // Usuário comum atualiza o próprio ticket pela sessão autenticada/RLS.
          // Isso evita depender do service role no domínio publicado.
          updated = await base44.entities.Ticket.update(ticket.id, patch);
        } catch (error) {
          console.error('[ticketOps] authenticated ticket update failed', error);
        }
      }
      if (!updated) updated = await svc.entities.Ticket.update(ticket.id, patch);
      if (isStaff) await staffLog(svc, user, 'status_ticket', `Ticket #${ticket.id.slice(-4)} atualizado`, ticket.id);
      return Response.json({ ticket: updated || { ...ticket, ...patch } });
    }

    if (action === 'delete_ticket') {
      if (!isStaff || !(await hasPermission(base44, user, 'tickets.delete'))) return Response.json({ error: 'Sem permissão para apagar tickets' }, { status: 403 });
      if (ticket.deleted) return Response.json({ ok: true });
      const reason = text(body.reason, 500);
      if (!reason) return Response.json({ error: 'Informe o motivo do arquivamento do ticket' }, { status: 400 });
      await svc.entities.Ticket.update(ticket.id, {
        deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        deleted_by_name: actorName(user),
        delete_reason: reason,
        status: 'fechado',
      });
      await staffLog(svc, user, 'ticket_deleted', `Arquivou o ticket #${ticket.id.slice(-4)} — ${ticket.subject || ''}${reason ? ` — Motivo: ${reason}` : ''}`, ticket.id);
      return Response.json({ ok: true, soft_deleted: true });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha na operação do ticket' }, { status: 500 });
  }
}
