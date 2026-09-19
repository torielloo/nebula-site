import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const PLAN_DAYS: Record<string, number> = {
  nitro_mensal: 30,
  nitro_anual: 365,
  nitro_90: 90,
};

const DAY_MS = 86_400_000;

function expiresAtFor(row: any) {
  if (row?.expires_at) {
    const parsed = new Date(row.expires_at).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  const anchor = new Date(row?.approved_at || row?.updated_date || row?.created_date || 0).getTime();
  if (!Number.isFinite(anchor)) return 0;
  return anchor + (PLAN_DAYS[row?.plan] || 30) * DAY_MS;
}

async function resetNitroAppearance(svc: any, user: any) {
  const profile = user?.profile || {};
  const nextProfile = {
    ...profile,
    accent: '',
    accent_2: '',
    accent_source: '',
    background_url: '',
    frame: '',
    custom_tag: '',
    theme: 'nebula',
    sounds: { notify: true, call: true },
  };

  await svc.entities.User.update(user.id, { profile: nextProfile });
  const uiRows = await svc.entities.UiSetting.filter({ created_by_id: user.id }, '-created_date', 20).catch(() => []);
  await Promise.all((uiRows || []).map((row: any) => svc.entities.UiSetting.update(row.id, { data: {} }).catch(() => null)));
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, {
      route: 'nitroState',
      user,
      body,
      limit: 24,
      windowMs: 60_000,
      maxBodyBytes: 2000,
    });

    const svc = base44.asServiceRole;
    const rows = await svc.entities.NitroRequest.filter({ user_id: user.id }, '-created_date', 100).catch(() => []);
    const now = Date.now();
    const approved = (rows || []).filter((row: any) => row.status === 'approved');
    let activeUntil = 0;
    let expiredAny = (rows || []).some((row: any) => row.status === 'expired');

    for (const row of approved) {
      const expiresAt = expiresAtFor(row);
      if (!expiresAt) continue;
      if (!row.expires_at) {
        await svc.entities.NitroRequest.update(row.id, {
          approved_at: row.approved_at || row.updated_date || row.created_date || new Date().toISOString(),
          expires_at: new Date(expiresAt).toISOString(),
        }).catch(() => null);
      }
      if (expiresAt > now) {
        activeUntil = Math.max(activeUntil, expiresAt);
      } else {
        expiredAny = true;
        await svc.entities.NitroRequest.update(row.id, {
          status: 'expired',
          expired_at: row.expired_at || new Date().toISOString(),
          expires_at: new Date(expiresAt).toISOString(),
        }).catch(() => null);
      }
    }

    const active = activeUntil > now;
    let reset = false;
    if (!active && expiredAny) {
      await resetNitroAppearance(svc, user);
      reset = true;
    }

    return Response.json({
      active,
      valid_until: active ? new Date(activeUntil).toISOString() : null,
      reset,
    });
  } catch (error) {
    const guarded = securityResponse(error);
    if (guarded) return guarded;
    return Response.json({ error: 'Falha ao sincronizar o Nitro' }, { status: 500 });
  }
}
