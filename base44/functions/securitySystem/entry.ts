import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const ADMIN_ROLES = new Set(['owner', 'dev', 'admin']);

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !ADMIN_ROLES.has(user.role)) {
      return Response.json({ error: 'Acesso restrito à administração' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, { route: 'securitySystem', user, body, strict: true, limit: 20, windowMs: 60_000, maxBodyBytes: 10_000 });
    const action = body?.action || 'summary';

    if (action === 'review') {
      const eventId = typeof body.event_id === 'string' ? body.event_id : '';
      if (!eventId || eventId.length > 100) return Response.json({ error: 'Evento inválido' }, { status: 400 });
      const events = await base44.asServiceRole.entities.SecurityEvent.filter({ event_id: eventId }, '-created_date', 1);
      if (!events[0]) return Response.json({ error: 'Evento não encontrado' }, { status: 404 });
      await base44.asServiceRole.entities.SecurityEvent.update(events[0].id, {
        reviewed: true,
        notes: typeof body.notes === 'string' ? body.notes.slice(0, 500) : '',
      });
      return Response.json({ ok: true });
    }

    if (action === 'block') {
      const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint : '';
      if (!/^[a-f0-9]{64}$/.test(fingerprint)) return Response.json({ error: 'Fingerprint inválida' }, { status: 400 });
      const hours = Math.min(Math.max(Number(body.hours) || 24, 1), 720);
      const existing = await base44.asServiceRole.entities.SecurityBlock.filter({ fingerprint, active: true }, '-created_date', 1);
      const data = {
        fingerprint,
        reason: typeof body.reason === 'string' ? body.reason.slice(0, 240) : 'Bloqueio manual',
        active: true,
        expires_at: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
        created_by: user.id,
        source_event_id: typeof body.event_id === 'string' ? body.event_id.slice(0, 100) : '',
      };
      if (existing[0]) await base44.asServiceRole.entities.SecurityBlock.update(existing[0].id, data);
      else await base44.asServiceRole.entities.SecurityBlock.create(data);
      return Response.json({ ok: true, expires_at: data.expires_at });
    }

    if (action === 'unblock') {
      const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint : '';
      const existing = await base44.asServiceRole.entities.SecurityBlock.filter({ fingerprint, active: true }, '-created_date', 20);
      await Promise.all(existing.map((item) => base44.asServiceRole.entities.SecurityBlock.update(item.id, { active: false })));
      return Response.json({ ok: true });
    }

    const events = await base44.asServiceRole.entities.SecurityEvent.list('-occurred_at', 300);
    const blocks = await base44.asServiceRole.entities.SecurityBlock.filter({ active: true }, '-created_date', 100);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const recent = events.filter((event) => new Date(event.occurred_at || event.created_date).getTime() >= since);
    const bySeverity = Object.fromEntries(['low', 'medium', 'high', 'critical'].map((level) => [level, recent.filter((event) => event.severity === level).length]));
    const byRoute = {};
    for (const event of recent) byRoute[event.route || 'unknown'] = (byRoute[event.route || 'unknown'] || 0) + 1;
    return Response.json({
      generated_at: new Date().toISOString(),
      summary: {
        events_24h: recent.length,
        blocked_24h: recent.filter((event) => event.action === 'blocked').length,
        critical_unreviewed: events.filter((event) => event.severity === 'critical' && !event.reviewed).length,
        active_blocks: blocks.filter((block) => !block.expires_at || new Date(block.expires_at).getTime() > Date.now()).length,
        by_severity: bySeverity,
        top_routes: Object.entries(byRoute).sort((a, b) => b[1] - a[1]).slice(0, 8),
      },
      events: events.slice(0, 100),
      blocks: blocks.slice(0, 100),
    });
  } catch (error) {
    const blocked = securityResponse(error); if (blocked) return blocked;
    return Response.json({ error: 'Falha ao gerar relatório de segurança' }, { status: 500 });
  }
}
