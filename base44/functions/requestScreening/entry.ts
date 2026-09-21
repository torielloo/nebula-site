import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const MOD_ROLES = new Set(['moderator', 'staff', 'admin', 'dev', 'owner']);
const clean = (value: unknown, max = 500) => String(value || '').trim().slice(0, max);

function nameOf(user: any) {
  const p = user?.profile || {};
  return p.display_name || p.name || p.discord_username || user?.full_name || 'Staff Nébula';
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    if (!MOD_ROLES.has(String(user.role || ''))) {
      return Response.json({ error: 'Apenas Moderador ou cargo superior pode solicitar telagem' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, {
      route: 'requestScreening',
      user,
      body,
      strict: true,
      limit: 12,
      windowMs: 60_000,
      maxBodyBytes: 5000,
    });

    const targetId = clean(body?.user_id, 120);
    const reason = clean(body?.reason, 350);
    if (!targetId || targetId === user.id || targetId === 'core-os') {
      return Response.json({ error: 'Usuário inválido' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const targets = await svc.entities.User.filter({ id: targetId }, '-created_date', 1);
    const target = targets?.[0];
    if (!target) return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });

    const pairKey = [user.id, targetId].sort().join(':');
    const conversations = await svc.entities.Conversation.list('created_date', 500);
    let conversation = (conversations || []).find((conv: any) => {
      const participants = Array.isArray(conv.participants) ? conv.participants : [];
      return conv.pair_key === pairKey || (participants.length === 2 && participants.includes(user.id) && participants.includes(targetId));
    });

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
    }

    const recent = await svc.entities.DirectMessage.filter({ conversation_id: conversation.id, sender_id: user.id }, '-created_date', 20).catch(() => []);
    const duplicate = (recent || []).find((message: any) => {
      const age = Date.now() - new Date(message.created_date || 0).getTime();
      return age < 5 * 60_000 && String(message.content || '').includes('SOLICITAÇÃO DE TELAGEM');
    });
    if (duplicate) {
      return Response.json({ error: 'Já existe uma solicitação de telagem enviada por você nos últimos 5 minutos.' }, { status: 409 });
    }

    const targetName = nameOf(target);
    const staffName = nameOf(user);
    const reasonLine = reason ? `Motivo informado pela moderação: ${reason}

` : '';
    const message = [
      `🛡️ NÉBULA OFICIAL · MODERAÇÃO`,
      `⚠️ @${targetName} — SOLICITAÇÃO DE TELAGEM`,
      '',
      'A equipe de moderação do Nébula precisa realizar uma verificação de segurança com você. Esta solicitação pode ocorrer por atividade considerada suspeita, denúncias recebidas ou necessidade de confirmar a integridade do ambiente.',
      '',
      'Você tem 5 minutos, a partir desta mensagem, para entrar no Discord oficial do Nébula e subir na call/canal “Aguardando Telagem”. Um administrador ou moderador autorizado irá orientar os próximos passos.',
      '',
      reasonLine.trim(),
      'Não envie senhas, códigos de autenticação ou informações bancárias. A telagem deve se limitar à verificação necessária e ser conduzida por um membro autorizado da equipe.',
      '',
      `Solicitado por: ${staffName} · Moderação Nébula`,
      '✅ Esta mensagem foi gerada pelo sistema oficial de moderação do Nébula e fica registrada nos logs administrativos.',
    ].filter(Boolean).join('\n');

    const created = await svc.entities.DirectMessage.create({
      conversation_id: conversation.id,
      sender_id: user.id,
      sender_name: `Moderação · ${staffName}`,
      sender_avatar: user?.profile?.avatar_url || '',
      content: message,
      attachments: [],
      participants: [user.id, targetId],
      mentions: [{ id: targetId, name: targetName }],
      edited: false,
      deleted: false,
    });

    await svc.entities.Conversation.update(conversation.id, {
      last_message: '⚠️ Solicitação de telagem — compareça ao Discord em até 5 minutos.',
      last_sender_id: user.id,
      participant_meta: [
        { id: user.id, name: nameOf(user), avatar: user?.profile?.avatar_url || '' },
        { id: targetId, name: nameOf(target), avatar: target?.profile?.avatar_url || '' },
      ],
      pair_key: pairKey,
    }).catch(() => null);

    await svc.entities.StaffLog.create({
      actor_name: staffName,
      actor_id: user.id,
      action: 'screening_request',
      details: `Solicitou telagem para ${targetName} (${targetId}). Prazo informado: 5 minutos.${reason ? ` Motivo: ${reason}` : ''}`.slice(0, 1000),
      target_id: targetId,
    }).catch(() => null);

    return Response.json({ ok: true, conversation_id: conversation.id, message: created });
  } catch (error: any) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao enviar solicitação de telagem' }, { status: 500 });
  }
}
