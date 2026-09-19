import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const ADMIN_ROLES = new Set(['owner', 'dev', 'admin']);
const OWNER_ONLY_ACTIONS = new Set(['block', 'unblock', 'ban_user', 'ignore']);

const actorName = (u: any) => u?.profile?.display_name || u?.profile?.name || u?.full_name || u?.email || u?.id || 'Owner';

function activeByExpiry(item: any) {
  return item && item.active !== false && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now());
}

async function findEvent(svc: any, eventId: string) {
  if (!eventId) return null;
  const byEventId = await svc.entities.SecurityEvent.filter({ event_id: eventId }, '-created_date', 1).catch(() => []);
  if (byEventId?.[0]) return byEventId[0];
  const byId = await svc.entities.SecurityEvent.filter({ id: eventId }, '-created_date', 1).catch(() => []);
  return byId?.[0] || null;
}

async function saveDecision(svc: any, user: any, event: any, decision: string, extra: any = {}) {
  if (!event) return;
  const existing = await svc.entities.SecurityResponsePolicy.filter({ event_id: event.event_id }, '-created_date', 1).catch(() => []);
  const payload = {
    event_id: event.event_id,
    fingerprint: event.request_fingerprint || '',
    user_id: event.user_id || '',
    decision,
    custom_message: typeof extra.custom_message === 'string' ? extra.custom_message.slice(0, 800) : '',
    duration_hours: Number.isFinite(Number(extra.duration_hours)) ? Number(extra.duration_hours) : 0,
    permanent: !!extra.permanent,
    created_by: user.id,
    created_by_name: actorName(user),
  };
  if (existing?.[0]) await svc.entities.SecurityResponsePolicy.update(existing[0].id, payload);
  else await svc.entities.SecurityResponsePolicy.create(payload);
}

async function audit(svc: any, user: any, action: string, details: any, targetId = '') {
  await svc.entities.StaffLog.create({
    actor_name: actorName(user),
    actor_id: user.id,
    action: `security_${action}`,
    details: JSON.stringify(details || {}).slice(0, 1200),
    target_id: targetId,
  }).catch(() => {});
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !ADMIN_ROLES.has(user.role)) {
      return Response.json({ error: 'Acesso restrito à administração' }, { status: 403 });
    }

    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, { route: 'securityReport', user, body, strict: true, limit: 20, windowMs: 60_000, maxBodyBytes: 12_000 });
    const action = typeof body?.action === 'string' ? body.action : 'summary';

    if (OWNER_ONLY_ACTIONS.has(action) && user.role !== 'owner') {
      return Response.json({ error: 'Esta decisão de segurança exige o Owner.' }, { status: 403 });
    }

    if (action === 'review' || action === 'ignore') {
      const eventId = typeof body.event_id === 'string' ? body.event_id.slice(0, 100) : '';
      const event = await findEvent(svc, eventId);
      if (!event) return Response.json({ error: 'Evento não encontrado' }, { status: 404 });
      const decision = action === 'ignore' ? 'ignored' : 'reviewed';
      await svc.entities.SecurityEvent.update(event.id, {
        reviewed: true,
        owner_decision: decision,
        notes: typeof body.notes === 'string' ? body.notes.slice(0, 800) : event.notes || '',
      });
      await saveDecision(svc, user, event, decision, {});
      await audit(svc, user, decision, { event_id: event.event_id, notes: body.notes || '' }, event.event_id);
      return Response.json({ ok: true, decision });
    }

    if (action === 'block') {
      const eventId = typeof body.event_id === 'string' ? body.event_id.slice(0, 100) : '';
      const event = eventId ? await findEvent(svc, eventId) : null;
      const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint : (event?.request_fingerprint || '');
      if (!/^[a-f0-9]{64}$/.test(fingerprint)) return Response.json({ error: 'Fingerprint inválida' }, { status: 400 });
      const permanent = body.permanent === true;
      const hours = permanent ? 0 : Math.min(Math.max(Number(body.hours) || 24, 1), 720);
      const customMessage = typeof body.custom_message === 'string' ? body.custom_message.trim().slice(0, 800) : '';
      if (event?.user_id) {
        const linkedUsers = await svc.entities.User.filter({ id: event.user_id }, '-created_date', 1).catch(() => []);
        const linkedUser = linkedUsers?.[0];
        if (linkedUser && ['owner', 'dev'].includes(linkedUser.role)) {
          return Response.json({ error: 'O fluxo automático não pode bloquear um fingerprint vinculado a Owner/Dev.' }, { status: 403 });
        }
      }
      const existing = await svc.entities.SecurityBlock.filter({ fingerprint, active: true }, '-created_date', 20).catch(() => []);
      const data: any = {
        fingerprint,
        reason: typeof body.reason === 'string' ? body.reason.slice(0, 240) : (event?.reason || 'Bloqueio definido pelo Owner'),
        active: true,
        created_by: user.id,
        created_by_name: actorName(user),
        source_event_id: event?.event_id || eventId,
        custom_message: customMessage,
        show_message: body.show_message !== false,
      };
      if (!permanent) data.expires_at = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      else data.expires_at = null;
      if (existing?.[0]) await svc.entities.SecurityBlock.update(existing[0].id, data);
      else await svc.entities.SecurityBlock.create(data);
      if (event) {
        await svc.entities.SecurityEvent.update(event.id, { reviewed: true, owner_decision: 'blocked' });
        await saveDecision(svc, user, event, 'blocked', { custom_message: customMessage, duration_hours: hours, permanent });
      }
      await audit(svc, user, 'block', { event_id: event?.event_id || '', permanent, hours, show_message: data.show_message }, event?.event_id || fingerprint.slice(0, 16));
      return Response.json({ ok: true, expires_at: data.expires_at || null, permanent, decision: 'blocked' });
    }

    if (action === 'unblock') {
      const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint : '';
      if (!/^[a-f0-9]{64}$/.test(fingerprint)) return Response.json({ error: 'Fingerprint inválida' }, { status: 400 });
      const existing = await svc.entities.SecurityBlock.filter({ fingerprint, active: true }, '-created_date', 50).catch(() => []);
      await Promise.all((existing || []).map((item: any) => svc.entities.SecurityBlock.update(item.id, { active: false })));
      await audit(svc, user, 'unblock', { fingerprint: fingerprint.slice(0, 16), count: existing.length }, fingerprint.slice(0, 16));
      return Response.json({ ok: true, count: existing.length });
    }

    if (action === 'ban_user') {
      const eventId = typeof body.event_id === 'string' ? body.event_id.slice(0, 100) : '';
      const event = await findEvent(svc, eventId);
      if (!event) return Response.json({ error: 'Evento não encontrado' }, { status: 404 });
      if (!event.user_id) return Response.json({ error: 'Este evento não está vinculado a uma conta autenticada. Use bloqueio por fingerprint.' }, { status: 400 });
      const targets = await svc.entities.User.filter({ id: event.user_id }, '-created_date', 1).catch(() => []);
      const target = targets?.[0];
      if (!target) return Response.json({ error: 'Conta do evento não encontrada' }, { status: 404 });
      if (['owner', 'dev'].includes(target.role)) return Response.json({ error: 'Contas Owner/Dev não podem ser banidas por este fluxo.' }, { status: 403 });
      if (target.id === user.id) return Response.json({ error: 'Você não pode banir sua própria conta por este fluxo.' }, { status: 400 });

      const permanent = body.permanent === true;
      const hours = permanent ? 0 : Math.min(Math.max(Number(body.hours) || 24, 1), 720);
      const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 600) : `Incidente de segurança ${event.event_id}: ${event.reason || event.category}`;
      const publicMessage = typeof body.custom_message === 'string' && body.custom_message.trim()
        ? body.custom_message.trim().slice(0, 800)
        : 'Seu acesso ao Nébula OS foi bloqueado após uma revisão de segurança. Entre em contato com o suporte caso queira solicitar revisão.';
      const punishment: any = {
        user_id: target.id,
        user_name: target.profile?.display_name || target.profile?.name || target.full_name || target.email || target.id,
        type: permanent ? 'ban' : 'tempban',
        reason,
        staff_name: actorName(user),
        active: true,
        public_message: publicMessage,
        source_event_id: event.event_id,
      };
      if (!permanent) punishment.expires_at = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      await svc.entities.Punishment.create(punishment);
      await svc.entities.SecurityEvent.update(event.id, { reviewed: true, owner_decision: 'banned' });
      await saveDecision(svc, user, event, 'banned', { custom_message: publicMessage, duration_hours: hours, permanent });
      await audit(svc, user, 'ban_user', { event_id: event.event_id, user_id: target.id, permanent, hours }, target.id);
      return Response.json({ ok: true, decision: 'banned', user_id: target.id, expires_at: punishment.expires_at || null, permanent });
    }

    const events = await svc.entities.SecurityEvent.list('-occurred_at', 400);
    const visibleEvents = (events || []).filter((event: any) => (event.owner_decision || (event.reviewed ? 'reviewed' : 'pending')) !== 'ignored');
    const blocks = await svc.entities.SecurityBlock.filter({ active: true }, '-created_date', 150).catch(() => []);
    const policies = await svc.entities.SecurityResponsePolicy.list('-created_date', 200).catch(() => []);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const recent = visibleEvents.filter((event: any) => new Date(event.occurred_at || event.created_date).getTime() >= since);
    const bySeverity = Object.fromEntries(['low', 'medium', 'high', 'critical'].map((level) => [level, recent.filter((event: any) => event.severity === level).length]));
    const byRoute: Record<string, number> = {};
    const byFingerprint: Record<string, number> = {};
    for (const event of recent) {
      byRoute[event.route || 'unknown'] = (byRoute[event.route || 'unknown'] || 0) + 1;
      if (event.request_fingerprint) byFingerprint[event.request_fingerprint] = (byFingerprint[event.request_fingerprint] || 0) + 1;
    }
    return Response.json({
      generated_at: new Date().toISOString(),
      summary: {
        events_24h: recent.length,
        blocked_24h: recent.filter((event: any) => event.action === 'blocked').length,
        critical_unreviewed: visibleEvents.filter((event: any) => event.severity === 'critical' && !event.reviewed).length,
        pending_decisions: visibleEvents.filter((event: any) => !event.reviewed && (event.owner_decision || 'pending') === 'pending').length,
        active_blocks: (blocks || []).filter(activeByExpiry).length,
        by_severity: bySeverity,
        top_routes: Object.entries(byRoute).sort((a, b) => b[1] - a[1]).slice(0, 8),
        top_fingerprints: Object.entries(byFingerprint).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([fingerprint, count]) => [fingerprint.slice(0, 16), count]),
      },
      events: visibleEvents.slice(0, 150),
      blocks: (blocks || []).slice(0, 150),
      policies: (policies || []).slice(0, 150),
    });
  } catch (error: any) {
    const blocked = securityResponse(error); if (blocked) return blocked;
    return Response.json({ error: 'Falha ao gerar relatório de segurança', detail: String(error?.message || '').slice(0, 160) }, { status: 500 });
  }
}
