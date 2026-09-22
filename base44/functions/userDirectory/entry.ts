import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';
import { hasPermission, requireStaff } from '../../shared/permissions.ts';

const text = (v: any, max = 120) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const lower = (v: any) => text(v, 200).toLocaleLowerCase('pt-BR');
const STAFF_ROLES = new Set(['support', 'staff', 'moderator', 'admin', 'dev', 'owner']);
const NITRO_PLAN_DAYS: Record<string, number> = { nitro_mensal: 30, nitro_anual: 365, nitro_90: 90 };
const DAY_MS = 86_400_000;

function nitroExpiry(row: any) {
  if (row?.expires_at) {
    const parsed = new Date(row.expires_at).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  if (row?.status !== 'approved') return 0;
  const anchor = new Date(row?.approved_at || row?.updated_date || row?.created_date || 0).getTime();
  if (!Number.isFinite(anchor)) return 0;
  return anchor + (NITRO_PLAN_DAYS[row?.plan] || 30) * DAY_MS;
}

async function hasActiveNitro(svc: any, target: any) {
  const userId = target?.id;
  if (!userId) return false;
  const [filteredResult, listedResult] = await Promise.allSettled([
    svc.entities.NitroRequest.filter({ user_id: userId }, '-created_date', 150),
    svc.entities.NitroRequest.list('-created_date', 300),
  ]);
  const filteredRows = filteredResult.status === 'fulfilled' ? filteredResult.value : [];
  const listedRows = listedResult.status === 'fulfilled' ? listedResult.value : [];
  const rows = Array.from(new Map([
    ...(filteredRows || []),
    ...(listedRows || []).filter((row: any) => row?.user_id === userId),
  ].map((row: any) => [row.id, row])).values());
  const now = Date.now();
  const resetFloor = new Date(target?.profile?.nitro_reset_at || 0).getTime();
  return rows.some((row: any) => {
    if (row.status !== 'approved' || nitroExpiry(row) <= now) return false;
    const approvedAnchor = new Date(row?.approved_at || row?.updated_date || row?.created_date || 0).getTime();
    return !(Number.isFinite(resetFloor) && resetFloor > 0 && Number.isFinite(approvedAnchor) && approvedAnchor <= resetFloor);
  });
}

function publicUser(u: any) {
  const p = u.profile || {};
  return {
    id: u.id,
    name: p.display_name || p.name || u.full_name || p.discord_username || 'Usuário',
    username: p.username || p.discord_handle || p.discord_username || '',
    avatar_url: p.avatar_url || p.discord_avatar_url || '',
    banner_url: p.banner_url || p.discord_banner_url || '',
    bio: p.bio || '',
    status: p.status || 'offline',
    custom_status: text(p.nitro_status_text || p.custom_status, 40),
    accent: text(p.accent, 20),
    accent_2: text(p.accent_2, 20),
    accent_source: text(p.accent_source, 40),
    frame: text(p.frame, 40),
    custom_frame_url: text(p.custom_frame_url, 2048),
    badges: Array.isArray(p.badges) ? p.badges.slice(0, 12) : [],
    nitro_badges: Array.isArray(p.nitro_badges) ? p.nitro_badges.slice(0, 4) : [],
    role: u.role || 'user',
    created_date: u.created_date,
    discord_connected: !!(p.discord_id || p.discord_connected || p.discord_username || p.discord_handle),
  };
}

function matches(u: any, q: string) {
  const p = u.profile || {};
  const hay = [u.id, u.full_name, p.name, p.display_name, p.username, p.discord_username, p.discord_handle]
    .map(lower).join(' ');
  return hay.includes(q);
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, { route: 'userDirectory', user, body, limit: 24, windowMs: 60_000, maxBodyBytes: 4_000 });
    const svc = base44.asServiceRole;

    if (body.action === 'profile') {
      const userId = text(body.user_id, 120);
      if (!userId) return Response.json({ error: 'Usuário inválido' }, { status: 400 });
      const rows = await svc.entities.User.filter({ id: userId }, '-created_date', 1);
      const target = rows?.[0];
      if (!target) return Response.json({ error: 'Perfil não encontrado' }, { status: 404 });
      const profile: any = publicUser(target);
      const targetProfile = target.profile || {};
      const nitroActive = await hasActiveNitro(svc, target);
      profile.nitro_active = nitroActive;
      profile.custom_status = text(targetProfile.nitro_status_text || targetProfile.custom_status, 40);
      profile.nitro_status_text = text(targetProfile.nitro_status_text || targetProfile.custom_status, 40);
      profile.nitro_badges = Array.isArray(targetProfile.nitro_badges) ? targetProfile.nitro_badges.slice(0, 8) : [];
      profile.frame = text(targetProfile.frame, 40);
      profile.custom_frame_url = text(targetProfile.custom_frame_url, 2048);
      profile.custom_tag = text(targetProfile.custom_tag, 16);
      profile.name_gradient_a = text(targetProfile.name_gradient_a, 20);
      profile.name_gradient_b = text(targetProfile.name_gradient_b, 20);
      profile.nitro_pronouns = text(targetProfile.nitro_pronouns, 40);
      profile.nitro_about = text(targetProfile.nitro_about || targetProfile.bio, 300);
      profile.accent = text(targetProfile.accent, 20);
      profile.accent_2 = text(targetProfile.accent_2, 20);
      profile.accent_source = text(targetProfile.accent_source, 40);
      if (nitroActive) {
        profile.frame = text(target.profile?.frame, 40);
        profile.custom_frame_url = text(target.profile?.custom_frame_url, 2048);
        profile.custom_tag = text(target.profile?.custom_tag, 16);
        profile.name_gradient_a = text(target.profile?.name_gradient_a, 20);
        profile.name_gradient_b = text(target.profile?.name_gradient_b, 20);
        profile.nitro_pronouns = text(target.profile?.nitro_pronouns, 40);
        profile.nitro_status_text = text(target.profile?.nitro_status_text || target.profile?.custom_status, 40);
        profile.nitro_about = text(target.profile?.nitro_about, 300);
        profile.accent = text(target.profile?.accent, 20);
        profile.accent_2 = text(target.profile?.accent_2, 20);
        profile.accent_source = text(target.profile?.accent_source, 40);
      }
      const canAdminView = await hasPermission(base44, user, 'users.profile.admin_view');
      if (canAdminView) {
        profile.internal_id = target.id;
        profile.email = user.role === 'owner' || user.role === 'dev' || user.role === 'admin' ? (target.email || '') : undefined;
        const discord = await svc.entities.DiscordAccount.filter({ user_id: target.id }, '-updated_date', 1).catch(() => []);
        const canDiscord = await hasPermission(base44, user, 'users.discord_id.view');
        const discordRow = discord?.[0] || null;
        const profileDiscordId = target.profile?.discord_id || target.profile?.discord?.id || target.discord_id || '';
        const connected = !!(discordRow || profileDiscordId || target.profile?.discord_connected);
        profile.discord_connected = connected;
        profile.discord = connected ? {
          connected: true,
          username: discordRow?.display_name || discordRow?.username || discordRow?.handle || target.profile?.discord_username || '',
          handle: discordRow?.handle || discordRow?.username || target.profile?.discord_handle || target.profile?.discord_username || '',
          id: canDiscord ? (discordRow?.discord_id || profileDiscordId || '') : undefined,
          avatar_url: discordRow?.avatar_url || target.profile?.discord_avatar_url || '',
        } : { connected: false };
        const reports = await svc.entities.Report.filter({ reported_user_id: target.id }, '-created_date', 100).catch(() => []);
        profile.report_summary = {
          total: reports.length,
          open: reports.filter((r: any) => ['pending','new','in_review','awaiting_info'].includes(r.status || 'pending')).length,
          confirmed: reports.filter((r: any) => ['confirmed','approved','resolved'].includes(r.status)).length,
          rejected: reports.filter((r: any) => r.status === 'rejected').length,
        };
        const cases = await svc.entities.VerificationCase.filter({ user_id: target.id }, '-created_date', 10).catch(() => []);
        profile.verification = cases?.[0] || null;
        const punishments = await svc.entities.Punishment.filter({ user_id: target.id }, '-created_date', 50).catch(() => []);
        profile.punishment_summary = {
          total: punishments.length,
          active: punishments.filter((p: any) => p.active !== false && (!p.expires_at || new Date(p.expires_at).getTime() > Date.now())).length,
        };
      }
      return Response.json(
        { profile, viewer: { staff: requireStaff(user), role: user.role } },
        { headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" } }
      );
    }

    if (body.action === 'ticket_directory') {
      const ticketId = text(body.context_id, 120);
      const tickets = ticketId ? await svc.entities.Ticket.filter({ id: ticketId }, '-created_date', 1) : [];
      const ticket = tickets?.[0];
      const requesterId = ticket?.requester_user_id || ticket?.created_by_id || '';
      if (!ticket || (requesterId !== user.id && !STAFF_ROLES.has(user.role))) {
        return Response.json({ error: 'Contexto de ticket inválido' }, { status: 403 });
      }
      const rows = await svc.entities.User.list('full_name', 500);
      const rank: Record<string, number> = { owner: 6, dev: 5, admin: 4, moderator: 3, staff: 3, support: 2, user: 0 };
      const users = rows
        .filter((u: any) => u.id !== user.id && (STAFF_ROLES.has(u.role) || u.id === requesterId))
        .sort((a: any, b: any) => (rank[b.role] || 0) - (rank[a.role] || 0) || String(a.full_name || '').localeCompare(String(b.full_name || '')))
        .map((u: any) => publicUser(u));
      return Response.json({ users });
    }

    if (body.action !== 'search') return Response.json({ error: 'Ação inválida' }, { status: 400 });
    const q = lower(body.q);
    if (!q || q.length < 1) return Response.json({ users: [] });
    const limit = Math.min(Math.max(Number(body.limit) || 8, 1), 12);
    const contextType = text(body.context_type, 40);
    const adminSearch = contextType === 'admin';

    if (adminSearch && !(await hasPermission(base44, user, 'users.profile.admin_view'))) {
      return Response.json({ error: 'Pesquisa administrativa não autorizada' }, { status: 403 });
    }

    let rows = await svc.entities.User.list('-created_date', adminSearch ? 500 : 250);

    if (adminSearch) {
      const exactById = await svc.entities.User.filter({ id: q }, '-created_date', 1).catch(() => []);
      for (const target of exactById || []) {
        if (target && !rows.some((u: any) => u.id === target.id)) rows.unshift(target);
      }
    }
    if (contextType === 'ticket') {
      const ticketId = text(body.context_id, 120);
      const tickets = ticketId ? await svc.entities.Ticket.filter({ id: ticketId }, '-created_date', 1) : [];
      const ticket = tickets?.[0];
      const requesterId = ticket?.requester_user_id || ticket?.created_by_id || '';
      if (!ticket || (requesterId !== user.id && !STAFF_ROLES.has(user.role))) {
        return Response.json({ error: 'Contexto de ticket inválido' }, { status: 403 });
      }
      rows = rows.filter((u: any) => u.id === requesterId || STAFF_ROLES.has(u.role));
    }

    let found = rows.filter((u: any) => u.id !== user.id && matches(u, q)).slice(0, limit);

    const canDiscord = await hasPermission(base44, user, 'users.discord_id.view');
    if (canDiscord && /^\d{8,22}$/.test(q) && found.length < limit) {
      const accounts = await svc.entities.DiscordAccount.filter({ discord_id: q }, '-updated_date', 3).catch(() => []);
      const ids = accounts.map((a: any) => a.user_id).filter(Boolean);
      for (const id of ids) {
        let target = rows.find((u: any) => u.id === id);
        if (!target && adminSearch) {
          const exact = await svc.entities.User.filter({ id }, '-created_date', 1).catch(() => []);
          target = exact?.[0];
          if (target) rows.unshift(target);
        }
        if (target && !found.some((u: any) => u.id === target.id)) found.push(target);
      }
    }

    const users = found.slice(0, limit).map((u: any) => publicUser(u));
    return Response.json({ users });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao consultar usuários' }, { status: 500 });
  }
}