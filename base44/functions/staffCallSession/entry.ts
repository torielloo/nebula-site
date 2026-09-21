import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const STAFF_ROLES = new Set(['owner', 'dev', 'admin', 'moderator', 'support', 'staff']);
const SESSION_KEY = 'staff-private-main';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function newRoomCode() {
  return `PSC-${crypto.randomUUID().replace(/-/g, '')}`;
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !STAFF_ROLES.has(user.role)) {
      return Response.json({ error: 'Acesso restrito à equipe Nébula OS' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, {
      route: 'staffCallSession',
      user,
      body,
      strict: true,
      limit: 20,
      windowMs: 60_000,
      maxBodyBytes: 2_000,
    });

    const action = typeof body?.action === 'string' ? body.action : 'join';
    const svc = base44.asServiceRole;
    const rows = await svc.entities.StaffCallSession.filter({ key: SESSION_KEY }, '-created_date', 5).catch(() => []);
    let current = rows?.[0] || null;
    const expired = !current?.expires_at || new Date(current.expires_at).getTime() <= Date.now();
    const rotateRequested = action === 'rotate';

    if (rotateRequested && user.role !== 'owner') {
      return Response.json({ error: 'Somente o Owner pode rotacionar a sala privada' }, { status: 403 });
    }

    if (!current || expired || current.active === false || rotateRequested) {
      const now = new Date();
      const data = {
        key: SESSION_KEY,
        room_code: newRoomCode(),
        active: true,
        expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
        created_by: user.id,
        rotated_at: now.toISOString(),
      };
      if (current?.id) {
        await svc.entities.StaffCallSession.update(current.id, data);
        current = { ...current, ...data };
      } else {
        current = await svc.entities.StaffCallSession.create(data);
      }
    }

    return Response.json({
      ok: true,
      room: {
        name: 'Staff Call Privada',
        code: current.room_code,
        staffPrivate: true,
        coreOsEnabled: true,
        expires_at: current.expires_at,
      },
    });
  } catch (error) {
    const guarded = securityResponse(error);
    if (guarded) return guarded;
    return Response.json({ error: 'Não foi possível abrir a Staff Call privada' }, { status: 500 });
  }
}
