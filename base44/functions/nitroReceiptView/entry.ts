import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const STAFF_ROLES = new Set(['owner', 'dev', 'admin', 'moderator', 'support', 'staff']);

function clean(value: unknown, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function safeHttpUrl(value: unknown) {
  const raw = clean(value, 2048);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, {
      route: 'nitroReceiptView',
      user,
      body,
      strict: true,
      limit: 40,
      windowMs: 60_000,
      maxBodyBytes: 2500,
    });

    const requestId = clean(body?.request_id, 120);
    if (!requestId) return Response.json({ error: 'Solicitação inválida' }, { status: 400 });

    const svc = base44.asServiceRole;
    const rows = await svc.entities.NitroRequest.filter({ id: requestId }, '-created_date', 1).catch(() => []);
    const request = rows?.[0] || null;
    if (!request) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });

    const canView = request.user_id === user.id || STAFF_ROLES.has(String(user.role || ''));
    if (!canView) return Response.json({ error: 'Sem permissão' }, { status: 403 });

    if (request.receipt_file_uri) {
      const signed = await svc.integrations.Core.CreateFileSignedUrl({
        file_uri: request.receipt_file_uri,
        expires_in: 300,
      });
      if (!signed?.signed_url) return Response.json({ error: 'Comprovante indisponível' }, { status: 404 });
      return Response.json({
        url: signed.signed_url,
        mime: request.receipt_mime || '',
        expires_in: 300,
        private: true,
      }, {
        headers: {
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
        },
      });
    }

    const legacyUrl = safeHttpUrl(request.receipt_url);
    if (legacyUrl) {
      return Response.json({ url: legacyUrl, private: false }, { headers: { 'Cache-Control': 'no-store' } });
    }

    return Response.json({ error: 'Comprovante ainda não recebido' }, { status: 404 });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao abrir comprovante' }, { status: 500 });
  }
}
