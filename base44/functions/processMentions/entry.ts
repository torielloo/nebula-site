import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';
import { hasPermission } from '../../shared/permissions.ts';

const ALLOWED_TYPES = new Set(['direct_message', 'ticket_message', 'ticket', 'moderation_note']);
const STAFF_ROLES = new Set(['support', 'staff', 'moderator', 'admin', 'dev', 'owner']);

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me().catch(() => null);
    if (!actor) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, { route: 'processMentions', user: actor, body, limit: 12, windowMs: 60_000, maxBodyBytes: 5_000 });
    if (!(await hasPermission(base44, actor, 'mentions.use'))) return Response.json({ error: 'Sem permissão para menções' }, { status: 403 });

    const contentType = typeof body.content_type === 'string' && ALLOWED_TYPES.has(body.content_type) ? body.content_type : null;
    const contentId = typeof body.content_id === 'string' ? body.content_id.trim().slice(0, 160) : '';
    const contextUrl = typeof body.context_url === 'string' ? body.context_url.trim().slice(0, 500) : '';
    const ids = Array.isArray(body.mentioned_user_ids)
      ? [...new Set(body.mentioned_user_ids.filter((v: any) => typeof v === 'string').map((v: string) => v.trim()).filter(Boolean))]
      : [];

    if (!contentType || !contentId) return Response.json({ error: 'Conteúdo inválido' }, { status: 400 });
    if (contextUrl && (!contextUrl.startsWith('/') || contextUrl.startsWith('//'))) {
      return Response.json({ error: 'Destino da menção inválido' }, { status: 400 });
    }
    if (ids.length > 5) return Response.json({ error: 'Limite de 5 menções por mensagem' }, { status: 429 });

    const svc = base44.asServiceRole;
    let allowedIds: Set<string> | null = null;
    let ticketIdForMention = '';

    if (contentType === 'direct_message') {
      const messages = await svc.entities.DirectMessage.filter({ id: contentId }, '-created_date', 1);
      const message = messages?.[0];
      if (!message || message.sender_id !== actor.id) return Response.json({ error: 'Mensagem inválida para menção' }, { status: 403 });
      allowedIds = new Set((message.participants || []).filter((id: any) => typeof id === 'string'));
    }

    if (contentType === 'ticket_message' || contentType === 'ticket') {
      let ticket: any = null;
      if (contentType === 'ticket_message') {
        const rows = await svc.entities.TicketMessage.filter({ id: contentId }, '-created_date', 1);
        const message = rows?.[0];
        if (!message) return Response.json({ error: 'Mensagem de ticket inexistente' }, { status: 404 });
        const messageAuthorId = message.author_id || message.created_by_id;
        if (messageAuthorId && messageAuthorId !== actor.id && !STAFF_ROLES.has(actor.role)) {
          return Response.json({ error: 'Sem permissão para processar menções desta mensagem' }, { status: 403 });
        }
        const tickets = await svc.entities.Ticket.filter({ id: message.ticket_id }, '-created_date', 1);
        ticket = tickets?.[0];
      } else {
        const tickets = await svc.entities.Ticket.filter({ id: contentId }, '-created_date', 1);
        ticket = tickets?.[0];
      }
      if (!ticket) return Response.json({ error: 'Ticket inexistente' }, { status: 404 });
      ticketIdForMention = ticket.id || '';
      const requesterId = ticket.requester_user_id || ticket.created_by_id;
      if (actor.id !== requesterId && !STAFF_ROLES.has(actor.role)) {
        return Response.json({ error: 'Sem permissão para processar menções deste ticket' }, { status: 403 });
      }
      const users = await svc.entities.User.list('-created_date', 300);
      allowedIds = new Set(users.filter((u: any) => STAFF_ROLES.has(u.role) || u.id === requesterId).map((u: any) => u.id));
    }

    if (contentType === 'moderation_note') {
      if (!STAFF_ROLES.has(actor.role)) {
        return Response.json({ error: 'Menções administrativas exigem Staff' }, { status: 403 });
      }
      const rows = await svc.entities.ModerationNote.filter({ id: contentId }, '-created_date', 1);
      const note = rows?.[0];
      if (!note) return Response.json({ error: 'Nota de moderação inexistente' }, { status: 404 });
      if (note.author_id !== actor.id) {
        return Response.json({ error: 'Sem permissão para processar menções desta nota' }, { status: 403 });
      }
      allowedIds = new Set([note.user_id].filter((id) => typeof id === 'string' && id));
    }

    const targets: any[] = [];
    for (const id of ids) {
      if (id === actor.id) continue;
      if (allowedIds && !allowedIds.has(id)) continue;
      const rows = await svc.entities.User.filter({ id }, '-created_date', 1);
      if (rows?.[0]) targets.push(rows[0]);
    }

    const actorName = actor.profile?.display_name || actor.profile?.name || actor.full_name || 'Alguém';
    const actorAvatar = actor.profile?.avatar_url || actor.profile?.discord_avatar_url || '';
    const created: string[] = [];
    for (const target of targets) {
      const dedupeKey = `${contentType}:${contentId}:${target.id}`;
      const existing = await svc.entities.Mention.filter({ dedupe_key: dedupeKey }, '-created_date', 1).catch(() => []);
      if (existing?.length) continue;
      const notification = await svc.entities.UserNotification.create({
        recipient_user_id: target.id,
        actor_user_id: actor.id,
        actor_name: actorName,
        actor_avatar: actorAvatar,
        type: 'mention',
        title: `${actorName} mencionou você`,
        body: contentType === 'ticket_message' ? 'Você foi mencionado em um ticket.' : 'Você foi mencionado em uma mensagem.',
        context_url: contextUrl,
        context_type: contentType,
        context_id: contentId,
        read: false,
        dedupe_key: dedupeKey,
      });
      await svc.entities.Mention.create({
        content_type: contentType,
        content_id: contentId,
        ...(ticketIdForMention ? { ticket_id: ticketIdForMention } : {}),
        author_user_id: actor.id,
        mentioned_user_id: target.id,
        context_url: contextUrl,
        notification_id: notification.id,
        dedupe_key: dedupeKey,
      });
      created.push(target.id);
    }
    return Response.json({ ok: true, mentioned_user_ids: created, count: created.length });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao processar menções' }, { status: 500 });
  }
}