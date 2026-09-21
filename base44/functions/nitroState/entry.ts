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
    custom_frame_url: '',
    name_gradient_a: '',
    name_gradient_b: '',
    cursor_effect: 'none',
    nitro_pronouns: '',
    nitro_status_text: '',
    nitro_about: '',
    custom_tag: '',
    theme: 'nebula',
    sounds: { notify: true, call: true },
    nitro_reset_pending: true,
    nitro_reset_at: new Date().toISOString(),
  };

  await svc.entities.User.update(user.id, { profile: nextProfile });
  const [ownedByField, legacyOwned] = await Promise.all([
    svc.entities.UiSetting.filter({ user_id: user.id }, '-created_date', 20).catch(() => []),
    svc.entities.UiSetting.filter({ created_by_id: user.id }, '-created_date', 20).catch(() => []),
  ]);
  const uiRows = Array.from(new Map([...(ownedByField || []), ...(legacyOwned || [])].map((row: any) => [row.id, row])).values());
  await Promise.all(uiRows.map((row: any) => svc.entities.UiSetting.update(row.id, { data: {}, user_id: user.id }).catch(() => null)));
  return nextProfile;
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
    const [filteredResult, listedResult] = await Promise.allSettled([
      svc.entities.NitroRequest.filter({ user_id: user.id }, '-created_date', 150),
      svc.entities.NitroRequest.list('-created_date', 300),
    ]);
    if (filteredResult.status === 'rejected' && listedResult.status === 'rejected') {
      return Response.json({ error: 'Estado Nitro temporariamente indisponível', retryable: true }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '1' },
      });
    }
    const filteredRows = filteredResult.status === 'fulfilled' ? filteredResult.value : [];
    const listedRows = listedResult.status === 'fulfilled' ? listedResult.value : [];
    const rows = Array.from(new Map([
      ...(filteredRows || []),
      ...(listedRows || []).filter((row: any) => row?.user_id === user.id),
    ].map((row: any) => [row.id, row])).values());
    const now = Date.now();
    const resetFloor = new Date(user?.profile?.nitro_reset_at || 0).getTime();
    const approved = (rows || []).filter((row: any) => row.status === 'approved');
    let activeUntil = 0;
    let expiredJustNow = false;

    for (const row of approved) {
      const approvedAnchor = new Date(row?.approved_at || row?.updated_date || row?.created_date || 0).getTime();
      if (Number.isFinite(resetFloor) && resetFloor > 0 && Number.isFinite(approvedAnchor) && approvedAnchor <= resetFloor) {
        await svc.entities.NitroRequest.update(row.id, {
          status: 'expired',
          expires_at: row.expires_at || new Date(resetFloor).toISOString(),
          expired_at: row.expired_at || new Date(resetFloor).toISOString(),
          rejection_reason: row.rejection_reason || 'Nitro removido/resetado pela equipe.',
        }).catch(() => null);
        continue;
      }

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
        expiredJustNow = true;
        await svc.entities.NitroRequest.update(row.id, {
          status: 'expired',
          expired_at: row.expired_at || new Date().toISOString(),
          expires_at: new Date(expiresAt).toISOString(),
        }).catch(() => null);
      }
    }

    const active = activeUntil > now;

    // Regra comercial: enquanto houver Nitro válido, não pode existir outra
    // compra pendente/emitida aguardando ativação. Limpa estados antigos que
    // foram criados antes desta validação existir.
    if (active) {
      for (const row of rows || []) {
        if (row?.source === 'nitro_code') continue;
        if (!['pending', 'code_issued'].includes(String(row?.status || ''))) continue;

        if (row?.nitro_code_id) {
          const code = await svc.entities.NitroCode.get(row.nitro_code_id).catch(() => null);
          if (code?.status === 'available') {
            await svc.entities.NitroCode.update(code.id, { status: 'revoked' }).catch(() => null);
          }
        }

        await svc.entities.NitroRequest.update(row.id, {
          status: 'expired',
          expired_at: row.expired_at || new Date().toISOString(),
          rejection_reason: 'Solicitação encerrada automaticamente porque o Nébula Nitro já está ativo.',
        }).catch(() => null);
      }
    }

    let reset = false;
    let resetProfile: any = null;

    // Expiração natural reseta tudo no servidor e sinaliza o cliente para
    // limpar preferências Nitro locais (beat, som, cache do UI Studio etc.).
    if (!active && expiredJustNow) {
      resetProfile = await resetNitroAppearance(svc, user);
      reset = true;
    } else if (!active && user?.profile?.nitro_reset_pending === true) {
      resetProfile = { ...(user.profile || {}) };
      reset = true;
    }

    // Consome o sinal uma única vez. O reset em si já foi persistido no
    // servidor; este flag existe só para o cliente apagar caches/preferências.
    if (reset && resetProfile) {
      await svc.entities.User.update(user.id, {
        profile: { ...resetProfile, nitro_reset_pending: false },
      }).catch(() => null);
    }

    const purchaseCodes = await svc.entities.NitroCode.filter({
      assigned_user_id: user.id,
      source: 'purchase',
    }, '-created_date', 100).catch(() => []);

    const publicRequests = rows
      .slice()
      .sort((a: any, b: any) =>
        (new Date(b.created_date || 0).getTime() || 0) - (new Date(a.created_date || 0).getTime() || 0)
      )
      .map((row: any) => ({
        id: row.id,
        code: row.code || '',
        user_id: row.user_id || '',
        user_name: row.user_name || '',
        plan: row.plan || 'nitro_mensal',
        status: row.status || 'pending',
        source: row.source || 'purchase',
        approved_at: row.approved_at || '',
        expires_at: row.expires_at || '',
        expired_at: row.expired_at || '',
        nitro_code_id: row.nitro_code_id || '',
        code_issued_at: row.code_issued_at || '',
        code_delivered_at: row.code_delivered_at || '',
        receipt_status: row.receipt_status || 'none',
        receipt_file_uri: row.receipt_file_uri ? 'private' : '',
        receipt_url: row.receipt_url || '',
        receipt_received_at: row.receipt_received_at || '',
        receipt_source: row.receipt_source || '',
        rejection_reason: row.rejection_reason || '',
        created_date: row.created_date || '',
        updated_date: row.updated_date || '',
      }));

    return Response.json({
      active,
      valid_until: active ? new Date(activeUntil).toISOString() : null,
      reset,
      requests: publicRequests,
      purchase_codes: (purchaseCodes || []).map((row: any) => ({
        id: row.id,
        request_id: row.request_id || '',
        code: row.code || '',
        status: row.status || '',
        generated_at: row.generated_at || row.created_date || '',
        used_at: row.used_at || '',
      })),
    }, { headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' } });
  } catch (error) {
    const guarded = securityResponse(error);
    if (guarded) return guarded;
    return Response.json({ error: 'Falha ao sincronizar o Nitro' }, { status: 500 });
  }
}
