import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const STAFF_ROLES = new Set(['owner', 'dev', 'admin', 'moderator', 'staff']);
const PLAN_DAYS: Record<string, number> = { nitro_mensal: 30, nitro_anual: 365, nitro_90: 90 };

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || !STAFF_ROLES.has(String(user.role || ''))) {
      return Response.json({ error: 'Sem permissão' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, {
      route: 'nitroAdmin', user, body, strict: true, limit: 30, windowMs: 60_000, maxBodyBytes: 3000,
    });

    const id = String(body?.request_id || '').trim().slice(0, 120);
    const status = String(body?.status || '').trim();
    if (!id || !['approved', 'rejected'].includes(status)) {
      return Response.json({ error: 'Solicitação inválida' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const rows = await svc.entities.NitroRequest.filter({ id }, '-created_date', 1);
    const request = rows?.[0];
    if (!request) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });

    if (status === 'approved') {
      const approvedAt = new Date();
      const days = PLAN_DAYS[request.plan] || 30;
      const expiresAt = new Date(approvedAt.getTime() + days * 86_400_000);
      const updated = await svc.entities.NitroRequest.update(request.id, {
        status: 'approved',
        approved_at: approvedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        expired_at: '',
      });
      return Response.json({ request: updated, expires_at: expiresAt.toISOString() });
    }

    const updated = await svc.entities.NitroRequest.update(request.id, {
      status: 'rejected', approved_at: '', expires_at: '', expired_at: '',
    });
    return Response.json({ request: updated });
  } catch (error) {
    const guarded = securityResponse(error);
    if (guarded) return guarded;
    return Response.json({ error: 'Falha ao atualizar o Nitro' }, { status: 500 });
  }
}
