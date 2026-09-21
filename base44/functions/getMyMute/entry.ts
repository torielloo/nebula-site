import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { findActiveMute } from '../../shared/activeMute.ts';
import { guardRequest, securityResponse } from '../../shared/security.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    await guardRequest(req, base44, { route: 'getMyMute', user, body: {}, limit: 30, windowMs: 60_000, maxBodyBytes: 1000 });

    const mute = await findActiveMute(base44.asServiceRole, user);
    if (!mute) return Response.json({ muted: false });
    return Response.json({
      muted: true,
      reason: mute.reason || '',
      expires_at: mute.expires_at || null,
      staff_name: mute.staff_name || '',
    });
  } catch (error) {
    const blocked = securityResponse(error); if (blocked) return blocked;
    return Response.json({ error: error.message }, { status: 500 });
  }
}