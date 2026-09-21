import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const PAYEE_NAME = 'NEBULA OS';
const PAYEE_CITY = 'BRASIL';

const PLAN_AMOUNTS: Record<string, string> = {
  nitro_mensal: '6.99',
  nitro_anual: '25.50',
};

const PLAN_DAYS: Record<string, number> = {
  nitro_mensal: 30,
  nitro_anual: 365,
  nitro_90: 90,
};
const DAY_MS = 86_400_000;

function emv(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function normalizePixKey(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 77 || /[\u0000-\u001f\u007f]/.test(raw)) return '';
  return raw;
}

async function readPixKey(base44: any) {
  const svc = base44.asServiceRole;

  // Tenta a configuração persistida por mais de um caminho. Isso evita falsos
  // "Pix indisponível" quando um índice/filtro ainda não propagou na região.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const filtered = await svc.entities.SecurePaymentConfig
      .filter({ key: 'NITRO_PIX_KEY' }, '-updated_date', 3)
      .catch(() => []);
    const fromFilter = normalizePixKey((filtered || []).find((row: any) => row?.key === 'NITRO_PIX_KEY')?.value);
    if (fromFilter) return fromFilter;

    const listed = await svc.entities.SecurePaymentConfig
      .list('-updated_date', 25)
      .catch(() => []);
    const fromList = normalizePixKey((listed || []).find((row: any) => row?.key === 'NITRO_PIX_KEY')?.value);
    if (fromList) return fromList;

    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return '';
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

async function activeNitroUntil(base44: any, userId: string) {
  const svc = base44.asServiceRole;
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
    if (row?.status !== 'approved') continue;
    const expires = nitroExpiresAt(row);
    if (expires > now) until = Math.max(until, expires);
  }
  return until;
}

function buildPixPayload(amount: string, pixKey: string) {
  const merchantAccount = emv('00', 'br.gov.bcb.pix') + emv('01', pixKey);
  const additionalData = emv('05', '***');
  const base = [
    emv('00', '01'),
    emv('26', merchantAccount),
    emv('52', '0000'),
    emv('53', '986'),
    emv('54', amount),
    emv('58', 'BR'),
    emv('59', PAYEE_NAME),
    emv('60', PAYEE_CITY),
    emv('62', additionalData),
    '6304',
  ].join('');
  const payload = `${base}${crc16(base)}`;
  if (!payload.startsWith('000201') || !payload.includes('0014br.gov.bcb.pix') || !/6304[0-9A-F]{4}$/.test(payload)) {
    throw new Error('payload_pix_invalido');
  }
  return payload;
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, { route: 'getNitroPix', user, body, strict: true, limit: 30, windowMs: 60_000, maxBodyBytes: 2000 });
    const plan = typeof body?.plan === 'string' ? body.plan : '';
    const amount = PLAN_AMOUNTS[plan];
    if (!amount) return Response.json({ error: 'Plano inválido' }, { status: 400 });

    const activeUntil = await activeNitroUntil(base44, user.id);
    if (activeUntil > Date.now()) {
      return Response.json({
        error: 'Seu Nébula Nitro já está ativo. Você poderá fazer uma nova compra após a assinatura expirar.',
        code: 'nitro_already_active',
        valid_until: new Date(activeUntil).toISOString(),
      }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }

    const pixKey = await readPixKey(base44);
    if (!pixKey) {
      return Response.json({ error: 'Não foi possível carregar o Pix agora. Tente novamente em instantes.', code: 'pix_config_unavailable', retryable: true }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '2' } });
    }

    const payload = buildPixPayload(amount, pixKey);
    return Response.json({
      payload,
      amount,
      payee: PAYEE_NAME,
    }, {
      headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' },
    });
  } catch (error) {
    const blocked = securityResponse(error); if (blocked) return blocked;
    const code = error instanceof Error ? error.message : 'pix_generation_failed';
    return Response.json({ error: 'Falha ao gerar Pix', code }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
