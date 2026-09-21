import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const STAFF = new Set(['owner', 'dev', 'admin', 'moderator', 'support', 'staff']);
const OPEN = new Set(['novo', 'em_atendimento', 'aguardando_usuario']);

// Auditoria iniciada por owner autenticado. A equipe recebe apenas contagens;
// nenhuma punição nem alteração de contas é aplicada automaticamente.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me().catch(() => null);
    if (!actor || !['owner', 'dev'].includes(actor.role)) {
      return Response.json({ error: 'Auditoria restrita ao owner e dev' }, { status: 403 });
    }
    await guardRequest(req, base44, { route: 'coreOsAudit', user: actor, body: {}, limit: 8, windowMs: 60000, maxBodyBytes: 2000 });
    const svc = base44.asServiceRole;
    const [tickets, reports, events, users] = await Promise.all([
      svc.entities.Ticket.list('-created_date', 500),
      svc.entities.Report.list('-created_date', 300),
      svc.entities.SecurityEvent.list('-occurred_at', 100),
      svc.entities.User.list('-created_date', 200),
    ]);
    const openTickets = tickets.filter((item) => OPEN.has(item.status || 'novo'));
    const urgent = openTickets.filter((item) => ['high', 'urgent'].includes(item.priority));
    const pending = reports.filter((item) => (item.status || 'pending') === 'pending');
    const critical = events.filter((item) => item.severity === 'critical' && item.action === 'blocked' && !item.reviewed);
    const audience = users.filter((item) => STAFF.has(item.role)).map((item) => item.id).filter(Boolean);
    const alerts = [
      { count: urgent.length, title: 'Tickets prioritários', category: 'support', severity: 'notice', url: '/painel?view=staff' },
      { count: pending.length, title: 'Denúncias pendentes', category: 'moderation', severity: 'warning', url: '/painel?view=staff' },
      { count: critical.length, title: 'Eventos críticos bloqueados', category: 'security', severity: 'critical', url: '/painel?view=owner' },
    ];
    const sent = [];
    for (const item of alerts) {
      if (!item.count || !audience.length) continue;
      const key = item.category + '-' + Math.floor(Date.now() / 3600000);
      const existing = await svc.entities.CoreOsNotification.filter({ dedupe_key: key }, '-created_date', 1);
      if (existing.length) continue;
      await svc.entities.CoreOsNotification.create({
        title: item.title, body: item.count + ' ocorrência(s) aguardam revisão da equipe.',
        category: item.category, severity: item.severity, audience_ids: audience,
        read_by: [], source: 'core-os', dedupe_key: key, action_url: item.url,
        expires_at: new Date(Date.now() + 48 * 3600000).toISOString(),
      });
      sent.push(item.title);
    }
    return Response.json({ ok: true, summary: {
      open_tickets: openTickets.length, urgent_tickets: urgent.length,
      pending_reports: pending.length, critical_blocks_15m: critical.length,
      content_for_human_review: 0, staff_notified: sent.length,
    }, alerts: sent });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha na auditoria da Core OS' }, { status: 500 });
  }
}
