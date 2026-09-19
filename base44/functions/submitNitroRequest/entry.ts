import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const VALID_PLANS = ['nitro_mensal', 'nitro_anual'];
const PLAN_DAYS = { nitro_mensal: 30, nitro_anual: 365, nitro_90: 90 };
const DAY_MS = 86_400_000;

function expiresAtFor(row) {
  if (row?.expires_at) {
    const parsed = new Date(row.expires_at).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  const anchor = new Date(row?.approved_at || row?.updated_date || row?.created_date || 0).getTime();
  if (!Number.isFinite(anchor)) return 0;
  return anchor + (PLAN_DAYS[row?.plan] || 30) * DAY_MS;
}

function isSafeReceiptUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => null);
    await guardRequest(req, base44, { route: 'submitNitroRequest', user, body, strict: true, limit: 6, windowMs: 60000, maxBodyBytes: 5000 });
    const receiptUrl = body && body.receipt_url;
    const plan = body && body.plan;

    const svc = base44.asServiceRole;
    const existing = await svc.entities.NitroRequest.filter({ user_id: user.id }, '-created_date', 100).catch(() => []);
    const now = Date.now();

    // Uma pessoa só pode ter uma solicitação pendente por vez.
    const pending = (existing || []).find((row) => row.status === 'pending');
    if (pending) {
      return Response.json({
        error: 'Você já possui uma solicitação Nitro em análise.',
        code: 'nitro_request_pending',
        request_id: pending.id,
      }, { status: 409 });
    }

    // Enquanto houver Nitro ativo, não é permitido criar renovação antecipada.
    // Solicitações antigas expiradas não bloqueiam uma nova compra.
    let activeRequest = null;
    for (const row of existing || []) {
      if (row.status !== 'approved') continue;
      const expiresAt = expiresAtFor(row);
      if (expiresAt > now) {
        activeRequest = row;
        break;
      }
      if (expiresAt > 0) {
        await svc.entities.NitroRequest.update(row.id, {
          status: 'expired',
          expires_at: new Date(expiresAt).toISOString(),
          expired_at: row.expired_at || new Date().toISOString(),
        }).catch(() => null);
      }
    }

    if (activeRequest) {
      const expiresAt = expiresAtFor(activeRequest);
      return Response.json({
        error: 'Você já possui Nébula Nitro ativo. Aguarde o período atual terminar para solicitar novamente.',
        code: 'nitro_already_active',
        valid_until: expiresAt ? new Date(expiresAt).toISOString() : null,
      }, { status: 409 });
    }

    if (!isSafeReceiptUrl(receiptUrl)) {
      return Response.json({ error: 'URL de comprovante inválida' }, { status: 400 });
    }
    if (!VALID_PLANS.includes(plan)) {
      return Response.json({ error: 'Plano inválido' }, { status: 400 });
    }

    const request = await svc.entities.NitroRequest.create({
      code: `NB-${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      user_id: user.id,
      user_name: user.full_name || (user.email || 'Você').split('@')[0],
      receipt_url: receiptUrl,
      plan,
      status: 'pending',
    });
    return Response.json({ request });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao enviar solicitação' }, { status: 500 });
  }
}