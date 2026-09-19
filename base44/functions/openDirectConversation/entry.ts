import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const text = (v: any, max = 120) => typeof v === 'string' ? v.trim().slice(0, max) : '';

function nameOf(user: any) {
  const p = user?.profile || {};
  return p.display_name || p.name || p.discord_username || user?.full_name || 'Usuário';
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, { route: 'openDirectConversation', user, body, limit: 20, windowMs: 60_000, maxBodyBytes: 2_000 });
    const targetId = text(body.user_id, 120);
    if (!targetId || targetId === user.id || targetId === 'core-os') return Response.json({ error: 'Usuário inválido' }, { status: 400 });

    const svc = base44.asServiceRole;
    const targets = await svc.entities.User.filter({ id: targetId }, '-created_date', 1);
    const target = targets?.[0];
    if (!target) return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });

    const pairKey = [user.id, targetId].sort().join(':');
    const conversations = await svc.entities.Conversation.list('created_date', 500);
    const matches = conversations.filter((conv: any) => {
      const participants = Array.isArray(conv.participants) ? conv.participants : [];
      if (conv.pair_key === pairKey) return true;
      return participants.length === 2 && participants.includes(user.id) && participants.includes(targetId) && !participants.includes('core-os');
    });

    // A conversa mais antiga é a canônica: preserva todo o histórico original
    // e impede que reaberturas/criações concorrentes fragmentem o privado.
    let conversation = matches[0] || null;

    if (!conversation) {
      conversation = await svc.entities.Conversation.create({
        participants: [user.id, targetId],
        participant_meta: [
          { id: user.id, name: nameOf(user), avatar: user?.profile?.avatar_url || '' },
          { id: targetId, name: nameOf(target), avatar: target?.profile?.avatar_url || '' },
        ],
        pair_key: pairKey,
        last_message: '',
        last_sender_id: user.id,
      });
    } else {
      const canonicalMeta = [
        { id: user.id, name: nameOf(user), avatar: user?.profile?.avatar_url || '' },
        { id: targetId, name: nameOf(target), avatar: target?.profile?.avatar_url || '' },
      ];
      await svc.entities.Conversation.update(conversation.id, {
        participants: [user.id, targetId],
        participant_meta: canonicalMeta,
        pair_key: pairKey,
      }).catch(() => {});
      conversation = { ...conversation, participants: [user.id, targetId], participant_meta: canonicalMeta, pair_key: pairKey };
    }

    // Autocura de duplicatas antigas: move mensagens/reactions para a conversa
    // canônica antes de remover os registros repetidos.
    const duplicates = matches.filter((conv: any) => conv.id !== conversation.id);
    for (const duplicate of duplicates) {
      const messages = await svc.entities.DirectMessage.filter({ conversation_id: duplicate.id }, 'created_date', 500).catch(() => []);
      for (const message of messages || []) {
        await svc.entities.DirectMessage.update(message.id, { conversation_id: conversation.id }).catch(() => {});
      }
      const reactions = await svc.entities.MessageReaction.filter({ conversation_id: duplicate.id }, 'created_date', 500).catch(() => []);
      for (const reaction of reactions || []) {
        await svc.entities.MessageReaction.update(reaction.id, { conversation_id: conversation.id }).catch(() => {});
      }
      await svc.entities.Conversation.delete(duplicate.id).catch(() => {});
    }

    return Response.json({ conversation, merged_duplicates: duplicates.length });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao abrir conversa privada' }, { status: 500 });
  }
}
