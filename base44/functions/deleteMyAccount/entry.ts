import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    await guardRequest(req, base44, { route: 'deleteMyAccount', user, body: {}, strict: true, limit: 3, windowMs: 60_000, maxBodyBytes: 1000 });
    const uid = user.id;
    const svc = base44.asServiceRole;

    // Apaga todo o conteúdo criado pelo usuário, restrito ao próprio id
    await svc.entities.Ticket.deleteMany({ created_by_id: uid });
    await svc.entities.TicketMessage.deleteMany({ created_by_id: uid });
    await svc.entities.NitroRequest.deleteMany({ user_id: uid });
    await svc.entities.DirectMessage.deleteMany({ participants: uid });
    await svc.entities.MessageReaction.deleteMany({ author_id: uid });
    await svc.entities.Sticker.deleteMany({ author_id: uid });
    await svc.entities.Report.deleteMany({ created_by_id: uid });
    await svc.entities.UiSetting.deleteMany({ created_by_id: uid });
    await svc.entities.Conversation.deleteMany({ participants: uid });

    // Limpa o perfil anexado à conta
    try {
      await base44.auth.updateMe({ profile: {} });
    } catch (e) {}

    // Exclui a conta em si, se a plataforma permitir
    let accountDeleted = false;
    try {
      await svc.entities.User.delete(uid);
      accountDeleted = true;
    } catch (e) {}

    return Response.json({ ok: true, accountDeleted });
  } catch (error) {
    const blocked = securityResponse(error); if (blocked) return blocked;
    return Response.json({ error: error.message }, { status: 500 });
  }
}