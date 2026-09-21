import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const STAFF_ROLES = new Set(['owner', 'dev', 'admin', 'moderator', 'support', 'staff']);
const PLAN_DAYS: Record<string, number> = { nitro_mensal: 30, nitro_anual: 365, nitro_90: 90 };
const DAY_MS = 86_400_000;

function clean(value: unknown, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}

function nameOf(user: any) {
  const profile = user?.profile || {};
  return clean(profile.display_name || profile.name || profile.discord_username || user?.full_name || (user?.email || '').split('@')[0] || 'Staff', 120);
}

function isOwner(user: any) {
  return String(user?.role || '') === 'owner';
}

function adminView(row: any) {
  return {
    id: row.id,
    code: row.code || '',
    user_id: row.user_id || '',
    user_name: row.user_name || '',
    plan: row.plan || 'nitro_mensal',
    status: row.status || 'pending',
    source: row.source || 'purchase',
    receipt_url: hasLegacyReceipt(row.receipt_url) ? row.receipt_url : '',
    has_private_receipt: Boolean(row.receipt_file_uri),
    receipt_status: row.receipt_status || 'none',
    receipt_mime: row.receipt_mime || '',
    receipt_size: Number(row.receipt_size || 0),
    receipt_received_at: row.receipt_received_at || '',
    rejection_reason: row.rejection_reason || '',
    admin_note: row.admin_note || '',
    nitro_code_id: row.nitro_code_id || '',
    code_issued_at: row.code_issued_at || '',
    code_delivered_at: row.code_delivered_at || '',
    approved_at: row.approved_at || '',
    expires_at: row.expires_at || '',
    expired_at: row.expired_at || '',
    reviewed_by_id: row.reviewed_by_id || '',
    reviewed_by_name: row.reviewed_by_name || '',
    reviewed_at: row.reviewed_at || '',
    edited_by_id: row.edited_by_id || '',
    edited_by_name: row.edited_by_name || '',
    edited_at: row.edited_at || '',
    created_date: row.created_date || '',
    updated_date: row.updated_date || '',
  };
}

async function adminLog(svc: any, actor: any, action: string, requestId: string, details: string) {
  await svc.entities.StaffLog.create({
    actor_name: nameOf(actor),
    actor_id: actor.id,
    action: clean(action, 80),
    details: clean(details, 1000),
    target_id: clean(requestId, 120),
  }).catch(() => null);
}

function hasLegacyReceipt(value: unknown) {
  const raw = clean(value, 2048);
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function nitroExpiresAt(row: any) {
  if (row?.expires_at) {
    const parsed = new Date(row.expires_at).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const anchor = new Date(row?.approved_at || row?.updated_date || row?.created_date || 0).getTime();
  if (!Number.isFinite(anchor) || anchor <= 0) return 0;
  return anchor + (PLAN_DAYS[row?.plan] || 30) * DAY_MS;
}

async function activeNitroUntil(svc: any, userId: string, excludeRequestId = '') {
  const [filtered, listed] = await Promise.all([
    svc.entities.NitroRequest.filter({ user_id: userId }, '-created_date', 150).catch(() => []),
    svc.entities.NitroRequest.list('-created_date', 300).catch(() => []),
  ]);
  const rows = Array.from(new Map([
    ...(filtered || []),
    ...(listed || []).filter((row: any) => row?.user_id === userId),
  ].map((row: any) => [row.id, row])).values());
  const now = Date.now();
  let until = 0;
  for (const row of rows || []) {
    if (row?.id === excludeRequestId || row?.status !== 'approved') continue;
    const expires = nitroExpiresAt(row);
    if (expires > now) until = Math.max(until, expires);
  }
  return until;
}

async function resetNitroAppearance(svc: any, target: any) {
  const profile = target?.profile || {};
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
    nitro_reset_pending: true,
    nitro_reset_at: new Date().toISOString(),
  };
  await svc.entities.User.update(target.id, { profile: nextProfile });

  const [ownedByField, legacyOwned] = await Promise.all([
    svc.entities.UiSetting.filter({ user_id: target.id }, '-created_date', 50).catch(() => []),
    svc.entities.UiSetting.filter({ created_by_id: target.id }, '-created_date', 50).catch(() => []),
  ]);
  const settings = Array.from(new Map([
    ...(ownedByField || []),
    ...(legacyOwned || []),
  ].map((row: any) => [row.id, row])).values());
  await Promise.all(settings.map((row: any) =>
    svc.entities.UiSetting.update(row.id, { data: {}, user_id: target.id }).catch(() => null)
  ));
}

async function receiptAudit(svc: any, request: any, staff: any, action: 'approved' | 'rejected', details: string) {
  await svc.entities.NitroReceiptAudit.create({
    request_id: request.id,
    user_id: request.user_id,
    actor_id: staff.id,
    actor_name: nameOf(staff),
    actor_role: String(staff.role || 'staff'),
    action,
    details: clean(details, 500),
    created_at: new Date().toISOString(),
    ip_hash: '',
  }).catch(() => null);
}

async function expireOpenReceiptSessions(svc: any, requestId: string, reason: string) {
  const sessions = await svc.entities.NitroReceiptUploadSession.filter({ request_id: requestId }, '-created_date', 30).catch(() => []);
  for (const session of sessions || []) {
    if (!['waiting', 'uploading', 'processing', 'failed'].includes(session.status)) continue;
    await svc.entities.NitroReceiptUploadSession.update(session.id, {
      status: 'expired',
      lock_token: '',
      last_error: clean(reason, 220),
    }).catch(() => null);
  }
}

function randomChunk(size = 4) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

async function uniqueNitroCode(svc: any) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = `NB-${randomChunk()}-${randomChunk()}-${randomChunk()}`;
    const rows = await svc.entities.NitroCode.filter({ code }, '-created_date', 1).catch(() => []);
    if (!rows?.length) return code;
  }
  throw new Error('Não foi possível gerar um código Nitro único');
}

async function ensurePurchaseCode(svc: any, staff: any, request: any) {
  let codeRow = null;

  if (request.nitro_code_id) {
    codeRow = await svc.entities.NitroCode.get(request.nitro_code_id).catch(() => null);
  }
  if (!codeRow) {
    const byRequest = await svc.entities.NitroCode.filter({ request_id: request.id }, '-created_date', 10).catch(() => []);
    codeRow = (byRequest || []).find((row: any) => row.status === 'available' || row.status === 'used') || null;
  }

  // Código expirado/revogado nunca é reutilizado. Uma nova liberação gera
  // outro código único e mantém o antigo apenas no histórico do Owner.
  if (codeRow?.status === 'expired' || codeRow?.status === 'revoked') codeRow = null;

  if (!codeRow) {
    const now = new Date();
    const days = PLAN_DAYS[request.plan] || 30;
    codeRow = await svc.entities.NitroCode.create({
      code: await uniqueNitroCode(svc),
      plan: request.plan || 'nitro_mensal',
      duration_days: days,
      status: 'available',
      source: 'purchase',
      request_id: request.id,
      assigned_user_id: request.user_id,
      assigned_user_name: request.user_name || '',
      generated_by: staff.id,
      generated_by_name: nameOf(staff),
      generated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 30 * DAY_MS).toISOString(),
      used_by: '',
      used_by_name: '',
      used_at: '',
      activation_request_id: '',
      dm_sent_at: '',
      claim_token: '',
    });
  }
  return codeRow;
}

async function ensureCodeDm(svc: any, staff: any, target: any, request: any, codeRow: any) {
  const clientRequestId = `nitro-code:${request.id}:${codeRow.id}`;
  const existing = await svc.entities.DirectMessage.filter({ client_request_id: clientRequestId }, '-created_date', 1).catch(() => []);
  if (existing?.length) return { sent: true, message: existing[0] };

  const pairKey = [staff.id, target.id].sort().join(':');
  const conversations = await svc.entities.Conversation.list('created_date', 500).catch(() => []);
  let conversation = (conversations || []).find((conv: any) => {
    const participants = Array.isArray(conv.participants) ? conv.participants : [];
    return conv.pair_key === pairKey
      || (participants.length === 2 && participants.includes(staff.id) && participants.includes(target.id) && !participants.includes('core-os'));
  });

  const staffMeta = { id: staff.id, name: nameOf(staff), avatar: staff?.profile?.avatar_url || '' };
  const targetMeta = { id: target.id, name: nameOf(target), avatar: target?.profile?.avatar_url || '' };

  if (!conversation) {
    conversation = await svc.entities.Conversation.create({
      participants: [staff.id, target.id],
      participant_meta: [staffMeta, targetMeta],
      pair_key: pairKey,
      last_message: '',
      last_sender_id: staff.id,
    });
  }

  const days = Number(codeRow.duration_days || PLAN_DAYS[request.plan] || 30);
  const planLabel = request.plan === 'nitro_anual' ? 'Nitro Anual' : request.plan === 'nitro_mensal' ? 'Nitro Mensal' : `Nitro de ${days} dias`;
  const content = [
    '💎 Código oficial do Nébula Nitro',
    '',
    `Sua compra de ${planLabel} foi aprovada pela Staff.`,
    `Código: ${codeRow.code}`,
    '',
    'Abra a página Nébula Nitro, vá em “Resgatar código” e use este código para ativar ou renovar seu Nitro.',
    'Este código é de uso único. Não compartilhe com outras pessoas.',
  ].join('\n');

  const message = await svc.entities.DirectMessage.create({
    conversation_id: conversation.id,
    sender_id: staff.id,
    sender_name: nameOf(staff),
    sender_avatar: staff?.profile?.avatar_url || '',
    content,
    sticker_url: '',
    attachments: [],
    participants: [staff.id, target.id],
    mentions: [{ id: target.id, name: nameOf(target) }],
    client_request_id: clientRequestId,
    edited: false,
    deleted: false,
  });

  await svc.entities.Conversation.update(conversation.id, {
    participants: [staff.id, target.id],
    participant_meta: [staffMeta, targetMeta],
    pair_key: pairKey,
    last_message: 'Código Nitro enviado',
    last_sender_id: staff.id,
  }).catch(() => null);

  return { sent: true, message };
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || !STAFF_ROLES.has(String(user.role || ''))) {
      return Response.json({ error: 'Sem permissão' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action || 'decision', 40);
    await guardRequest(req, base44, {
      route: 'nitroAdmin', user, body, strict: true, limit: action === 'list_requests' ? 60 : 30, windowMs: 60_000, maxBodyBytes: 6000,
    });

    const svc = base44.asServiceRole;

    if (action === 'list_active') {
      // Endpoint pequeno e rápido para o card de assinaturas ativas. Não
      // depende da listagem administrativa inteira nem das filas de compra.
      let approvedRows: any[] = [];
      try {
        approvedRows = await svc.entities.NitroRequest.filter({ status: 'approved' }, '-created_date', 300);
      } catch {
        return Response.json({ error: 'Não foi possível carregar assinaturas ativas agora.', retryable: true }, {
          status: 503,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': '1' },
        });
      }

      const now = Date.now();
      const activeByUser = new Map<string, any>();
      for (const row of approvedRows || []) {
        if (!row?.user_id) continue;
        const until = nitroExpiresAt(row);
        if (until <= now) continue;
        const current = activeByUser.get(row.user_id);
        if (!current || until > current.valid_until_ms) {
          activeByUser.set(row.user_id, {
            user_id: row.user_id,
            user_name: row.user_name || 'Usuário',
            valid_until: new Date(until).toISOString(),
            valid_until_ms: until,
            source: row.source || 'purchase',
            request_id: row.id,
          });
        }
      }

      const activeUsers = Array.from(activeByUser.values())
        .sort((a: any, b: any) => b.valid_until_ms - a.valid_until_ms)
        .map(({ valid_until_ms, ...row }: any) => row);

      return Response.json({ active_users: activeUsers, snapshot_complete: true }, {
        headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' },
      });
    }

    if (action === 'list_requests') {
      const statusFilter = clean(body?.status_filter || 'all', 30);
      const sourceFilter = clean(body?.source_filter || 'all', 30);
      const q = clean(body?.q, 120).toLocaleLowerCase('pt-BR');
      const limit = Math.max(1, Math.min(300, Number(body?.limit) || 200));

      // A listagem geral pode apresentar consistência eventual logo após o
      // upload. Faz merge com consultas diretas das filas que precisam ficar
      // estáveis até decisão explícita da equipe.
      const [listedResult, pendingResult, issuedResult, approvedResult] = await Promise.allSettled([
        svc.entities.NitroRequest.list('-created_date', 300),
        svc.entities.NitroRequest.filter({ status: 'pending' }, '-created_date', 300),
        svc.entities.NitroRequest.filter({ status: 'code_issued' }, '-created_date', 300),
        svc.entities.NitroRequest.filter({ status: 'approved' }, '-created_date', 300),
      ]);
      const listed = listedResult.status === 'fulfilled' ? listedResult.value : [];
      const pendingRows = pendingResult.status === 'fulfilled' ? pendingResult.value : [];
      const issuedRows = issuedResult.status === 'fulfilled' ? issuedResult.value : [];
      const approvedRows = approvedResult.status === 'fulfilled' ? approvedResult.value : [];
      const merged = new Map<string, any>();
      for (const row of [...(listed || []), ...(pendingRows || []), ...(issuedRows || []), ...(approvedRows || [])]) {
        if (row?.id) merged.set(row.id, row);
      }
      const rows = Array.from(merged.values()).sort((a: any, b: any) =>
        (new Date(b.created_date || 0).getTime() || 0) - (new Date(a.created_date || 0).getTime() || 0)
      );
      const sourceRows = rows.filter((row: any) => row.source !== 'nitro_code');

      const activeByUser = new Map<string, any>();
      const now = Date.now();
      for (const row of rows) {
        if (row?.status !== 'approved' || !row?.user_id) continue;
        const until = nitroExpiresAt(row);
        if (until <= now) continue;
        const current = activeByUser.get(row.user_id);
        if (!current || until > current.valid_until_ms) {
          activeByUser.set(row.user_id, {
            user_id: row.user_id,
            user_name: row.user_name || 'Usuário',
            valid_until: new Date(until).toISOString(),
            valid_until_ms: until,
            source: row.source || 'purchase',
            request_id: row.id,
          });
        }
      }
      const activeUsers = Array.from(activeByUser.values())
        .sort((a: any, b: any) => b.valid_until_ms - a.valid_until_ms)
        .map(({ valid_until_ms, ...row }: any) => row);

      const counts = sourceRows.reduce((acc: any, row: any) => {
        const key = String(row.status || 'pending');
        acc.total += 1;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, { total: 0, pending: 0, code_issued: 0, approved: 0, rejected: 0, expired: 0 });
      const filtered = sourceRows.filter((row: any) => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false;
        if (sourceFilter !== 'all' && row.source !== sourceFilter) return false;
        if (q) {
          const hay = `${row.code || ''} ${row.user_name || ''} ${row.user_id || ''}`.toLocaleLowerCase('pt-BR');
          if (!hay.includes(q)) return false;
        }
        return true;
      }).slice(0, limit);
      return Response.json({
        requests: filtered.map(adminView),
        counts,
        active_users: activeUsers,
        active_users_complete: listedResult.status === 'fulfilled' && approvedResult.status === 'fulfilled',
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'remove_nitro') {
      const targetUserId = clean(body?.user_id, 120);
      const reason = clean(body?.reason || 'Removido manualmente pela equipe.', 500);
      if (!targetUserId) return Response.json({ error: 'Usuário inválido' }, { status: 400 });

      const target = await svc.entities.User.get(targetUserId).catch(() => null);
      if (!target) return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });

      const [filteredRows, listedRows] = await Promise.all([
        svc.entities.NitroRequest.filter({ user_id: targetUserId }, '-created_date', 200).catch(() => []),
        svc.entities.NitroRequest.list('-created_date', 300).catch(() => []),
      ]);
      const targetRows = Array.from(new Map([
        ...(filteredRows || []),
        ...(listedRows || []).filter((row: any) => row?.user_id === targetUserId),
      ].map((row: any) => [row.id, row])).values());

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const activeRows = targetRows.filter((row: any) =>
        row?.status === 'approved' && nitroExpiresAt(row) > nowMs
      );
      if (!activeRows.length) {
        return Response.json({ error: 'Este usuário não possui Nébula Nitro ativo.' }, { status: 409 });
      }

      const removedRequestIds: string[] = [];
      for (const row of activeRows) {
        const updated = await svc.entities.NitroRequest.update(row.id, {
          status: 'expired',
          expires_at: nowIso,
          expired_at: nowIso,
          rejection_reason: reason,
          reviewed_by_id: user.id,
          reviewed_by_name: nameOf(user),
          reviewed_at: nowIso,
        });
        if (!updated?.id || updated.status !== 'expired') {
          throw new Error(`Falha ao expirar assinatura Nitro ${row.id}`);
        }
        removedRequestIds.push(updated.id);

        // Um código já usado poderia reconstruir a assinatura pelo fluxo
        // idempotente de resgate. Ao remover manualmente o Nitro, o código
        // vinculado também é encerrado para impedir reativação automática.
        if (row?.nitro_code_id) {
          const linkedCode = await svc.entities.NitroCode.get(row.nitro_code_id).catch(() => null);
          if (linkedCode && linkedCode.status !== 'revoked') {
            await svc.entities.NitroCode.update(linkedCode.id, {
              status: 'revoked',
              claim_token: '',
            }).catch(() => null);
          }
        }
      }

      // Impede reativação imediata por uma compra/código de compra ainda aberto.
      for (const row of targetRows) {
        if (row?.source !== 'purchase' || !['pending', 'code_issued'].includes(String(row?.status || ''))) continue;
        if (row?.nitro_code_id) {
          const code = await svc.entities.NitroCode.get(row.nitro_code_id).catch(() => null);
          if (code?.status === 'available') {
            await svc.entities.NitroCode.update(code.id, { status: 'revoked' }).catch(() => null);
          }
        }
        await expireOpenReceiptSessions(svc, row.id, 'Nitro removido manualmente pela equipe.');
        await svc.entities.NitroRequest.update(row.id, {
          status: 'expired',
          expired_at: nowIso,
          rejection_reason: 'Solicitação encerrada porque o Nitro do usuário foi removido pela equipe.',
          reviewed_by_id: user.id,
          reviewed_by_name: nameOf(user),
          reviewed_at: nowIso,
        }).catch(() => null);
      }

      await resetNitroAppearance(svc, target).catch(async (error: any) => {
        await adminLog(
          svc,
          user,
          'nitro_manual_remove_reset_warning',
          targetUserId,
          `Nitro removido, mas o reset visual precisará ser reconciliado: ${clean(error?.message || error, 300)}`
        );
      });
      await adminLog(
        svc,
        user,
        'nitro_manual_remove',
        targetUserId,
        `Nébula Nitro removido de ${nameOf(target)}. Motivo: ${reason}`
      );

      await svc.entities.UserNotification.create({
        recipient_user_id: targetUserId,
        actor_user_id: user.id,
        actor_name: nameOf(user),
        actor_avatar: user?.profile?.avatar_url || '',
        type: 'system',
        title: 'Nébula Nitro removido',
        body: reason,
        context_url: '/nitro',
        context_type: 'nitro',
        context_id: targetUserId,
        read: false,
        dedupe_key: `nitro-removed:${targetUserId}:${nowMs}`,
      }).catch(() => null);

      return Response.json({
        ok: true,
        user_id: targetUserId,
        removed_requests: removedRequestIds,
        removed_at: nowIso,
      });
    }

    if (action === 'update_request') {
      if (!isOwner(user)) return Response.json({ error: 'Somente Owner pode editar solicitações Nitro' }, { status: 403 });
      const id = clean(body?.request_id, 120);
      if (!id) return Response.json({ error: 'Solicitação inválida' }, { status: 400 });
      const request = await svc.entities.NitroRequest.get(id).catch(() => null);
      if (!request) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });

      const patch: any = {};
      if (Object.prototype.hasOwnProperty.call(body, 'plan')) {
        const plan = clean(body.plan, 40);
        if (!['nitro_mensal', 'nitro_anual', 'nitro_90'].includes(plan)) return Response.json({ error: 'Plano inválido' }, { status: 400 });
        if (request.status === 'approved') return Response.json({ error: 'O plano de uma assinatura já ativada não pode ser alterado' }, { status: 409 });
        if (request.status === 'code_issued' && plan !== request.plan) return Response.json({ error: 'Revogue/reabra a solicitação antes de trocar o plano de um código já emitido' }, { status: 409 });
        patch.plan = plan;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'user_name')) {
        if (request.status === 'approved') return Response.json({ error: 'O usuário exibido de uma assinatura já ativada não pode ser alterado' }, { status: 409 });
        patch.user_name = clean(body.user_name, 120);
      }
      if (Object.prototype.hasOwnProperty.call(body, 'rejection_reason')) {
        if (request.status === 'approved') return Response.json({ error: 'Uma assinatura ativa não possui motivo de rejeição editável' }, { status: 409 });
        patch.rejection_reason = clean(body.rejection_reason, 500);
      }
      if (Object.prototype.hasOwnProperty.call(body, 'admin_note')) patch.admin_note = clean(body.admin_note, 1000);
      if (!Object.keys(patch).length) return Response.json({ error: 'Nenhuma alteração válida enviada' }, { status: 400 });

      patch.edited_by_id = user.id;
      patch.edited_by_name = nameOf(user);
      patch.edited_at = new Date().toISOString();
      const updated = await svc.entities.NitroRequest.update(request.id, patch);
      await adminLog(svc, user, 'nitro_request_edit', request.id, `Solicitação Nitro editada: ${Object.keys(patch).filter((key) => !key.startsWith('edited_')).join(', ')}.`);
      return Response.json({ request: adminView(updated) });
    }

    if (action === 'reopen_request') {
      if (!isOwner(user)) return Response.json({ error: 'Somente Owner pode reabrir solicitações Nitro' }, { status: 403 });
      const id = clean(body?.request_id, 120);
      const request = id ? await svc.entities.NitroRequest.get(id).catch(() => null) : null;
      if (!request) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      if (!['rejected', 'expired'].includes(request.status)) return Response.json({ error: 'Apenas solicitações rejeitadas ou expiradas podem ser reabertas' }, { status: 409 });
      if (request.nitro_code_id) {
        const code = await svc.entities.NitroCode.get(request.nitro_code_id).catch(() => null);
        if (code?.status === 'used') return Response.json({ error: 'Não é possível reabrir uma solicitação cujo código já foi utilizado' }, { status: 409 });
        if (code?.status === 'available') await svc.entities.NitroCode.update(code.id, { status: 'revoked' }).catch(() => null);
      }
      const updated = await svc.entities.NitroRequest.update(request.id, {
        status: 'pending',
        nitro_code_id: '',
        code_issued_at: '',
        code_delivered_at: '',
        approved_at: '',
        expires_at: '',
        expired_at: '',
        rejection_reason: '',
        receipt_status: request.receipt_file_uri || hasLegacyReceipt(request.receipt_url) ? 'received' : 'none',
        reviewed_by_id: '',
        reviewed_by_name: '',
        reviewed_at: '',
        edited_by_id: user.id,
        edited_by_name: nameOf(user),
        edited_at: new Date().toISOString(),
      });
      await adminLog(svc, user, 'nitro_request_reopen', request.id, 'Solicitação Nitro reaberta para análise.');
      return Response.json({ request: adminView(updated) });
    }

    if (action === 'delete_request') {
      if (!isOwner(user)) return Response.json({ error: 'Somente Owner pode excluir solicitações Nitro' }, { status: 403 });
      const id = clean(body?.request_id, 120);
      const request = id ? await svc.entities.NitroRequest.get(id).catch(() => null) : null;
      if (!request) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      if (!['rejected', 'expired'].includes(request.status)) return Response.json({ error: 'Só é possível excluir solicitações rejeitadas ou expiradas' }, { status: 409 });
      if (request.nitro_code_id) {
        const code = await svc.entities.NitroCode.get(request.nitro_code_id).catch(() => null);
        if (code?.status === 'used') return Response.json({ error: 'Esta solicitação possui um código já utilizado e não pode ser excluída' }, { status: 409 });
      }
      await expireOpenReceiptSessions(svc, request.id, 'Solicitação removida pelo Owner.');
      await adminLog(svc, user, 'nitro_request_delete', request.id, `Solicitação ${request.code || request.id} excluída.`);
      await svc.entities.NitroRequest.delete(request.id);
      return Response.json({ ok: true, request_id: request.id });
    }

    if (action !== 'decision') return Response.json({ error: 'Ação inválida' }, { status: 400 });

    const id = clean(body?.request_id, 120);
    const status = clean(body?.status, 30);
    const rejectionReason = clean(body?.rejection_reason, 500);
    if (!id || !['approved', 'rejected'].includes(status)) {
      return Response.json({ error: 'Solicitação inválida' }, { status: 400 });
    }
    const request = await svc.entities.NitroRequest.get(id).catch(() => null);
    if (!request) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });

    if (status === 'approved') {
      const hasReceipt = Boolean(request.receipt_file_uri) || hasLegacyReceipt(request.receipt_url);
      if (!hasReceipt) {
        return Response.json({ error: 'Aguarde o envio do comprovante antes de aprovar esta solicitação.' }, { status: 409 });
      }
      if (request.status === 'approved') {
        return Response.json({ request, already_activated: true });
      }
      if (request.status === 'rejected' || request.status === 'expired') {
        return Response.json({ error: 'Esta solicitação não pode mais ser aprovada' }, { status: 409 });
      }

      const target = await svc.entities.User.get(request.user_id).catch(() => null);
      if (!target) return Response.json({ error: 'Usuário da solicitação não encontrado' }, { status: 404 });

      const alreadyActiveUntil = await activeNitroUntil(svc, request.user_id, request.id);
      if (alreadyActiveUntil > Date.now()) {
        await svc.entities.NitroRequest.update(request.id, {
          status: 'expired',
          expired_at: new Date().toISOString(),
          rejection_reason: 'Solicitação encerrada porque o usuário já possui Nébula Nitro ativo.',
          reviewed_by_id: user.id,
          reviewed_by_name: nameOf(user),
          reviewed_at: new Date().toISOString(),
        }).catch(() => null);
        return Response.json({
          error: 'Este usuário já possui Nébula Nitro ativo. Uma nova compra só pode ser aprovada após a assinatura expirar.',
          code: 'nitro_already_active',
          valid_until: new Date(alreadyActiveUntil).toISOString(),
        }, { status: 409 });
      }

      const codeRow = await ensurePurchaseCode(svc, user, request);
      const now = new Date();
      const issuedAt = request.code_issued_at || now.toISOString();
      const durationDays = Math.max(1, Number(codeRow.duration_days || PLAN_DAYS[request.plan] || 30));
      const expiresAt = new Date(now.getTime() + durationDays * DAY_MS);

      // Aprovação é a ativação: o comprador não precisa resgatar o código
      // manualmente. O código continua visível no histórico/aba Nitro como
      // comprovante da compra, mas já fica consumido pela própria assinatura.
      const activatedCode = await svc.entities.NitroCode.update(codeRow.id, {
        status: 'used',
        used_by: request.user_id,
        used_by_name: request.user_name || nameOf(target),
        used_at: now.toISOString(),
        activation_request_id: request.id,
        claim_token: '',
      });

      let updated = await svc.entities.NitroRequest.update(request.id, {
        status: 'approved',
        approved_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        expired_at: '',
        source: 'purchase',
        nitro_code_id: activatedCode.id,
        code_issued_at: issuedAt,
        reviewed_by_id: user.id,
        reviewed_by_name: nameOf(user),
        reviewed_at: now.toISOString(),
        rejection_reason: '',
      });
      await expireOpenReceiptSessions(svc, request.id, 'Solicitação aprovada e Nitro ativado pela equipe.');
      await receiptAudit(svc, request, user, 'approved', 'Comprovante aprovado, código Nitro emitido e assinatura ativada automaticamente.');

      let dmSent = false;
      try {
        const dm = await ensureCodeDm(svc, user, target, updated, activatedCode);
        dmSent = !!dm?.sent;
        if (dmSent) {
          const sentAt = activatedCode.dm_sent_at || new Date().toISOString();
          await svc.entities.NitroCode.update(activatedCode.id, { dm_sent_at: sentAt }).catch(() => null);
          updated = await svc.entities.NitroRequest.update(request.id, { code_delivered_at: sentAt }).catch(() => updated);
        }
      } catch {
        dmSent = false;
      }

      await svc.entities.UserNotification.create({
        recipient_user_id: request.user_id,
        actor_user_id: user.id,
        actor_name: nameOf(user),
        actor_avatar: user?.profile?.avatar_url || '',
        type: 'system',
        title: 'Nébula Nitro ativado',
        body: `Sua compra foi aprovada. O Nitro já está ativo até ${expiresAt.toLocaleDateString('pt-BR')} e seu código é ${activatedCode.code}.`,
        context_url: '/nitro',
        context_type: 'nitro',
        context_id: request.id,
        read: false,
        dedupe_key: `nitro-approved:${request.id}`,
      }).catch(() => null);

      return Response.json({
        request: updated,
        code_issued: true,
        activated: true,
        code: activatedCode.code,
        valid_until: expiresAt.toISOString(),
        dm_sent: dmSent,
      }, { headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' } });
    }

    if (request.status === 'approved') {
      return Response.json({ error: 'Nitro já ativado; não é possível rejeitar esta solicitação' }, { status: 409 });
    }

    if (request.nitro_code_id) {
      const code = await svc.entities.NitroCode.get(request.nitro_code_id).catch(() => null);
      if (code?.status === 'available') {
        await svc.entities.NitroCode.update(code.id, { status: 'revoked' }).catch(() => null);
      }
    }

    const updated = await svc.entities.NitroRequest.update(request.id, {
      status: 'rejected',
      approved_at: '',
      expires_at: '',
      expired_at: '',
      receipt_status: request.receipt_file_uri || request.receipt_url ? 'rejected' : (request.receipt_status || 'none'),
      rejection_reason: rejectionReason || 'Comprovante rejeitado pela equipe.',
      reviewed_by_id: user.id,
      reviewed_by_name: nameOf(user),
      reviewed_at: new Date().toISOString(),
    });
    await expireOpenReceiptSessions(svc, request.id, 'Solicitação rejeitada pela equipe.');
    await receiptAudit(svc, request, user, 'rejected', rejectionReason || 'Comprovante rejeitado pela equipe.');
    return Response.json({ request: updated });
  } catch (error) {
    const guarded = securityResponse(error);
    if (guarded) return guarded;
    return Response.json({ error: 'Falha ao atualizar o Nitro' }, { status: 500 });
  }
}
