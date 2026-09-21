import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const TYPES = new Set(['post', 'comment', 'user', 'message', 'ticket', 'other']);
const clean = (v: any, max = 1000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const STAFF = new Set(['support', 'staff', 'moderator', 'admin', 'dev', 'owner']);
const MAX_ATTACHMENT_BYTES = 200 * 1024 * 1024;

function safeAttachments(value: any) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).map((item: any) => {
    const url = clean(item?.url, 1200);
    const type = item?.type === 'video' ? 'video' : item?.type === 'image' ? 'image' : '';
    const name = clean(item?.name, 220);
    const mimeType = clean(item?.mime_type, 120);
    const size = Number(item?.size || 0);
    if (!type || !/^https?:\/\//i.test(url)) return null;
    if (size && (!Number.isFinite(size) || size < 0 || size > MAX_ATTACHMENT_BYTES)) return null;
    return { type, url, name, mime_type: mimeType, size: size || 0 };
  }).filter(Boolean);
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, { route: 'submitReport', user, body, strict: true, limit: 6, windowMs: 60_000, maxBodyBytes: 15_000 });
    const type = TYPES.has(body.type) ? body.type : 'user';
    const targetId = clean(body.target_id, 160) || clean(body.reported_user_id, 160);
    const reportedUserId = clean(body.reported_user_id, 160);
    const reason = clean(body.reason, 300);
    const description = clean(body.description, 4000);
    const context = clean(body.context, 1000);
    const contentUrl = clean(body.content_url, 600);
    const attachments = safeAttachments(body.attachments);
    if (!targetId || reason.length < 3) return Response.json({ error: 'Alvo e motivo são obrigatórios' }, { status: 400 });
    if (reportedUserId && reportedUserId === user.id) return Response.json({ error: 'Você não pode denunciar a própria conta' }, { status: 400 });

    const svc = base44.asServiceRole;
    const recentMine = await svc.entities.Report.filter({ reporter_user_id: user.id }, '-created_date', 50).catch(() => []);
    const cutoff10 = Date.now() - 10 * 60_000;
    const normalizedReason = reason.toLowerCase();
    const duplicate = recentMine.find((r: any) => {
      const at = new Date(r.created_date || 0).getTime();
      return at >= cutoff10 && r.target_id === targetId && String(r.reason || '').toLowerCase() === normalizedReason;
    });
    if (duplicate) return Response.json({ error: 'Uma denúncia igual já foi enviada recentemente' }, { status: 429 });

    const reporterName = user.profile?.display_name || user.profile?.name || user.full_name || 'Usuário';
    const uniqueKey = `${user.id}:${targetId}:${normalizedReason.slice(0, 60)}`;
    const report = await svc.entities.Report.create({
      type, target_id: targetId, reported_user_id: reportedUserId,
      reporter_user_id: user.id, reporter_name: reporterName,
      target_author: clean(body.target_author, 160), target_content: clean(body.target_content, 1000),
      reason, description, context, content_url: contentUrl, attachments,
      status: 'new', priority: 'normal', unique_reporter_key: uniqueKey,
    });

    let riskFlag = '';
    if (reportedUserId) {
      const related = await svc.entities.Report.filter({ reported_user_id: reportedUserId }, '-created_date', 200).catch(() => []);
      const cutoff24 = Date.now() - 24 * 3600_000;
      const recent = related.filter((r: any) => new Date(r.created_date || 0).getTime() >= cutoff24);
      const uniqueReporters = new Set(recent.map((r: any) => r.reporter_user_id || r.created_by_id).filter(Boolean));
      if (uniqueReporters.size >= 10) {
        riskFlag = 'reports_spike';
        await svc.entities.Report.update(report.id, { risk_flag: riskFlag, priority: 'high' });
        const staffUsers = await svc.entities.User.list('-created_date', 300);
        const audience = staffUsers.filter((u: any) => STAFF.has(u.role)).map((u: any) => u.id).filter(Boolean);
        if (audience.length) {
          const dedupe = `reports-spike:${reportedUserId}:${new Date().toISOString().slice(0, 10)}`;
          const existing = await svc.entities.CoreOsNotification.filter({ dedupe_key: dedupe }, '-created_date', 1).catch(() => []);
          if (!existing.length) await svc.entities.CoreOsNotification.create({
            title: 'Volume anormal de denúncias detectado',
            body: `${uniqueReporters.size} denunciantes únicos nas últimas 24h. Revisão humana necessária; nenhuma culpa foi presumida.`,
            severity: 'warning', category: 'moderation', audience_ids: audience,
            read_by: [], source: 'reports-anti-abuse', dedupe_key: dedupe,
            action_url: '/painel?view=staff', expires_at: new Date(Date.now() + 48 * 3600_000).toISOString(),
          });
        }
      }
    }

    return Response.json({ ok: true, report_id: report.id, status: 'new', risk_flag: riskFlag });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Não foi possível enviar a denúncia' }, { status: 500 });
  }
}