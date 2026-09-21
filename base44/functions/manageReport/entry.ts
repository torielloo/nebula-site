import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';
import { hasPermission } from '../../shared/permissions.ts';

const STATUS = new Set(['new', 'pending', 'in_review', 'awaiting_info', 'confirmed', 'approved', 'rejected', 'resolved']);
const PRIORITY = new Set(['low', 'normal', 'high', 'urgent']);
const clean = (v: any, max = 1000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const actorName = (u: any) => u?.profile?.display_name || u?.profile?.name || u?.full_name || u?.email || u?.id || 'Staff';

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me().catch(() => null);
    if (!actor) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    if (!(await hasPermission(base44, actor, 'reports.manage'))) return Response.json({ error: 'Sem permissão para gerenciar denúncias' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, { route: 'manageReport', user: actor, body, strict: true, limit: 30, windowMs: 60_000, maxBodyBytes: 10_000 });

    const reportId = clean(body.report_id, 120);
    if (!reportId) return Response.json({ error: 'Denúncia inválida' }, { status: 400 });
    const svc = base44.asServiceRole;
    const rows = await svc.entities.Report.filter({ id: reportId }, '-created_date', 1);
    const item = rows?.[0];
    if (!item) return Response.json({ error: 'Denúncia não encontrada' }, { status: 404 });

    const nextStatus = STATUS.has(body.status) ? body.status : null;
    const priority = PRIORITY.has(body.priority) ? body.priority : null;
    const resolution = clean(body.resolution, 1500);
    const assignedTo = clean(body.assigned_to, 160);
    const patch: any = {};
    if (nextStatus) patch.status = nextStatus;
    if (priority) patch.priority = priority;
    if (resolution) patch.resolution = resolution;
    if (assignedTo) patch.assigned_to = assignedTo;
    if (['confirmed', 'approved', 'rejected', 'resolved'].includes(nextStatus || '')) {
      if (!(await hasPermission(base44, actor, 'reports.resolve'))) return Response.json({ error: 'Sem permissão para resolver denúncias' }, { status: 403 });
      patch.handled_by = actorName(actor);
      patch.action_taken = resolution || (nextStatus === 'rejected' ? 'Denúncia rejeitada após revisão.' : 'Denúncia revisada pela Staff.');
    }
    if (!Object.keys(patch).length) return Response.json({ error: 'Nenhuma alteração válida' }, { status: 400 });

    await svc.entities.Report.update(item.id, patch);
    await svc.entities.StaffLog.create({
      actor_name: actorName(actor), actor_id: actor.id, action: `report_${nextStatus || 'updated'}`,
      details: `Denúncia ${item.id}: ${item.status || 'pending'} → ${nextStatus || item.status}; prioridade ${priority || item.priority || 'normal'}; ${resolution || 'sem observação'}`.slice(0, 1000),
      target_id: item.reported_user_id || item.target_id || item.id,
    }).catch(() => null);

    if (item.reported_user_id && nextStatus === 'confirmed') {
      await svc.entities.UserNotification.create({
        recipient_user_id: item.reported_user_id,
        actor_user_id: actor.id,
        actor_name: 'Equipe Nébula',
        type: 'report',
        title: 'Denúncia analisada',
        body: 'Uma denúncia relacionada à sua conta foi confirmada pela moderação. Consulte o suporte caso precise de contexto adicional.',
        context_url: '/tickets', context_type: 'report', context_id: item.id,
        read: false, dedupe_key: `report-confirmed:${item.id}`,
      }).catch(() => null);
    }

    return Response.json({ ok: true, report: { ...item, ...patch } });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Não foi possível atualizar a denúncia' }, { status: 500 });
  }
}
