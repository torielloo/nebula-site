import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 12_000;
const MAX_PIXELS = 40_000_000;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

function clean(value: unknown, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function tokenLooksValid(value: string) {
  // Novo formato: 64 chars hex (32 bytes). Mantém compatibilidade temporária
  // com os tokens base64url antigos já emitidos.
  return /^[a-fA-F0-9]{64}$/.test(value) || /^[A-Za-z0-9_-]{40,60}$/.test(value);
}

function normalizeToken(value: string) {
  const raw = String(value || '').trim();
  return /^[a-fA-F0-9]{64}$/.test(raw) ? raw.toLowerCase() : raw;
}

function u32be(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function u32le(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function setU32le(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function concat(parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function assertDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('dimensoes_invalidas');
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
    throw new Error('imagem_grande_demais');
  }
}

function sanitizePng(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !signature.every((value, i) => bytes[i] === value)) {
    throw new Error('png_invalido');
  }

  const parts: Uint8Array[] = [bytes.slice(0, 8)];
  const allowed = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
  let pos = 8;
  let sawIhdr = false;
  let sawIdat = false;
  let sawIend = false;

  while (pos + 12 <= bytes.length) {
    const length = u32be(bytes, pos);
    if (length > MAX_BYTES || pos + 12 + length > bytes.length) throw new Error('png_truncado');
    const type = ascii(bytes, pos + 4, 4);
    const end = pos + 12 + length;

    if (!sawIhdr && type !== 'IHDR') throw new Error('png_ihdr_ausente');
    if (type === 'IHDR') {
      if (sawIhdr || length !== 13) throw new Error('png_ihdr_invalido');
      sawIhdr = true;
      assertDimensions(u32be(bytes, pos + 8), u32be(bytes, pos + 12));
    }

    if (['acTL', 'fcTL', 'fdAT'].includes(type)) throw new Error('png_animado_nao_permitido');
    if (type === 'IDAT') sawIdat = true;

    if (allowed.has(type)) {
      parts.push(bytes.slice(pos, end));
    } else {
      // Chunk crítico desconhecido: rejeita em vez de tentar interpretar.
      const first = type.charCodeAt(0);
      const ancillary = (first & 0x20) !== 0;
      if (!ancillary) throw new Error('png_chunk_critico_desconhecido');
    }

    pos = end;
    if (type === 'IEND') {
      if (length !== 0) throw new Error('png_iend_invalido');
      sawIend = true;
      break;
    }
  }

  if (!sawIhdr || !sawIdat || !sawIend) throw new Error('png_incompleto');
  return concat(parts);
}

function isSofMarker(marker: number) {
  return [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
}

function sanitizeJpeg(bytes: Uint8Array) {
  if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('jpeg_invalido');

  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  let pos = 2;
  let inEntropy = false;
  let width = 0;
  let height = 0;
  let sawSos = false;
  let sawEoi = false;

  while (pos < bytes.length) {
    if (inEntropy) {
      const start = pos;
      let markerAt = -1;
      while (pos + 1 < bytes.length) {
        if (bytes[pos] !== 0xff) {
          pos += 1;
          continue;
        }
        const next = bytes[pos + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          pos += 2;
          continue;
        }
        markerAt = pos;
        break;
      }
      if (markerAt < 0) throw new Error('jpeg_sem_eoi');
      if (markerAt > start) parts.push(bytes.slice(start, markerAt));
      inEntropy = false;
      continue;
    }

    if (pos + 1 >= bytes.length || bytes[pos] !== 0xff) throw new Error('jpeg_marcador_invalido');
    while (pos < bytes.length && bytes[pos] === 0xff) pos += 1;
    if (pos >= bytes.length) throw new Error('jpeg_truncado');
    const marker = bytes[pos];
    pos += 1;

    if (marker === 0xd9) {
      parts.push(new Uint8Array([0xff, 0xd9]));
      sawEoi = true;
      break;
    }
    if (marker === 0xd8) throw new Error('jpeg_soi_duplicado');
    if (marker === 0x00) throw new Error('jpeg_escape_fora_scan');

    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(new Uint8Array([0xff, marker]));
      continue;
    }

    if (pos + 1 >= bytes.length) throw new Error('jpeg_segmento_truncado');
    const segmentLength = (bytes[pos] << 8) | bytes[pos + 1];
    if (segmentLength < 2) throw new Error('jpeg_segmento_invalido');
    const segmentEnd = pos + segmentLength;
    if (segmentEnd > bytes.length) throw new Error('jpeg_segmento_truncado');

    const isMetadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (isSofMarker(marker)) {
      if (segmentLength < 7) throw new Error('jpeg_sof_invalido');
      height = (bytes[pos + 3] << 8) | bytes[pos + 4];
      width = (bytes[pos + 5] << 8) | bytes[pos + 6];
      assertDimensions(width, height);
    }

    if (!isMetadata) {
      parts.push(new Uint8Array([0xff, marker]));
      parts.push(bytes.slice(pos, segmentEnd));
    }

    pos = segmentEnd;
    if (marker === 0xda) {
      sawSos = true;
      inEntropy = true;
    }
  }

  if (!sawSos || !sawEoi || !width || !height) throw new Error('jpeg_incompleto');
  return concat(parts);
}

function makeWebpChunk(type: string, payload: Uint8Array) {
  const padded = payload.length + (payload.length % 2);
  const out = new Uint8Array(8 + padded);
  for (let i = 0; i < 4; i += 1) out[i] = type.charCodeAt(i);
  setU32le(out, 4, payload.length);
  out.set(payload, 8);
  return out;
}

function sanitizeWebp(bytes: Uint8Array) {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    throw new Error('webp_invalido');
  }

  const declaredSize = u32le(bytes, 4);
  const declaredEnd = 8 + declaredSize;
  if (declaredEnd > bytes.length || declaredEnd < 20) throw new Error('webp_truncado');

  let pos = 12;
  let width = 0;
  let height = 0;
  let imageChunks = 0;
  const kept: Uint8Array[] = [];

  while (pos + 8 <= declaredEnd) {
    const type = ascii(bytes, pos, 4);
    const length = u32le(bytes, pos + 4);
    const payloadStart = pos + 8;
    const payloadEnd = payloadStart + length;
    const next = payloadEnd + (length % 2);
    if (payloadEnd > declaredEnd || next > declaredEnd) throw new Error('webp_chunk_truncado');

    if (type === 'ANIM' || type === 'ANMF') throw new Error('webp_animado_nao_permitido');

    let payload = bytes.slice(payloadStart, payloadEnd);
    if (type === 'VP8X') {
      if (payload.length !== 10) throw new Error('webp_vp8x_invalido');
      if ((payload[0] & 0x02) !== 0) throw new Error('webp_animado_nao_permitido');
      payload = payload.slice();
      // Mantém somente a flag de alpha; remove ICC/EXIF/XMP/animation.
      payload[0] &= 0x10;
      width = 1 + payload[4] + (payload[5] << 8) + (payload[6] << 16);
      height = 1 + payload[7] + (payload[8] << 8) + (payload[9] << 16);
      assertDimensions(width, height);
      kept.push(makeWebpChunk(type, payload));
    } else if (type === 'VP8 ') {
      if (payload.length < 10 || payload[3] !== 0x9d || payload[4] !== 0x01 || payload[5] !== 0x2a) {
        throw new Error('webp_vp8_invalido');
      }
      width = (payload[6] | (payload[7] << 8)) & 0x3fff;
      height = (payload[8] | (payload[9] << 8)) & 0x3fff;
      assertDimensions(width, height);
      imageChunks += 1;
      kept.push(makeWebpChunk(type, payload));
    } else if (type === 'VP8L') {
      if (payload.length < 5 || payload[0] !== 0x2f) throw new Error('webp_vp8l_invalido');
      width = 1 + (payload[1] | ((payload[2] & 0x3f) << 8));
      height = 1 + ((payload[2] >> 6) | (payload[3] << 2) | ((payload[4] & 0x0f) << 10));
      assertDimensions(width, height);
      imageChunks += 1;
      kept.push(makeWebpChunk(type, payload));
    } else if (type === 'ALPH') {
      kept.push(makeWebpChunk(type, payload));
    }
    // Demais chunks (EXIF/XMP/ICCP/custom) são removidos.
    pos = next;
  }

  if (!width || !height || imageChunks !== 1) throw new Error('webp_incompleto');

  const payloadSize = 4 + kept.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(8 + payloadSize);
  out.set(new TextEncoder().encode('RIFF'), 0);
  setU32le(out, 4, payloadSize);
  out.set(new TextEncoder().encode('WEBP'), 8);
  let offset = 12;
  for (const chunk of kept) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function sanitizeImage(bytes: Uint8Array, mime: string) {
  if (mime === 'image/png') return sanitizePng(bytes);
  if (mime === 'image/jpeg') return sanitizeJpeg(bytes);
  if (mime === 'image/webp') return sanitizeWebp(bytes);
  throw new Error('tipo_nao_permitido');
}

function detectMime(bytes: Uint8Array) {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  return '';
}

function safeFilenameInfo(file: File) {
  const name = clean(file.name, 180);
  if (!name || /[\\/\0]/.test(name)) throw new Error('nome_de_arquivo_invalido');
  const lower = name.toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop() || '' : '';
  if (!EXT_TO_MIME[ext]) throw new Error('extensao_nao_permitida');
  const segments = lower.split('.');
  if (segments.length > 2) {
    const dangerous = new Set(['exe', 'dll', 'js', 'mjs', 'cjs', 'html', 'htm', 'svg', 'pdf', 'zip', 'rar', '7z', 'apk', 'bat', 'cmd', 'ps1', 'sh']);
    if (segments.slice(1, -1).some((segment) => dangerous.has(segment))) throw new Error('extensao_dupla_bloqueada');
  }
  return { ext, expectedMime: EXT_TO_MIME[ext] };
}

async function audit(svc: any, payload: any) {
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

async function getSession(svc: any, token: string, sessionId = '') {
  const hash = await sha256(normalizeToken(token));

  // QR novo carrega o ID da sessão junto com o token. Faz algumas tentativas
  // curtas porque a criação da entidade pode levar alguns milissegundos para
  // ficar disponível em outra requisição/região logo após o QR ser escaneado.
  if (sessionId) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = await svc.entities.NitroReceiptUploadSession.get(sessionId).catch(() => null);
      if (row) return row.token_hash === hash ? row : null;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  // Compatibilidade com QR Codes antigos que tinham apenas o token e fallback
  // para ambientes em que o lookup direto acabou de ser criado.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rows = await svc.entities.NitroReceiptUploadSession.filter({ token_hash: hash }, '-created_date', 2).catch(() => []);
    if (rows?.[0]) return rows[0];
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return null;
}

async function getRequestForSession(svc: any, session: any) {
  if (!session?.request_id || !session?.user_id) return null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const direct = await svc.entities.NitroRequest.get(session.request_id).catch(() => null);
    if (direct && direct.user_id === session.user_id) return direct;

    const rows = await svc.entities.NitroRequest
      .filter({ id: session.request_id, user_id: session.user_id }, '-created_date', 2)
      .catch(() => []);
    if (rows?.[0]) return rows[0];

    const listed = await svc.entities.NitroRequest.list('-created_date', 300).catch(() => []);
    const fromList = (listed || []).find((row: any) =>
      row?.id === session.request_id && row?.user_id === session.user_id
    );
    if (fromList) return fromList;

    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 140));
  }
  return null;
}

function sessionExpired(session: any) {
  const expires = new Date(session?.expires_at || 0).getTime();
  return !Number.isFinite(expires) || expires <= Date.now();
}

async function rejectUploadAttempt(svc: any, session: any, request: any, reason: string, ipHash = '', attempts = 1) {
  const terminal = attempts >= 3;
  const now = new Date().toISOString();
  await svc.entities.NitroReceiptUploadSession.update(session.id, {
    status: terminal ? 'failed' : 'waiting',
    lock_token: '',
    consumed_at: terminal ? now : '',
    upload_finished_at: terminal ? now : '',
    last_error: clean(reason, 220),
    attempt_count: Math.min(20, attempts),
  }).catch(() => null);
  if (request?.id && !request.receipt_file_uri) {
    await svc.entities.NitroRequest.update(request.id, {
      receipt_status: 'awaiting_mobile',
    }).catch(() => null);
  }
  await audit(svc, {
    request_id: session.request_id,
    user_id: session.user_id,
    actor_name: 'Upload remoto',
    actor_role: 'public_token',
    action: 'upload_rejected',
    details: `${reason}${terminal ? ' · sessão encerrada após 3 tentativas' : ' · nova tentativa permitida'}`,
    ip_hash: ipHash,
  });
  return { terminal };
}

async function failSession(svc: any, session: any, request: any, reason: string, ipHash = '') {
  const now = new Date().toISOString();
  await svc.entities.NitroReceiptUploadSession.update(session.id, {
    status: 'failed',
    lock_token: '',
    consumed_at: now,
    upload_finished_at: now,
    last_error: clean(reason, 220),
  }).catch(() => null);
  if (request?.id && !request.receipt_file_uri) {
    await svc.entities.NitroRequest.update(request.id, {
      receipt_status: 'awaiting_mobile',
    }).catch(() => null);
  }
  await audit(svc, {
    request_id: session.request_id,
    user_id: session.user_id,
    actor_name: 'Upload remoto',
    actor_role: 'public_token',
    action: 'upload_rejected',
    details: reason,
    ip_hash: ipHash,
  });
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const contentType = (req.headers.get('content-type') || '').toLowerCase();

    if (contentType.includes('multipart/form-data')) {
      const guard = await guardRequest(req, base44, {
        route: 'nitroReceiptUpload',
        user: null,
        body: null,
        strict: true,
        limit: 10,
        windowMs: 60_000,
        maxBodyBytes: MAX_BYTES + 1024 * 1024,
        allowMultipart: true,
      });

      const form = await req.formData();
      const action = clean(form.get('action') || 'upload', 30);
      const token = clean(form.get('token'), 100);
      const sessionId = clean(form.get('session_id'), 120);
      const uploadSource = form.get('upload_source') === 'pc' ? 'pc' : 'mobile_qr';
      const file = form.get('receipt');

      if (action !== 'upload') return Response.json({ error: 'Ação inválida' }, { status: 400 });
      if (!tokenLooksValid(token)) return Response.json({ error: 'Não foi possível abrir esta sessão de envio.' }, { status: 400 });
      if (!(file instanceof File)) return Response.json({ error: 'Selecione uma imagem' }, { status: 400 });
      if (file.size < 32 || file.size > MAX_BYTES) return Response.json({ error: 'A imagem deve ter no máximo 8 MB' }, { status: 413 });

      const session = await getSession(svc, token, sessionId);
      if (!session) return Response.json({ error: 'Não foi possível localizar esta sessão. Gere um novo QR Code no Nébula Nitro.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
      if (sessionExpired(session)) {
        await svc.entities.NitroReceiptUploadSession.update(session.id, {
          status: 'expired',
          lock_token: '',
          last_error: 'Sessão expirada',
        }).catch(() => null);
        return Response.json({ error: 'Este QR Code expirou. Gere outro no PC.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
      }
      if (session.status === 'received') {
        // Retry idempotente: se o celular reenviar após uma resposta perdida,
        // não transforme um upload já concluído em "sessão inválida".
        return Response.json({
          ok: true,
          status: 'received',
          request_id: session.request_id,
          already_received: true,
        }, {
          status: 200,
          headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' },
        });
      }
      if (session.status !== 'waiting') {
        return Response.json({ error: 'Este QR Code não pode mais ser utilizado.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
      }

      const request = await getRequestForSession(svc, session);
      if (!request || request.status !== 'pending' || request.receipt_file_uri || request.receipt_status === 'received') {
        await failSession(svc, session, request, 'Solicitação Nitro não aceita novo comprovante.', guard.ipHash || '');
        return Response.json({ error: 'Esta solicitação não aceita novo comprovante.' }, { status: 409 });
      }

      const lockToken = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      await svc.entities.NitroReceiptUploadSession.update(session.id, {
        status: 'uploading',
        lock_token: lockToken,
        upload_started_at: startedAt,
        upload_ip_hash: guard.ipHash || '',
        attempt_count: Math.min(20, Number(session.attempt_count || 0) + 1),
        last_error: '',
      });
      await svc.entities.NitroRequest.update(request.id, { receipt_status: 'uploading' }).catch(() => null);

      await new Promise((resolve) => setTimeout(resolve, 90));
      const claimed = await svc.entities.NitroReceiptUploadSession.get(session.id).catch(() => null);
      if (!claimed || claimed.status !== 'uploading' || claimed.lock_token !== lockToken) {
        return Response.json({ error: 'Este QR Code está sendo utilizado em outra sessão.' }, { status: 409 });
      }

      await audit(svc, {
        request_id: session.request_id,
        user_id: session.user_id,
        actor_name: 'Upload remoto',
        actor_role: 'public_token',
        action: 'upload_started',
        details: 'Envio de comprovante iniciado com token temporário.',
        ip_hash: guard.ipHash || '',
      });

      try {
        const { ext, expectedMime } = safeFilenameInfo(file);
        const declaredMime = clean(file.type, 80).toLowerCase();
        if (!ALLOWED_MIME.has(declaredMime) || declaredMime !== expectedMime) throw new Error('tipo_ou_extensao_incompativel');

        const original = new Uint8Array(await file.arrayBuffer());
        const detectedMime = detectMime(original);
        if (!detectedMime || detectedMime !== declaredMime) throw new Error('assinatura_do_arquivo_invalida');

        const sanitized = sanitizeImage(original, detectedMime);
        if (sanitized.length < 24 || sanitized.length > MAX_BYTES) throw new Error('imagem_sanitizada_invalida');

        const outExt = detectedMime === 'image/jpeg' ? 'jpg' : detectedMime === 'image/png' ? 'png' : 'webp';
        const safeFile = new File(
          [sanitized],
          `nitro-${crypto.randomUUID()}.${outExt}`,
          { type: detectedMime },
        );

        await svc.entities.NitroReceiptUploadSession.update(session.id, {
          status: 'processing',
          lock_token: lockToken,
        });
        await svc.entities.NitroRequest.update(request.id, { receipt_status: 'processing' }).catch(() => null);

        const stored = await svc.integrations.Core.UploadPrivateFile({ file: safeFile });
        if (!stored?.file_uri) throw new Error('falha_no_storage_privado');

        const finishedAt = new Date().toISOString();
        await svc.entities.NitroRequest.update(request.id, {
          receipt_file_uri: stored.file_uri,
          receipt_status: 'received',
          receipt_mime: detectedMime,
          receipt_size: safeFile.size,
          receipt_received_at: finishedAt,
          receipt_source: uploadSource,
          receipt_upload_session_id: session.id,
          rejection_reason: '',
        });

        await svc.entities.NitroReceiptUploadSession.update(session.id, {
          status: 'received',
          lock_token: '',
          upload_finished_at: finishedAt,
          consumed_at: finishedAt,
          last_error: '',
        });

        await audit(svc, {
          request_id: session.request_id,
          user_id: session.user_id,
          actor_name: 'Upload remoto',
          actor_role: 'public_token',
          action: 'upload_received',
          details: `Comprovante validado, sanitizado e salvo em storage privado (${detectedMime}, ${safeFile.size} bytes).`,
          ip_hash: guard.ipHash || '',
        });

        return Response.json({
          ok: true,
          status: 'received',
          request_id: request.id,
          received_at: finishedAt,
        }, {
          headers: {
            'Cache-Control': 'no-store',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
          },
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'arquivo_invalido';
        const attempts = Math.min(20, Number(session.attempt_count || 0) + 1);
        const result = await rejectUploadAttempt(svc, session, request, reason, guard.ipHash || '', attempts);
        const friendly = reason.includes('grande')
          ? 'A imagem é grande demais.'
          : reason.includes('animado')
            ? 'Imagens animadas não são aceitas.'
            : reason.includes('storage')
              ? 'Não foi possível salvar o comprovante agora. Tente novamente.'
              : 'Arquivo recusado. Envie somente PNG, JPG, JPEG ou WEBP válido de até 8 MB.';
        return Response.json({
          error: result.terminal ? `${friendly} Gere um novo QR Code para continuar.` : `${friendly} Você pode tentar outra imagem nesta mesma sessão.`,
          code: reason,
          retryable: !result.terminal,
        }, { status: reason.includes('storage') ? 503 : 415, headers: { 'Cache-Control': 'no-store' } });
      }
    }

    const body = await req.json().catch(() => ({}));
    const guard = await guardRequest(req, base44, {
      route: 'nitroReceiptUpload',
      user: null,
      body,
      strict: true,
      limit: 30,
      windowMs: 60_000,
      maxBodyBytes: 3000,
    });

    const action = clean(body?.action || 'inspect', 30);
    const token = clean(body?.token, 100);
    const sessionId = clean(body?.session_id, 120);
    if (action !== 'inspect') return Response.json({ error: 'Ação inválida' }, { status: 400 });
    if (!tokenLooksValid(token)) return Response.json({ error: 'Não foi possível abrir esta sessão de envio.' }, { status: 400 });

    let session = await getSession(svc, token, sessionId);
    if (!session) return Response.json({ error: 'Não foi possível localizar esta sessão. Gere um novo QR Code no Nébula Nitro.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

    if (sessionExpired(session) && !['received', 'expired'].includes(session.status)) {
      session = await svc.entities.NitroReceiptUploadSession.update(session.id, {
        status: 'expired',
        lock_token: '',
        last_error: 'Sessão expirada',
      }).catch(() => ({ ...session, status: 'expired' }));
      await audit(svc, {
        request_id: session.request_id,
        user_id: session.user_id,
        actor_name: 'Sistema',
        actor_role: 'system',
        action: 'qr_expired',
        details: 'Sessão temporária expirada ao ser consultada.',
        ip_hash: guard.ipHash || '',
      });
    }

    return Response.json({
      status: session.status,
      expires_at: session.expires_at,
      plan: session.plan,
      can_upload: session.status === 'waiting' && !sessionExpired(session),
    }, {
      headers: {
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao processar comprovante' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
