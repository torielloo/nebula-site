import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const PLAN_DAYS: Record<string, number> = { nitro_mensal: 30, nitro_anual: 365, nitro_90: 90 };
const STYLE_KEYS = new Set(['accent', 'accent_2', 'background_url', 'frame', 'custom_tag', 'theme', 'sounds']);

function expiresAtFor(row: any) {
  if (row?.expires_at) {
    const parsed = new Date(row.expires_at).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const anchor = new Date(row?.approved_at || row?.updated_date || row?.created_date || 0).getTime();
  if (!Number.isFinite(anchor) || anchor <= 0) return 0;
  return anchor + (PLAN_DAYS[row?.plan] || 30) * 86_400_000;
}

async function hasActiveNitro(svc: any, userId: string) {
  const rows = await svc.entities.NitroRequest.filter({ user_id: userId }, '-created_date', 100).catch(() => []);
  const now = Date.now();
  return (rows || []).some((row: any) => row.status === 'approved' && expiresAtFor(row) > now);
}

function safeColor(value: unknown) {
  if (value === null || value === '') return '';
  const v = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

function sanitizeChanges(raw: any) {
  const changes: any = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (!STYLE_KEYS.has(key)) continue;
    if (key === 'accent' || key === 'accent_2') {
      const color = safeColor(value);
      if (color === null) throw Object.assign(new Error('Cor inválida'), { status: 400 });
      changes[key] = color;
    } else if (key === 'background_url') {
      const v = String(value || '').trim().slice(0, 2048);
      if (v && !/^https:\/\//i.test(v)) throw Object.assign(new Error('URL inválida'), { status: 400 });
      changes[key] = v;
    } else if (key === 'frame') {
      const v = String(value || '');
      changes.frame = ['', 'neon', 'gold', 'aurora'].includes(v) ? v : '';
    } else if (key === 'custom_tag') {
      changes.custom_tag = String(value || '').trim().toUpperCase().slice(0, 16);
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
      limit: 40,
      windowMs: 60_000,
      maxBodyBytes: 12_000,
    });

    const svc = base44.asServiceRole;
    if (!(await hasActiveNitro(svc, user.id))) {
      return Response.json({ error: 'Nébula Nitro ativo é necessário' }, { status: 403 });
    }

    const changes = sanitizeChanges(body?.changes);
    if (!Object.keys(changes).length) return Response.json({ error: 'Nenhuma alteração válida' }, { status: 400 });

    const current = user.profile || {};
    const nextProfile = { ...current, ...changes };
    await svc.entities.User.update(user.id, { profile: nextProfile });
    return Response.json({ ok: true, profile: nextProfile });
  } catch (error: any) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    const status = Number(error?.status) || 500;
    return Response.json({ error: status === 400 ? error.message : 'Falha ao salvar personalização Nitro' }, { status });
  }
}
