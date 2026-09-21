import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const VALID_PLANS = new Set(['nitro_mensal', 'nitro_anual']);
const TEN_MINUTES = 10 * 60 * 1000;
const DAY_MS = 86_400_000;
const PLAN_DAYS: Record<string, number> = { nitro_mensal: 30, nitro_anual: 365, nitro_90: 90 };

function clean(value:any, max=120) {
  return String(value ?? '').trim().slice(0, max);
}

function displayName(user:any) {
  const p = user?.profile || {};
  return clean(p.display_name || p.name || p.discord_username || user?.full_name || (user?.email || '').split('@')[0] || 'Usuário', 120);
}

function randomToken(bytesLength = 32) {
  // Hex minúsculo evita qualquer alteração de caixa/normalização feita por
  // leitores de QR, navegadores ou proxies no caminho da URL. Continua com
  // 256 bits de entropia usando 32 bytes aleatórios criptograficamente seguros.
  const bytes = new Uint8Array(bytesLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(value:string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function audit(svc:any, payload:any) {
  await svc.entities.NitroReceiptAudit.create({
    request_id: clean(payload.request_id, 120),
    user_id: clean(payload.user_id, 120),
    actor_id: clean(payload.actor_id, 120),
    actor_name: clean(payload.actor_name, 120),
    actor_role: clean(payload.actor_role, 40),
    action: payload.action,
    details: clean(payload.details, 500),
    created_at: new Date().toISOString(),
    ip_hash: clean(payload.ip_hash, 128),
  }).catch(() => null);
}

function requestExpiresAt(row:any) {
  if (row?.expires_at) {
    const parsed = new Date(row.expires_at).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const anchor = new Date(row?.approved_at || row?.updated_date || row?.created_date || 0).getTime();
  if (!Number.isFinite(anchor) || anchor <= 0) return 0;
  return anchor + (PLAN_DAYS[row?.plan] || 30) * DAY_MS;
}

function activeNitroUntil(rows:any[]) {
  const now = Date.now();
  let until = 0;
  for (const row of rows || []) {
    if (row?.status !== 'approved') continue;
    const expires = requestExpiresAt(row);
    if (expires > now) until = Math.max(until, expires);
  }
  return until;
}

function isExpired(session:any) {
  const expires = new Date(session?.expires_at || 0).getTime();
  return !Number.isFinite(expires) || expires <= Date.now();
}

async function expireSession(svc:any, session:any, actor:any = null) {
  if (!session || session.status === 'received' || session.status === 'expired') return session;
  const updated = await svc.entities.NitroReceiptUploadSession.update(session.id, {
    status: 'expired',
    lock_token: '',
    last_error: 'Sessão expirada',
  }).catch(() => ({ ...session, status: 'expired' }));
  await audit(svc, {
    request_id: session.request_id,
    user_id: session.user_id,
    actor_id: actor?.id || '',
    actor_name: actor ? displayName(actor) : 'Sistema',
    actor_role: actor?.role || 'system',
    action: 'qr_expired',
    details: 'Sessão temporária de envio de comprovante expirada.',
  });
  return updated;
}

export default async function(req:Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action || 'create', 30);
    const guard = await guardRequest(req, base44, {
      route: 'nitroReceiptSession',
      user,
      body,
      strict: true,
      limit: action === 'create' ? 8 : 40,
      windowMs: 60_000,
      maxBodyBytes: 4000,
    });
    const svc = base44.asServiceRole;

    if (action === 'status') {
      const sessionId = clean(body?.session_id, 120);
      if (!sessionId) return Response.json({ error: 'Sessão inválida' }, { status: 400 });
      let session = await svc.entities.NitroReceiptUploadSession.get(sessionId).catch(() => null);
      if (!session || session.user_id !== user.id) return Response.json({ error: 'Sessão não encontrada' }, { status: 404 });
      if (isExpired(session) && !['received', 'expired'].includes(session.status)) session = await expireSession(svc, session, user);

      const request = await svc.entities.NitroRequest.get(session.request_id).catch(() => null);
      const safeRequest = request?.user_id === user.id ? request : null;
      return Response.json({
        session_id: session.id,
        status: session.status,
        expires_at: session.expires_at,
        request_id: session.request_id,
        receipt_status: safeRequest?.receipt_status || 'none',
        receipt_received_at: safeRequest?.receipt_received_at || '',
        can_regenerate: session.status === 'expired' || session.status === 'failed',
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action !== 'create') return Response.json({ error: 'Ação inválida' }, { status: 400 });

    const plan = clean(body?.plan, 40);
    if (!VALID_PLANS.has(plan)) return Response.json({ error: 'Plano inválido' }, { status: 400 });
    const source = body?.source === 'pc' ? 'pc' : 'mobile_qr';
    const requestedId = clean(body?.request_id, 120);
    const forceRegenerate = body?.force_regenerate === true;

    const [filteredResult, listedResult] = await Promise.allSettled([
      svc.entities.NitroRequest.filter({ user_id: user.id }, '-created_date', 150),
      svc.entities.NitroRequest.list('-created_date', 300),
    ]);
    if (filteredResult.status === 'rejected' && listedResult.status === 'rejected') {
      return Response.json({
        error: 'Não foi possível sincronizar sua compra Nitro agora. Tente novamente em instantes.',
        code: 'nitro_state_unavailable',
        retryable: true,
      }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '2' } });
    }
    const filteredRequests = filteredResult.status === 'fulfilled' ? filteredResult.value : [];
    const listedRequests = listedResult.status === 'fulfilled' ? listedResult.value : [];
    const allRequests = Array.from(new Map([
      ...(filteredRequests || []),
      ...(listedRequests || []).filter((row:any) => row?.user_id === user.id),
    ].map((row:any) => [row.id, row])).values());
    const activeUntil = activeNitroUntil(allRequests || []);
    if (activeUntil > Date.now()) {
      return Response.json({
        error: 'Seu Nébula Nitro já está ativo. Uma nova compra só poderá ser solicitada após a assinatura expirar.',
        code: 'nitro_already_active',
        valid_until: new Date(activeUntil).toISOString(),
      }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }
    let request = null;

    if (requestedId) {
      request = await svc.entities.NitroRequest.get(requestedId).catch(() => null);
      // O ID vindo do navegador é apenas uma dica. Se ele estiver stale
      // (apagado/reaberto em outra aba, cache antigo etc.), reconciliamos pela
      // conta autenticada em vez de quebrar o fluxo com "não encontrada".
      if (request && request.user_id !== user.id) request = null;
      if (request) {
        if (request.status !== 'pending') return Response.json({ error: 'Esta solicitação não aceita novo comprovante' }, { status: 409 });
        if (request.receipt_status === 'received' || request.receipt_file_uri) {
          return Response.json({ error: 'O comprovante desta solicitação já foi recebido' }, { status: 409 });
        }
      }
    }

    if (!request) {
      const blocking = (allRequests || []).find((row:any) =>
        row.status === 'code_issued'
        || (row.status === 'pending' && (row.receipt_status === 'received' || row.receipt_file_uri))
      );
      if (blocking) {
        return Response.json({
          error: blocking.status === 'code_issued'
            ? 'Você já possui um código Nitro aguardando resgate.'
            : 'Você já possui uma compra Nitro aguardando análise.',
          request_id: blocking.id,
        }, { status: 409 });
      }

      request = (allRequests || []).find((row:any) =>
        row.status === 'pending'
        && !row.receipt_file_uri
        && ['none', 'awaiting_mobile', 'uploading', 'processing', undefined, null].includes(row.receipt_status)
      ) || null;
    }

    if (request && request.plan !== plan) {
      return Response.json({ error: 'Finalize ou cancele a solicitação atual antes de trocar o plano.' }, { status: 409 });
    }

    const now = Date.now();
    const sessionsResult = await Promise.allSettled([
      svc.entities.NitroReceiptUploadSession.filter({ user_id: user.id }, '-created_date', 30),
      svc.entities.NitroReceiptUploadSession.list('-created_date', 120),
    ]);
    const recentSessions = Array.from(new Map([
      ...(sessionsResult[0].status === 'fulfilled' ? sessionsResult[0].value : []),
      ...(sessionsResult[1].status === 'fulfilled'
        ? (sessionsResult[1].value || []).filter((row:any) => row?.user_id === user.id)
        : []),
    ].map((row:any) => [row.id, row])).values());

    if (!request) {
      request = await svc.entities.NitroRequest.create({
        code: `NBQ-${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`,
        user_id: user.id,
        user_name: displayName(user),
        plan,
        status: 'pending',
        source: 'purchase',
        receipt_status: source === 'pc' ? 'none' : 'awaiting_mobile',
        receipt_source: source,
        rejection_reason: '',
      });
    }

    const activeForRequest = [];
    const seenSessionIds = new Set<string>();

    // Primeiro consulta diretamente a sessão apontada pela solicitação. Isso é
    // importante logo após a criação, quando filtros/listagens ainda podem estar
    // com consistência eventual e não enxergar o registro recém-criado.
    if (request.receipt_upload_session_id) {
      const current = await svc.entities.NitroReceiptUploadSession.get(request.receipt_upload_session_id).catch(() => null);
      if (current && current.request_id === request.id && ['waiting', 'uploading', 'processing'].includes(current.status)) {
        if (isExpired(current)) {
          await expireSession(svc, current, user).catch(() => null);
        } else {
          activeForRequest.push(current);
          seenSessionIds.add(current.id);
        }
      }
    }

    for (const row of recentSessions || []) {
      if (seenSessionIds.has(row.id)) continue;
      if (row.request_id !== request.id || !['waiting', 'uploading', 'processing'].includes(row.status)) continue;
      if (isExpired(row)) {
        await expireSession(svc, row, user).catch(() => null);
        continue;
      }
      activeForRequest.push(row);
      seenSessionIds.add(row.id);
    }

    // Nunca invalide silenciosamente um QR que já pode estar aberto no celular.
    // Uma segunda criação acidental (remount, duplo clique, duas abas) deve manter
    // a sessão anterior válida. Só uma regeneração EXPLÍCITA pode substituí-la.
    if (activeForRequest.length && !forceRegenerate) {
      const current = activeForRequest[0];
      return Response.json({
        error: 'Já existe um QR Code ativo para esta compra. Use o QR já exibido ou escolha regenerar explicitamente.',
        code: 'active_qr_exists',
        session_id: current.id,
        request_id: request.id,
        expires_at: current.expires_at,
        status: current.status,
      }, { status: 409, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' } });
    }

    const recentCreated = (recentSessions || []).filter((row:any) => {
      const created = new Date(row.created_at || row.created_date || 0).getTime();
      return Number.isFinite(created) && now - created < TEN_MINUTES;
    });
    // Rate limit só bloqueia a criação de uma NOVA sessão. Reutilizar/consultar
    // uma sessão existente nunca deve prender o checkout.
    if (!activeForRequest.length && recentCreated.length >= 10) {
      return Response.json({ error: 'Muitos QR Codes gerados em pouco tempo. Aguarde alguns minutos.', retryable: true }, { status: 429 });
    }

    const regenerated = forceRegenerate && activeForRequest.length > 0;
    if (forceRegenerate) {
      for (const old of activeForRequest) {
        await svc.entities.NitroReceiptUploadSession.update(old.id, {
          status: 'expired',
          lock_token: '',
          last_error: 'Substituída por regeneração explícita no PC',
        }).catch(() => null);
      }
    }

    const token = randomToken(32);
    const tokenHash = await sha256(token);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + TEN_MINUTES);
    const session = await svc.entities.NitroReceiptUploadSession.create({
      token_hash: tokenHash,
      user_id: user.id,
      request_id: request.id,
      plan,
      status: 'waiting',
      created_at: createdAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      upload_started_at: '',
      upload_finished_at: '',
      consumed_at: '',
      last_error: '',
      attempt_count: 0,
      lock_token: '',
      created_ip_hash: guard.ipHash || '',
      upload_ip_hash: '',
    });

    await svc.entities.NitroRequest.update(request.id, {
      receipt_status: source === 'pc' ? 'none' : 'awaiting_mobile',
      receipt_source: source,
      receipt_upload_session_id: session.id,
      rejection_reason: '',
    }).catch(() => null);

    await audit(svc, {
      request_id: request.id,
      user_id: user.id,
      actor_id: user.id,
      actor_name: displayName(user),
      actor_role: user.role || 'user',
      action: regenerated ? 'qr_regenerated' : 'qr_created',
      details: regenerated
        ? 'Nova sessão temporária de comprovante criada após invalidar a anterior.'
        : 'Sessão temporária de comprovante criada.',
      ip_hash: guard.ipHash || '',
    });

    return Response.json({
      session_id: session.id,
      request_id: request.id,
      token,
      expires_at: expiresAt.toISOString(),
      status: 'waiting',
      source,
    }, { status: 201, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' } });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao criar sessão de comprovante' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
