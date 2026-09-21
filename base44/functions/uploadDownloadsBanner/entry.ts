import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
]);

export default async function(req: Request) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
    });
  }

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user || !['owner', 'dev'].includes(String(user.role || ''))) {
    return Response.json({ error: 'forbidden' }, {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return Response.json({ error: 'payload_too_large' }, {
      status: 413,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'file_missing' }, {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: 'invalid_file_size' }, {
      status: 413,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const type = String(file.type || '').toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    return Response.json({ error: 'unsupported_media_type' }, {
      status: 415,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const result = await base44.asServiceRole.integrations.Core.UploadFile({ file });
  return Response.json(
    { file_url: result?.file_url || '' },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    },
  );
}
