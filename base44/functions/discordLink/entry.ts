import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

// Fluxo antigo desativado. Toda vinculação passa pelo Google + discordAuth.
export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    await guardRequest(req, base44, { route: 'discordLinkLegacy', user, body: {}, strict: true, limit: 5, windowMs: 60_000, maxBodyBytes: 1000 });
    return Response.json({ error: 'Use a nova vinculação Google e Discord.' }, { status: 410 });
  } catch (error) {
    const blocked = securityResponse(error); if (blocked) return blocked;
    return Response.json({ error: 'Use a nova vinculação Google e Discord.' }, { status: 410 });
  }
}
