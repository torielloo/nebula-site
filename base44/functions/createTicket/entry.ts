import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const OPEN_STATUSES = ['novo', 'em_atendimento', 'aguardando_usuario'];
const CATEGORIES = ['conta', 'bugs', 'downloads', 'ia', 'nitro'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const ATTACH_TYPES = ['image', 'video', 'audio', 'link', 'file'];
const STAFF_ROLES = new Set(['owner', 'dev', 'admin', 'moderator', 'support', 'staff']);
const CREATE_COOLDOWN_MS = 5 * 60 * 1000;
const BURST_WINDOW_MS = 30 * 60 * 1000;
const BURST_MAX = 3;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const DAILY_MAX = 8;

function isSafePrivateFileUri(value) {
  const uri = typeof value === 'string' ? value.trim() : '';
  if (!uri || uri.length > 1200 || uri.includes('..') || /[\s<>"'\\]/.test(uri)) return false;
  return /^(mp|b44|base44)(:\/\/|\/)/i.test(uri) || /^private(:\/\/|\/)/i.test(uri);
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

    const body = await req.json().catch(() => null);
    await guardRequest(req, base44, { route: 'createTicket', user, body, limit: 3, windowMs: 60_000, maxBodyBytes: 35_000 });
    const svc = base44.asServiceRole;
    const subject = ((body && body.subject) || '').trim();
    const description = ((body && body.description) || '').trim();
    const category = CATEGORIES.includes(body && body.category) ? body.category : 'conta';
    const priority = PRIORITIES.includes(body && body.priority) ? body.priority : 'normal';
    if (!subject || subject.length > 120 || !description || description.length > 5000) {
      return Response.json({ error: 'Preencha assunto e descrição (assunto até 120 caracteres)' }, { status: 400 });
    }

    let attachments = Array.isArray(body && body.attachments) ? body.attachments : [];
    attachments = attachments
      .filter((a) => {
        if (!a || !ATTACH_TYPES.includes(a.type) || typeof a.url !== 'string') return false;
        const url = a.url.trim();
        return url.length <= 1200 && !url.includes('..') && (/^https?:\/\//i.test(url) || isSafePrivateFileUri(url));
      })
      .slice(0, 5)
      .map((a) => ({ type: a.type, url: a.url.trim(), name: typeof a.name === 'string' ? a.name.slice(0, 120) : undefined }));

    const list = await svc.entities.Ticket.filter({ requester_user_id: user.id }, '-created_date', 200);
    const mineOpen = list.find((tk) => tk.deleted !== true && OPEN_STATUSES.includes(tk.status || 'novo'));
    if (mineOpen) {
      return Response.json({ error: 'Você já tem um ticket em aberto. Use esse ticket antes de criar outro.', open_ticket_id: mineOpen.id }, { status: 409 });
    }

    const now = Date.now();
    const createdTickets = (list || [])
      .map((tk) => ({ ...tk, created_ms: new Date(tk.created_date || 0).getTime() || 0 }))
      .filter((tk) => tk.created_ms > 0)
      .sort((a, b) => b.created_ms - a.created_ms);
    const newest = createdTickets[0] || null;
    if (newest && now - newest.created_ms < CREATE_COOLDOWN_MS) {
      const retryAfterSeconds = Math.max(1, Math.ceil((CREATE_COOLDOWN_MS - (now - newest.created_ms)) / 1000));
      return Response.json({
        error: `Para evitar spam, aguarde ${Math.ceil(retryAfterSeconds / 60)} min antes de criar outro ticket. Se for o mesmo assunto, reabra o ticket anterior.`,
        retry_after_seconds: retryAfterSeconds,
        reuse_ticket_id: newest.id,
      }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } });
    }

    const burst = createdTickets.filter((tk) => now - tk.created_ms < BURST_WINDOW_MS);
    if (burst.length >= BURST_MAX) {
      const oldestInBurst = burst[burst.length - 1];
      const retryAfterSeconds = Math.max(1, Math.ceil((BURST_WINDOW_MS - (now - oldestInBurst.created_ms)) / 1000));
      return Response.json({
        error: 'Você criou vários tickets em pouco tempo. Aguarde antes de abrir outro ou reabra um ticket existente.',
        retry_after_seconds: retryAfterSeconds,
        reuse_ticket_id: newest?.id || null,
      }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } });
    }

    const today = createdTickets.filter((tk) => now - tk.created_ms < DAILY_WINDOW_MS);
    if (today.length >= DAILY_MAX) {
      const oldestToday = today[today.length - 1];
      const retryAfterSeconds = Math.max(1, Math.ceil((DAILY_WINDOW_MS - (now - oldestToday.created_ms)) / 1000));
      return Response.json({
        error: 'Limite diário de criação de tickets atingido. Reabra um ticket existente se ainda precisar de suporte.',
        retry_after_seconds: retryAfterSeconds,
        reuse_ticket_id: newest?.id || null,
      }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } });
    }

    const profile = user.profile || {};
    const rawHandle = profile.username || profile.discord_handle || profile.discord_username || '';
    const requesterName = rawHandle
      ? `@${String(rawHandle).replace(/^@+/, '').trim()}`
      : (profile.display_name || profile.name || user.full_name || 'Usuário');

    const created = await svc.entities.Ticket.create({
      subject,
      description,
      category,
      priority,
      status: 'novo',
      requester_name: requesterName,
      requester_user_id: user.id,
      attachments,
    });

    try {
      const users = await svc.entities.User.list('-created_date', 500);
      const staffUsers = users.filter((u) => STAFF_ROLES.has(u.role) && u.id);
      const audience = staffUsers.map((u) => u.id);
      if (audience.length) {
        const ticketCode = created.id;
        const bodyText = `${requesterName} abriu “${subject}” · ${category} · ${priority} · ID ${ticketCode}`;
        await svc.entities.CoreOsNotification.create({
          title: 'Novo ticket aberto',
          body: bodyText,
          severity: priority === 'urgent' ? 'warning' : 'notice',
          category: 'support',
          audience_ids: audience,
          dedupe_key: `ticket-open:${created.id}`,
          source: 'tickets',
          action_url: `/painel?view=staff&tab=tickets&ticket=${encodeURIComponent(created.id)}`,
          read_by: [],
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        });
        await Promise.all(staffUsers.map((staff) => svc.entities.UserNotification.create({
          recipient_user_id: staff.id,
          actor_user_id: user.id,
          actor_name: requesterName,
          type: 'system',
          title: 'Novo ticket aberto',
          body: bodyText,
          context_url: `/painel?view=${staff.role === 'owner' ? 'owner' : 'staff'}&tab=tickets&ticket=${encodeURIComponent(created.id)}`,
          context_type: 'ticket',
          context_id: created.id,
          read: false,
          dedupe_key: `ticket-open:${created.id}:${staff.id}`,
        }).catch(() => null)));
      }
    } catch {}

    return Response.json({ ticket: created });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao criar o ticket' }, { status: 500 });
  }
}
