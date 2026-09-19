import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const PIX_KEY = '05649041040';
const PAYEE_NAME = 'NEBULA OS';
const PAYEE_CITY = 'BRASIL';

const PLAN_AMOUNTS: Record<string, string> = {
  nitro_mensal: '6.99',
  nitro_anual: '25.50',
};

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

function buildPixPayload(amount: string) {
  const merchantAccount = emv('00', 'br.gov.bcb.pix') + emv('01', PIX_KEY);
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
  return `${base}${crc16(base)}`;
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, { route: 'getNitroPix', user, body, strict: true, limit: 8, windowMs: 60_000, maxBodyBytes: 2000 });
    const plan = typeof body?.plan === 'string' ? body.plan : '';
    const amount = PLAN_AMOUNTS[plan];
    if (!amount) return Response.json({ error: 'Plano inválido' }, { status: 400 });

    return Response.json({
      payload: buildPixPayload(amount),
      amount,
      payee: PAYEE_NAME,
    });
  } catch (error) {
    const blocked = securityResponse(error); if (blocked) return blocked;
    return Response.json({ error: error instanceof Error ? error.message : 'Falha ao gerar Pix' }, { status: 500 });
  }
}
