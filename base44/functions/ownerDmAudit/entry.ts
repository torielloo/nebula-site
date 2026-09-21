import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const clean = (value: unknown, max = 120) => String(value || '').trim().slice(0, max);

function displayName(user: any) {
  const p = user?.profile || {};
  return p.display_name || p.name || p.discord_username || user?.full_name || 'Usuário';
}

function avatarOf(user: any) {
  const p = user?.profile || {};
  return p.avatar_url || p.discord_avatar_url || '';
}

async function audit(svc: any, user: any, action: string, details: string, targetId = '') {
  await svc.entities.StaffLog.create({
    actor_name: displayName(user),
    actor_id: user.id,
    action,
    details: details.slice(0, 1000),
    target_id: targetId,
  }).catch(() => null);
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    if (user.role !== 'owner') return Response.json({ error: 'Acesso exclusivo de Owner' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    try {
      await guardRequest(req, base44, {
        route: 'ownerDmAudit',
        user,
        body,
        strict: false,
        limit: 100,
        windowMs: 60_000,
        maxBodyBytes: 5000,
      });
    } catch (guardError) {
      const blocked = securityResponse(guardError);
      if (blocked) return blocked;
      console.error("[ownerDmAudit] guard infrastructure failure", guardError);
    }

    const svc = base44.asServiceRole;
    const action = clean(body?.action || 'list_conversations', 40);

    if (action === 'list_conversations') {
      let rows: any[] = [];
      try {
        rows = await svc.entities.Conversation.list('-updated_date', 500);
      } catch (error) {
        console.error("[ownerDmAudit] service conversation list failed", error);
        rows = await base44.entities.Conversation.list('-updated_date', 500).catch(() => []);
      }
      const users = await svc.entities.User.list('-updated_date', 500).catch(() => []);
      const userMap = new Map((users || []).map((u: any) => [u.id, u]));
      const grouped = new Map<string, any>();
      for (const row of (rows || [])) {
        if (!Array.isArray(row.participants) || row.participants.length !== 2 || row.participants.includes('core-os')) continue;
        const pairKey = [...row.participants].sort().join(':');
        const existing = grouped.get(pairKey);
        if (!existing || new Date(row.updated_date || row.created_date || 0).getTime() > new Date(existing.updated_date || existing.created_date || 0).getTime()) {
          grouped.set(pairKey, row);
        }
      }
      const conversations = [...grouped.values()].map((row: any) => ({
        id: row.id,
        participants: row.participants,
        participant_meta: (row.participants || []).map((id: string) => {
          const target = userMap.get(id);
          const stored = (row.participant_meta || []).find((meta: any) => meta?.id === id) || {};
          return {
            id,
            name: target ? displayName(target) : (stored.name || 'Usuário'),
            avatar: target ? avatarOf(target) : (stored.avatar || ''),
          };
        }),
        last_message: row.last_message || '',
        last_sender_id: row.last_sender_id || '',
        updated_date: row.updated_date || row.created_date || '',
        created_date: row.created_date || '',
      }));
      await audit(svc, user, 'owner_dm_audit_list', `Consultou índice de conversas privadas (${conversations.length})`);
      return Response.json({ conversations, read_only: true });
    }

    if (action === 'list_messages') {
      const conversationId = clean(body?.conversation_id, 120);
      if (!conversationId) return Response.json({ error: 'Conversa inválida' }, { status: 400 });
      let conversations: any[] = [];
      try {
        conversations = await svc.entities.Conversation.filter({ id: conversationId }, '-updated_date', 1);
      } catch (error) {
        console.error("[ownerDmAudit] conversation lookup failed", error);
        conversations = await base44.entities.Conversation.filter({ id: conversationId }, '-updated_date', 1).catch(() => []);
      }
      const conversation = conversations?.[0];
      if (!conversation || !Array.isArray(conversation.participants) || conversation.participants.length !== 2 || conversation.participants.includes('core-os')) {
        return Response.json({ error: 'Conversa não encontrada' }, { status: 404 });
      }

      const participantUsers = await Promise.all(
        (conversation.participants || []).map(async (id: string) => {
          const rows = await svc.entities.User.filter({ id }, '-updated_date', 1).catch(() => []);
          return rows?.[0] || null;
        })
      );
      const userMap = new Map(participantUsers.filter(Boolean).map((u: any) => [u.id, u]));
      const hydratedConversation = {
        ...conversation,
        participant_meta: (conversation.participants || []).map((id: string) => {
          const target = userMap.get(id);
          const stored = (conversation.participant_meta || []).find((meta: any) => meta?.id === id) || {};
          return {
            id,
            name: target ? displayName(target) : (stored.name || 'Usuário'),
            avatar: target ? avatarOf(target) : (stored.avatar || ''),
          };
        }),
      };

      let rows: any[] = [];
      try {
        rows = await svc.entities.DirectMessage.filter({ conversation_id: conversationId }, 'created_date', 500);
      } catch (error) {
        console.error("[ownerDmAudit] direct message lookup failed", error);
        rows = await base44.entities.DirectMessage.filter({ conversation_id: conversationId }, 'created_date', 500).catch(() => []);
      }
      const messages = (rows || []).map((row: any) => {
        const sender = userMap.get(row.sender_id);
        return {
          id: row.id,
          sender_id: row.sender_id,
          sender_name: sender ? displayName(sender) : (row.sender_name || 'Usuário'),
          sender_avatar: sender ? avatarOf(sender) : (row.sender_avatar || ''),
          content: row.deleted ? '[Mensagem removida]' : (row.content || ''),
          attachments: row.deleted ? [] : (row.attachments || []),
          created_date: row.created_date || '',
          edited: Boolean(row.edited),
          deleted: Boolean(row.deleted),
          reply_to_id: row.reply_to_id || '',
          reply_author_name: row.reply_author_name || '',
          reply_preview: row.reply_preview || '',
        };
      });
      await audit(svc, user, 'owner_dm_audit_open', `Abriu conversa privada em modo somente leitura (${messages.length} mensagens)`, conversationId);
      return Response.json({ conversation: hydratedConversation, messages, read_only: true });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao consultar auditoria de mensagens privadas' }, { status: 500 });
  }
}
