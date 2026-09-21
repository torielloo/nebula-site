import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const PLAN_DAYS: Record<string, number> = {
  nitro_mensal: 30,
  nitro_anual: 365,
  nitro_90: 90,
};
const DAY_MS = 86_400_000;

function clean(value: unknown, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}

function userName(user: any) {
  const p = user?.profile || {};
  return clean(p.display_name || p.name || p.discord_username || user?.full_name || (user?.email || '').split('@')[0] || 'Usuário', 120);
}

function normalizeCode(value: unknown) {
  const raw = clean(value, 80)
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '');

  const compact = raw.replace(/-/g, '');
  if (/^NB[A-Z2-9]{12}$/.test(compact)) {
    return `NB-${compact.slice(2, 6)}-${compact.slice(6, 10)}-${compact.slice(10, 14)}`;
  }
  return raw;
}

async function findCodeRow(svc: any, inputCode: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const direct = await svc.entities.NitroCode.filter({ code: inputCode }, '-created_date', 5).catch(() => []);
    const exact = (direct || []).find((row: any) => normalizeCode(row?.code) === inputCode);
    if (exact) return exact;

    // A tabela pode apresentar consistência eventual logo após a geração.
    // Faz fallback pela listagem recente e compara o código normalizado.
    const recent = await svc.entities.NitroCode.list('-created_date', 500).catch(() => []);
    const listed = (recent || []).find((row: any) => normalizeCode(row?.code) === inputCode);
    if (listed) return listed;

    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
  }
  return null;
}

function randomChunk(size = 4) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

async function uniqueCode(svc: any) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = `NB-${randomChunk()}-${randomChunk()}-${randomChunk()}`;
    const exists = await svc.entities.NitroCode.filter({ code }, '-created_date', 1).catch(() => []);
    if (!exists?.length) return code;
  }
  throw new Error('Não foi possível gerar um código único agora');
}

function expiryForRequest(row: any) {
  if (row?.expires_at) {
    const parsed = new Date(row.expires_at).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  if (row?.status !== 'approved') return 0;
  const anchor = new Date(row?.approved_at || row?.updated_date || row?.created_date || 0).getTime();
  if (!Number.isFinite(anchor)) return 0;
  return anchor + (PLAN_DAYS[row?.plan] || 30) * DAY_MS;
}

async function currentNitroUntil(svc: any, userId: string) {
  const rows = await svc.entities.NitroRequest.filter({ user_id: userId }, '-created_date', 150).catch(() => []);
  const now = Date.now();
  let until = 0;
  for (const row of rows || []) {
    if (row.status !== 'approved') continue;
    const expiresAt = expiryForRequest(row);
    if (expiresAt > now) until = Math.max(until, expiresAt);
  }
  return until;
}

async function markExpiredIfNeeded(svc: any, row: any) {
  if (!row || row.status !== 'available' || !row.expires_at) return row;
  const expiresAt = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt > Date.now()) return row;
  return await svc.entities.NitroCode.update(row.id, { status: 'expired' }).catch(() => ({ ...row, status: 'expired' }));
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action || 'redeem', 30);
    await guardRequest(req, base44, {
      route: 'nitroCodes',
      user,
      body,
      strict: true,
      limit: action === 'redeem' ? 12 : 40,
      windowMs: 60_000,
      maxBodyBytes: 5000,
    });

    const svc = base44.asServiceRole;

    if (action === 'my_purchase_codes') {
      const rows = await svc.entities.NitroCode.filter({
        assigned_user_id: user.id,
        source: 'purchase',
      }, '-created_date', 100).catch(() => []);
      const codes = [];
      for (const row of rows || []) {
        const normalized = await markExpiredIfNeeded(svc, row);
        codes.push({
          id: normalized.id,
          request_id: normalized.request_id || '',
          code: normalized.code || '',
          status: normalized.status || '',
          generated_at: normalized.generated_at || normalized.created_date || '',
          used_at: normalized.used_at || '',
        });
      }
      return Response.json({ codes }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'list') {
      if (user.role !== 'owner') return Response.json({ error: 'Somente Owner pode visualizar códigos Nitro' }, { status: 403 });

      // O painel de sorteios só precisa dos códigos manuais. Consulta direta
      // evita esperar a tabela inteira de códigos de compra/histórico.
      let rows: any[] = [];
      try {
        rows = await svc.entities.NitroCode.filter({ source: 'manual' }, '-created_date', 300);
      } catch {
        return Response.json({ error: 'Não foi possível carregar os códigos agora.', retryable: true }, {
          status: 503,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': '1' },
        });
      }

      const normalized = [];
      for (const row of rows || []) normalized.push(await markExpiredIfNeeded(svc, row));
      return Response.json({
        codes: normalized,
        snapshot_complete: true,
      }, { headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' } });
    }

    if (action === 'generate') {
      if (user.role !== 'owner') return Response.json({ error: 'Somente Owner pode gerar códigos Nitro' }, { status: 403 });
      const plan = clean(body?.plan || 'nitro_mensal', 40);
      let durationDays = Number(body?.duration_days);
      if (plan === 'nitro_mensal') durationDays = 30;
      else if (plan === 'nitro_anual') durationDays = 365;
      else if (plan !== 'nitro_custom') return Response.json({ error: 'Plano inválido' }, { status: 400 });

      durationDays = Math.floor(durationDays);
      if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 3650) {
        return Response.json({ error: 'Duração inválida' }, { status: 400 });
      }

      const validityDays = Math.max(0, Math.min(3650, Math.floor(Number(body?.code_valid_days) || 0)));
      const now = new Date();
      const code = await uniqueCode(svc);
      const created = await svc.entities.NitroCode.create({
        code,
        plan,
        duration_days: durationDays,
        status: 'available',
        source: 'manual',
        generated_by: user.id,
        generated_by_name: userName(user),
        generated_at: now.toISOString(),
        expires_at: validityDays ? new Date(now.getTime() + validityDays * DAY_MS).toISOString() : '',
        used_by: '',
        used_by_name: '',
        used_at: '',
        activation_request_id: '',
        request_id: '',
        assigned_user_id: '',
        assigned_user_name: '',
        dm_sent_at: '',
        claim_token: '',
      });
      return Response.json({ code: created }, {
        status: 201,
        headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' },
      });
    }

    if (action === 'revoke') {
      if (user.role !== 'owner') return Response.json({ error: 'Somente Owner pode revogar códigos Nitro' }, { status: 403 });
      const id = clean(body?.code_id, 120);
      if (!id) return Response.json({ error: 'Código inválido' }, { status: 400 });

      const code = await svc.entities.NitroCode.get(id).catch(() => null);
      if (!code) return Response.json({ error: 'Código não encontrado' }, { status: 404 });
      if (code.status === 'used') return Response.json({ error: 'Código já utilizado não pode ser revogado' }, { status: 409 });
      if (code.status === 'revoked') {
        return Response.json({ code }, { headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' } });
      }

      const updated = await svc.entities.NitroCode.update(code.id, {
        status: 'revoked',
        claim_token: '',
      });
      if (!updated?.id || updated.status !== 'revoked') {
        return Response.json({ error: 'Não foi possível confirmar a revogação do código' }, { status: 500 });
      }
      return Response.json({ code: updated }, { headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' } });
    }

    if (action !== 'redeem') return Response.json({ error: 'Ação inválida' }, { status: 400 });

    const inputCode = normalizeCode(body?.code);
    if (!/^NB-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(inputCode)) {
      return Response.json({ error: 'Código Nitro inválido' }, { status: 400 });
    }

    let codeRow = await findCodeRow(svc, inputCode);
    if (!codeRow) return Response.json({ error: 'Código Nitro não encontrado' }, { status: 404 });
    codeRow = await markExpiredIfNeeded(svc, codeRow);

    if (codeRow.source === 'purchase' && codeRow.assigned_user_id && codeRow.assigned_user_id !== user.id) {
      return Response.json({ error: 'Este código foi emitido para outro usuário' }, { status: 403 });
    }

    if (codeRow.status === 'used') {
      if (codeRow.used_by === user.id) {
        let activationRows = codeRow.activation_request_id
          ? await svc.entities.NitroRequest.filter({ id: codeRow.activation_request_id }, '-created_date', 1).catch(() => [])
          : [];
        if (!activationRows?.length) {
          activationRows = await svc.entities.NitroRequest.filter({ nitro_code_id: codeRow.id, user_id: user.id }, '-created_date', 10).catch(() => []);
        }

        let activation = (activationRows || []).find((row: any) => row.status === 'approved') || null;

        // Recupera resgates antigos que ficaram marcados como "used" antes da
        // criação/ativação da assinatura terminar. Isso torna o resgate
        // idempotente e evita o usuário perder o Nitro por uma interrupção.
        if (!activation) {
          const recoveredAt = new Date();
          const currentUntil = await currentNitroUntil(svc, user.id);
          const startsAt = Math.max(Date.now(), currentUntil);
          const expiresAt = new Date(startsAt + Number(codeRow.duration_days || 30) * DAY_MS);

          if (codeRow.source === 'purchase' && codeRow.request_id) {
            const purchaseRows = await svc.entities.NitroRequest.filter({
              id: codeRow.request_id,
              user_id: user.id,
            }, '-created_date', 1).catch(() => []);
            const purchase = purchaseRows?.[0];
            if (purchase && !['rejected', 'expired'].includes(purchase.status)) {
              activation = await svc.entities.NitroRequest.update(purchase.id, {
                status: 'approved',
                approved_at: purchase.approved_at || codeRow.used_at || recoveredAt.toISOString(),
                expires_at: expiresAt.toISOString(),
                expired_at: '',
                source: 'purchase',
                nitro_code_id: codeRow.id,
              });
            }
          } else {
            activation = await svc.entities.NitroRequest.create({
              code: `NC-${codeRow.id.slice(-8).toUpperCase()}`,
              user_id: user.id,
              user_name: userName(user),
              plan: codeRow.plan || 'nitro_custom',
              status: 'approved',
              approved_at: codeRow.used_at || recoveredAt.toISOString(),
              expires_at: expiresAt.toISOString(),
              expired_at: '',
              source: 'nitro_code',
              nitro_code_id: codeRow.id,
            });
          }
        }

        if (activation?.status === 'approved') {
          await svc.entities.NitroCode.update(codeRow.id, {
            activation_request_id: activation.id,
            claim_token: '',
          }).catch(() => null);
        }

        return Response.json({
          ok: true,
          already_redeemed: true,
          repaired_activation: Boolean(activation?.status === 'approved' && !codeRow.activation_request_id),
          valid_until: activation?.status === 'approved' ? (activation.expires_at || null) : null,
        });
      }
      return Response.json({ error: 'Este código já foi utilizado' }, { status: 409 });
    }
    if (codeRow.status === 'expired') return Response.json({ error: 'Este código expirou' }, { status: 410 });
    if (codeRow.status === 'revoked') return Response.json({ error: 'Este código foi revogado' }, { status: 410 });
    if (codeRow.status !== 'available') return Response.json({ error: 'Código indisponível' }, { status: 409 });

    const claimToken = crypto.randomUUID();
    const now = new Date();
    await svc.entities.NitroCode.update(codeRow.id, {
      status: 'used',
      used_by: user.id,
      used_by_name: userName(user),
      used_at: now.toISOString(),
      claim_token: claimToken,
    });
    // Pequena janela de confirmação para resolver duas tentativas
    // simultâneas. Ambas podem ter lido "available", mas somente o token que
    // permanecer gravado após a disputa pode continuar para a ativação.
    await new Promise((resolve) => setTimeout(resolve, 120));
    const claimed = await svc.entities.NitroCode.get(codeRow.id).catch(() => null);
    if (!claimed || claimed.status !== 'used' || claimed.used_by !== user.id || claimed.claim_token !== claimToken) {
      return Response.json({ error: 'Este código foi resgatado em outra sessão' }, { status: 409 });
    }

    await new Promise((resolve) => setTimeout(resolve, 80));
    const stableClaim = await svc.entities.NitroCode.get(codeRow.id).catch(() => null);
    if (!stableClaim || stableClaim.claim_token !== claimToken || stableClaim.used_by !== user.id) {
      return Response.json({ error: 'Este código foi resgatado em outra sessão' }, { status: 409 });
    }

    let activationDone = false;
    try {
      const linkedActivations = await svc.entities.NitroRequest.filter({ nitro_code_id: codeRow.id }, '-created_date', 10).catch(() => []);
      let activationRequest = (linkedActivations || []).find((row: any) => row.status === 'approved') || null;

      if (!activationRequest) {
        const currentUntil = await currentNitroUntil(svc, user.id);
        const startsAt = Math.max(Date.now(), currentUntil);
        const expiresAt = new Date(startsAt + Number(codeRow.duration_days || 30) * DAY_MS);

        if (codeRow.source === 'purchase' && codeRow.request_id) {
          const purchaseRows = await svc.entities.NitroRequest.filter({ id: codeRow.request_id, user_id: user.id }, '-created_date', 1).catch(() => []);
          const purchase = purchaseRows?.[0];
          if (!purchase) throw new Error('Solicitação de compra vinculada não encontrada');
          activationRequest = await svc.entities.NitroRequest.update(purchase.id, {
            status: 'approved',
            approved_at: purchase.approved_at || now.toISOString(),
            expires_at: expiresAt.toISOString(),
            expired_at: '',
            source: 'purchase',
            nitro_code_id: codeRow.id,
          });
        } else {
          activationRequest = await svc.entities.NitroRequest.create({
            code: `NC-${codeRow.id.slice(-8).toUpperCase()}`,
            user_id: user.id,
            user_name: userName(user),
            plan: codeRow.plan || 'nitro_custom',
            status: 'approved',
            approved_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            expired_at: '',
            source: 'nitro_code',
            nitro_code_id: codeRow.id,
          });
        }
      }

      activationDone = true;
      await svc.entities.NitroCode.update(codeRow.id, {
        status: 'used',
        used_by: user.id,
        used_by_name: userName(user),
        used_at: claimed.used_at || now.toISOString(),
        activation_request_id: activationRequest.id,
        claim_token: '',
      });

      return Response.json({
        ok: true,
        plan: codeRow.plan,
        duration_days: codeRow.duration_days,
        valid_until: activationRequest.expires_at || null,
      });
    } catch (error) {
      if (!activationDone) {
        const latest = await svc.entities.NitroCode.get(codeRow.id).catch(() => null);
        if (latest?.claim_token === claimToken && !latest?.activation_request_id) {
          await svc.entities.NitroCode.update(codeRow.id, {
            status: 'available',
            used_by: '',
            used_by_name: '',
            used_at: '',
            claim_token: '',
          }).catch(() => null);
        }
      }
      throw error;
    }
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: error instanceof Error ? error.message.slice(0, 220) : 'Falha ao processar código Nitro' }, { status: 500 });
  }
}
