import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const PLAN_DAYS: Record<string, number> = { nitro_mensal: 30, nitro_anual: 365, nitro_90: 90 };
const STYLE_KEYS = new Set(['display_name', 'accent', 'accent_2', 'accent_source', 'background_url', 'avatar_url', 'banner_url', 'frame', 'custom_frame_url', 'custom_tag', 'theme', 'sounds', 'name_gradient_a', 'name_gradient_b', 'cursor_effect', 'nitro_pronouns', 'nitro_status_text', 'nitro_about', 'nitro_badges']);

function expiresAtFor(row: any) {
  if (row?.expires_at) {
    const parsed = new Date(row.expires_at).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const anchor = new Date(row?.approved_at || row?.updated_date || row?.created_date || 0).getTime();
  if (!Number.isFinite(anchor) || anchor <= 0) return 0;
  return anchor + (PLAN_DAYS[row?.plan] || 30) * 86_400_000;
}

function requestGrantsNitro(row: any, now: number, resetFloor: number) {
  if (row?.status !== 'approved' || expiresAtFor(row) <= now) return false;
  const approvedAnchor = new Date(row?.approved_at || row?.updated_date || row?.created_date || 0).getTime();
  return !(Number.isFinite(resetFloor) && resetFloor > 0 && Number.isFinite(approvedAnchor) && approvedAnchor <= resetFloor);
}

function recentRedeemedCodeGrantsNitro(row: any, userId: string, now: number, resetFloor: number) {
  if (row?.status !== 'used' || row?.used_by !== userId) return false;
  const usedAt = new Date(row?.used_at || row?.updated_date || 0).getTime();
  if (!Number.isFinite(usedAt) || usedAt <= 0) return false;
  if (Number.isFinite(resetFloor) && resetFloor > 0 && usedAt <= resetFloor) return false;

  // Fallback curto para o instante logo após um código de sorteio ser
  // resgatado. O NitroRequest aprovado pode levar alguns instantes para ficar
  // visível em todas as leituras, mas o código já está consumido pelo usuário.
  return now - usedAt <= 10 * 60 * 1000;
}

async function hasActiveNitro(svc: any, user: any) {
  const userId = user?.id;
  if (!userId) return false;
  const resetFloor = new Date(user?.profile?.nitro_reset_at || 0).getTime();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const now = Date.now();
    const [requestRows, usedCodes, listedRequests, listedCodes] = await Promise.all([
      svc.entities.NitroRequest.filter({ user_id: userId }, '-created_date', 150).catch(() => []),
      svc.entities.NitroCode.filter({ used_by: userId, status: 'used' }, '-used_at', 50).catch(() => []),
      attempt >= 1 ? svc.entities.NitroRequest.list('-created_date', 300).catch(() => []) : Promise.resolve([]),
      attempt >= 1 ? svc.entities.NitroCode.list('-created_date', 300).catch(() => []) : Promise.resolve([]),
    ]);

    const mergedRequests = Array.from(new Map([
      ...(requestRows || []),
      ...(listedRequests || []).filter((row: any) => row?.user_id === userId),
    ].map((row: any) => [row.id, row])).values());

    const mergedCodes = Array.from(new Map([
      ...(usedCodes || []),
      ...(listedCodes || []).filter((row: any) => row?.used_by === userId && row?.status === 'used'),
    ].map((row: any) => [row.id, row])).values());

    if (mergedRequests.some((row: any) => requestGrantsNitro(row, now, resetFloor))) return true;
    if (mergedCodes.some((row: any) => recentRedeemedCodeGrantsNitro(row, userId, now, resetFloor))) return true;

    // Se o código já aponta para a ativação recém-criada, valida diretamente
    // esse NitroRequest pelo ID para não depender da propagação da listagem.
    for (const code of mergedCodes) {
      if (!code?.activation_request_id) continue;
      const linked = await svc.entities.NitroRequest.get(code.activation_request_id).catch(() => null);
      if (linked?.user_id === userId && requestGrantsNitro(linked, now, resetFloor)) return true;
    }

    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
  }

  return false;
}

function safeColor(value: unknown) {
  if (value === null || value === '') return '';
  const v = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

function normalizeTag(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 16);
}

function safeHttpsMedia(value: unknown) {
  const v = String(value || '').trim().slice(0, 2048);
  if (!v) return '';
  if (!/^https:\/\//i.test(v)) throw Object.assign(new Error('URL inválida'), { status: 400 });
  return v;
}

function sanitizeUiConfig(raw: any) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const backgrounds: any = {};
  for (const key of ['home', 'calls', 'perfil']) {
    if (Object.prototype.hasOwnProperty.call(raw?.backgrounds || {}, key)) {
      backgrounds[key] = safeHttpsMedia(raw.backgrounds[key]);
    }
  }

  const sounds = {
    click: safeHttpsMedia(raw?.sounds?.click || ''),
  };

  const elements: any = {};
  const entries = Object.entries(raw?.elements || {}).slice(0, 80);
  for (const [key, rawPatch] of entries) {
    if (!/^[a-z0-9._-]{1,80}$/i.test(key) || !rawPatch || typeof rawPatch !== 'object' || Array.isArray(rawPatch)) continue;
    const patch: any = {};
    for (const field of ['label', 'text', 'title', 'subtitle']) {
      if (Object.prototype.hasOwnProperty.call(rawPatch, field)) {
        patch[field] = String((rawPatch as any)[field] || '').normalize('NFKC').slice(0, field === 'text' ? 300 : 100);
      }
    }
    if (Object.prototype.hasOwnProperty.call(rawPatch, 'color')) {
      const color = safeColor((rawPatch as any).color);
      if (color === null) throw Object.assign(new Error('Cor inválida'), { status: 400 });
      patch.color = color;
    }
    if (Object.prototype.hasOwnProperty.call(rawPatch, 'image')) patch.image = safeHttpsMedia((rawPatch as any).image);
    if (Object.prototype.hasOwnProperty.call(rawPatch, 'glow')) patch.glow = Boolean((rawPatch as any).glow);
    if (Object.prototype.hasOwnProperty.call(rawPatch, 'hidden')) patch.hidden = Boolean((rawPatch as any).hidden);
    if (Object.prototype.hasOwnProperty.call(rawPatch, 'order')) {
      const order = Math.max(-100, Math.min(100, Math.round(Number((rawPatch as any).order) || 0)));
      patch.order = order;
    }
    elements[key] = patch;
  }

  const preset = raw?.themePreset == null ? null : String(raw.themePreset);
  const themePreset = [null, 'cyber-red', 'minimal-ios', 'gamer', 'deep-midnight', 'discord-blurple', 'emerald-matrix', 'cyberpunk-neon', 'custom'].includes(preset as any) ? preset : null;

  return { backgrounds, sounds, elements, themePreset };
}

async function upsertUiSetting(svc: any, userId: string, config: any) {
  const rows = await svc.entities.UiSetting.filter({ user_id: userId }, '-updated_date', 10).catch(() => []);
  const current = rows?.[0] || null;
  if (current?.id) {
    return await svc.entities.UiSetting.update(current.id, { data: config, user_id: userId });
  }
  return await svc.entities.UiSetting.create({ data: config, user_id: userId });
}

function sanitizeChanges(raw: any) {
  const changes: any = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (!STYLE_KEYS.has(key)) continue;
    if (key === 'display_name') {
      changes.display_name = String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 64);
    } else if (key === 'accent' || key === 'accent_2') {
      const color = safeColor(value);
      if (color === null) throw Object.assign(new Error('Cor inválida'), { status: 400 });
      changes[key] = color;
    } else if (key === 'accent_source') {
      changes.accent_source = String(value || '').trim().slice(0, 40);
    } else if (key === 'background_url' || key === 'avatar_url' || key === 'banner_url') {
      const v = String(value || '').trim().slice(0, 2048);
      if (v && !/^https:\/\//i.test(v)) throw Object.assign(new Error('URL de mídia inválida'), { status: 400 });
      changes[key] = v;
    } else if (key === 'frame') {
      const v = String(value || '');
      changes.frame = ['', 'neon', 'gold', 'aurora', 'fire', 'galaxy', 'electric', 'diamond', 'inferno', 'cosmos', 'plasma', 'prism', 'void', 'orbit', 'custom'].includes(v) ? v : '';
    } else if (key === 'custom_frame_url') {
      const v = String(value || '').trim().slice(0, 2048);
      if (v && !/^https:\/\//i.test(v)) throw Object.assign(new Error('URL de moldura inválida'), { status: 400 });
      changes.custom_frame_url = v;
    } else if (key === 'name_gradient_a' || key === 'name_gradient_b') {
      const color = safeColor(value);
      if (color === null) throw Object.assign(new Error('Cor de gradiente inválida'), { status: 400 });
      changes[key] = color;
    } else if (key === 'cursor_effect') {
      const v = String(value || 'none');
      changes.cursor_effect = ['none', 'spark', 'nebula', 'prism'].includes(v) ? v : 'none';
    } else if (key === 'nitro_pronouns') {
      changes.nitro_pronouns = String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20);
    } else if (key === 'nitro_status_text') {
      changes.nitro_status_text = String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
    } else if (key === 'nitro_about') {
      changes.nitro_about = String(value || '').normalize('NFKC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 300);
    } else if (key === 'nitro_badges') {
      const allowed = new Set(['hypesquad', 'booster', 'developer', 'supporter']);
      changes.nitro_badges = Array.from(new Set((Array.isArray(value) ? value : []).map((item) => String(item || '')).filter((item) => allowed.has(item)))).slice(0, 4);
    } else if (key === 'custom_tag') {
      changes.custom_tag = normalizeTag(value);
    } else if (key === 'theme') {
      const v = String(value || 'nebula');
      changes.theme = ['nebula', 'nebula_nitro'].includes(v) ? v : 'nebula';
    } else if (key === 'sounds') {
      changes.sounds = {
        notify: value && typeof value === 'object' ? Boolean((value as any).notify) : true,
        call: value && typeof value === 'object' ? Boolean((value as any).call) : true,
      };
    }
  }
  return changes;
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, {
      route: 'saveNitroProfileStyle',
      user,
      body,
      strict: true,
      limit: 120,
      windowMs: 60_000,
      maxBodyBytes: 12_000,
    });

    const svc = base44.asServiceRole;
    const role = String(user.role || 'user');
    const privilegedUiEditor = ['owner', 'dev'].includes(role);
    let activeNitroCache: boolean | null = null;
    const getActiveNitro = async () => {
      if (activeNitroCache == null) activeNitroCache = await hasActiveNitro(svc, user);
      return activeNitroCache;
    };
    if (!privilegedUiEditor && !(await getActiveNitro())) {
      return Response.json({ error: 'Nébula Nitro ativo é necessário' }, { status: 403 });
    }

    const changes = sanitizeChanges(body?.changes);
    if (Object.prototype.hasOwnProperty.call(changes, 'nitro_badges')) {
      const rank: Record<string, number> = { user: 0, support: 40, staff: 60, moderator: 60, admin: 80, dev: 90, owner: 100 };
      const userRank = rank[role] || 0;
      const nitroActive = await getActiveNitro();
      changes.nitro_badges = (changes.nitro_badges || []).filter((badge: string) => {
        if (badge === 'developer') return userRank >= 90;
        if (badge === 'supporter') return nitroActive;
        if (badge === 'hypesquad') return userRank >= 60;
        if (badge === 'booster') return nitroActive;
        return false;
      });
    }
    const uiConfig = sanitizeUiConfig(body?.ui_config);
    if (!Object.keys(changes).length && !uiConfig) {
      return Response.json({ error: 'Nenhuma alteração válida' }, { status: 400 });
    }

    let nextProfile = user.profile || {};
    if (Object.keys(changes).length) {
      nextProfile = { ...nextProfile, ...changes };
      await svc.entities.User.update(user.id, { profile: nextProfile });
    }

    let uiSetting: any = null;
    if (uiConfig) {
      uiSetting = await upsertUiSetting(svc, user.id, uiConfig);
    }

    return Response.json({
      ok: true,
      profile: nextProfile,
      ui_setting_id: uiSetting?.id || '',
    }, { headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' } });
  } catch (error: any) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    const status = Number(error?.status) || 500;
    return Response.json({ error: status === 400 ? error.message : 'Falha ao salvar personalização Nitro' }, { status });
  }
}
