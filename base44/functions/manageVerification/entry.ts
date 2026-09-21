import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';
import { hasPermission } from '../../shared/permissions.ts';

const ACTIVE = new Set(['requested', 'awaiting_user', 'scheduled', 'in_review', 'awaiting_staff']);
const STATUSES = new Set(['requested', 'awaiting_user', 'scheduled', 'in_review', 'awaiting_staff', 'approved', 'rejected', 'cancelled']);
const clean = (v: any, max = 1000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const actorName = (u: any) => u?.profile?.display_name || u?.profile?.name || u?.full_name || u?.email || u?.id || 'Staff';

function safeCase(c: any) {
  if (!c) return null;
  return {
    id: c.id,
    protocol: c.protocol,
    user_id: c.user_id,
    status: c.status,
    reason_public: c.reason_public,
    created_date: c.created_date,
    updated_date: c.updated_date,
    resolved_at: c.resolved_at,
    resolution: c.resolution,
    restrictions: c.restrictions || {},
    appeal_available: c.appeal_available !== false,
  };
}

async function addEvent(svc: any, item: any) {
  return svc.entities.VerificationEvent.create(item);
}

async function audit(svc: any, actor: any, action: string, details: string, targetId: string) {
  return svc.entities.StaffLog.create({
    actor_name: actorName(actor), actor_id: actor.id, action,
    details: details.slice(0, 1000), target_id: targetId,
  }).catch(() => null);
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, { route: 'manageVerification', user, body, strict: true, limit: 20, windowMs: 60_000, maxBodyBytes: 12_000 });
    const svc = base44.asServiceRole;
    const action = clean(body.action, 40);

    if (action === 'my_status') {
      const cases = await svc.entities.VerificationCase.filter({ user_id: user.id }, '-created_date', 10);
      const current = cases.find((c: any) => ACTIVE.has(c.status)) || cases[0] || null;
      const appeals = current ? await svc.entities.Appeal.filter({ case_id: current.id, user_id: user.id }, '-created_date', 10).catch(() => []) : [];
      return Response.json({ case: safeCase(current), restricted: !!current && ACTIVE.has(current.status), appeals: appeals.map((a: any) => ({ id: a.id, status: a.status, response: a.response || '', created_date: a.created_date })) });
    }

    if (action === 'list') {
      if (!(await hasPermission(base44, user, 'verification.view'))) return Response.json({ error: 'Sem permissão' }, { status: 403 });
      const cases = await svc.entities.VerificationCase.list('-created_date', Math.min(Number(body.limit) || 100, 200));
      return Response.json({ cases });
    }

    if (action === 'begin') {
      const caseId = clean(body.case_id, 120);
      if (!caseId) return Response.json({ error: 'Caso inválido' }, { status: 400 });
      const cases = await svc.entities.VerificationCase.filter({ id: caseId, user_id: user.id }, '-created_date', 1);
      const item = cases?.[0];
      if (!item || !ACTIVE.has(item.status)) return Response.json({ error: 'Verificação ativa não encontrada' }, { status: 404 });
      if (!['requested', 'awaiting_user'].includes(item.status)) {
        return Response.json({ ok: true, unchanged: true, case: safeCase(item) });
      }
      const next = 'awaiting_staff';
      await svc.entities.VerificationCase.update(item.id, { status: next });
      await addEvent(svc, {
        case_id: item.id,
        user_id: user.id,
        from_status: item.status || '',
        to_status: next,
        actor_id: user.id,
        actor_name: actorName(user),
        note: 'Usuário iniciou conscientemente o processo de verificação. Nenhuma captura de tela, câmera ou microfone foi iniciada automaticamente.',
        request_id: crypto.randomUUID(),
      });
      return Response.json({ ok: true, case: { ...safeCase(item), status: next } });
    }

    if (action === 'request') {
      if (!(await hasPermission(base44, user, 'verification.request'))) return Response.json({ error: 'Sem permissão para exigir verificação' }, { status: 403 });
      const targetId = clean(body.user_id, 120);
      const reasonInternal = clean(body.reason_internal, 1500);
      const reasonPublic = clean(body.reason_public, 800) || 'Sua conta precisa passar por uma revisão adicional. Algumas funções permanecerão temporariamente limitadas até a conclusão.';
      if (!targetId || !reasonInternal) return Response.json({ error: 'Usuário e motivo interno são obrigatórios' }, { status: 400 });
      const targets = await svc.entities.User.filter({ id: targetId }, '-created_date', 1);
      const target = targets?.[0];
      if (!target) return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });
      if (target.role === 'owner') return Response.json({ error: 'O owner não pode ser colocado em verificação por este fluxo' }, { status: 403 });
      const existing = await svc.entities.VerificationCase.filter({ user_id: targetId }, '-created_date', 20);
      if (existing.some((c: any) => ACTIVE.has(c.status))) return Response.json({ error: 'Este usuário já possui uma verificação ativa' }, { status: 409 });
      const protocol = `VR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const restrictions = {
        messages: body.restrictions?.messages !== false,
        posts: !!body.restrictions?.posts,
        interactions: body.restrictions?.interactions !== false,
        manual_review: body.restrictions?.manual_review !== false,
      };
      const item = await svc.entities.VerificationCase.create({
        protocol, user_id: targetId, status: 'requested', reason_internal: reasonInternal,
        reason_public: reasonPublic, created_by: user.id, created_by_name: actorName(user),
        restrictions, appeal_available: body.appeal_available !== false,
        risk_flag: clean(body.risk_flag, 120),
      });
      const requestId = crypto.randomUUID();
      await addEvent(svc, { case_id: item.id, user_id: targetId, from_status: '', to_status: 'requested', actor_id: user.id, actor_name: actorName(user), note: reasonInternal, request_id: requestId });
      await svc.entities.UserNotification.create({
        recipient_user_id: targetId, actor_user_id: user.id, actor_name: 'Equipe Nébula', type: 'verification',
        title: 'Verificação de conta necessária', body: reasonPublic, context_url: '/verificacao', context_type: 'verification', context_id: item.id, read: false, dedupe_key: `verification:${item.id}`,
      });
      await audit(svc, user, 'solicitou_verificacao', `${protocol}: ${reasonInternal}`, targetId);
      return Response.json({ ok: true, case: item });
    }

    if (action === 'update') {
      const caseId = clean(body.case_id, 120);
      const next = clean(body.status, 40);
      if (!caseId || !STATUSES.has(next)) return Response.json({ error: 'Status inválido' }, { status: 400 });
      const cases = await svc.entities.VerificationCase.filter({ id: caseId }, '-created_date', 1);
      const item = cases?.[0];
      if (!item) return Response.json({ error: 'Caso não encontrado' }, { status: 404 });
      const permission = next === 'approved' ? 'verification.approve' : next === 'rejected' ? 'verification.reject' : next === 'cancelled' ? 'verification.cancel' : 'verification.request';
      if (!(await hasPermission(base44, user, permission))) return Response.json({ error: 'Sem permissão para essa mudança' }, { status: 403 });
      const patch: any = { status: next };
      const resolution = clean(body.resolution, 1500);
      if (['approved', 'rejected', 'cancelled'].includes(next)) {
        patch.resolved_by = user.id;
        patch.resolved_at = new Date().toISOString();
        patch.resolution = resolution || `Caso encerrado como ${next}`;
      }
      await svc.entities.VerificationCase.update(item.id, patch);
      await addEvent(svc, { case_id: item.id, user_id: item.user_id, from_status: item.status || '', to_status: next, actor_id: user.id, actor_name: actorName(user), note: resolution, request_id: crypto.randomUUID() });
      await svc.entities.UserNotification.create({
        recipient_user_id: item.user_id, actor_user_id: user.id, actor_name: 'Equipe Nébula', type: 'verification',
        title: 'Status da verificação atualizado', body: `Sua verificação agora está como: ${next}.`, context_url: '/verificacao', context_type: 'verification', context_id: item.id, read: false, dedupe_key: `verification:${item.id}:${next}:${Date.now()}`,
      });
      await audit(svc, user, `verificacao_${next}`, `${item.protocol || item.id}: ${resolution || next}`, item.user_id);
      return Response.json({ ok: true });
    }

    if (action === 'appeal') {
      const caseId = clean(body.case_id, 120);
      const explanation = clean(body.explanation, 4000);
      const context = clean(body.context, 3000);
      const evidenceUrl = clean(body.evidence_url, 1000);
      if (!caseId || explanation.length < 10) return Response.json({ error: 'Explique a contestação com mais detalhes' }, { status: 400 });
      const cases = await svc.entities.VerificationCase.filter({ id: caseId, user_id: user.id }, '-created_date', 1);
      const item = cases?.[0];
      if (!item || item.appeal_available === false) return Response.json({ error: 'Contestação indisponível' }, { status: 403 });
      const existing = await svc.entities.Appeal.filter({ case_id: caseId, user_id: user.id }, '-created_date', 10);
      if (existing.some((a: any) => ['pending', 'needs_info'].includes(a.status))) return Response.json({ error: 'Já existe uma contestação em análise' }, { status: 409 });
      const appeal = await svc.entities.Appeal.create({ case_id: caseId, user_id: user.id, explanation, context, evidence_url: evidenceUrl, status: 'pending' });
      await addEvent(svc, { case_id: caseId, user_id: user.id, from_status: item.status || '', to_status: item.status || '', actor_id: user.id, actor_name: actorName(user), note: 'Contestação enviada', request_id: crypto.randomUUID() });
      return Response.json({ ok: true, appeal });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao processar verificação' }, { status: 500 });
  }
}