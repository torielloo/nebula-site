import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, requestSecurityIdentity, securityResponse } from '../../shared/security.ts';

const DEFAULT_BLOCK_MESSAGE = 'Seu acesso ao Nébula OS foi bloqueado por segurança. Se acredita que isso foi um engano, entre em contato com o suporte.';

function activeByExpiry(item: any) {
  return item && item.active !== false && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now());
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    await guardRequest(req, base44, { route: 'securityAccessState', user, body: {}, limit: 20, windowMs: 60_000, maxBodyBytes: 1000, skipAccessBlocks: true });
    const { fingerprint } = await requestSecurityIdentity(req);

    if (user?.id) {
      const punishments = await base44.asServiceRole.entities.Punishment.filter({ user_id: user.id, active: true }, '-created_date', 50).catch(() => []);
      const ban = (punishments || []).find((item: any) => ['ban', 'tempban'].includes(item.type) && activeByExpiry(item));
      if (ban) {
        return Response.json({
          blocked: true,
          kind: 'account_ban',
          message: ban.public_message || DEFAULT_BLOCK_MESSAGE,
          expires_at: ban.expires_at || null,
          source_event_id: ban.source_event_id || null,
          can_appeal: true,
        });
      }
      const kick = (punishments || []).find((item: any) => item.type === 'kick' && activeByExpiry(item));
      if (kick) {
        return Response.json({
          blocked: true,
          kind: 'session_kick',
          message: kick.public_message || 'Sua sessão foi encerrada pela moderação. Você poderá entrar novamente em instantes.',
          expires_at: kick.expires_at || null,
          can_appeal: false,
        });
      }
    }

    const blocks = await base44.asServiceRole.entities.SecurityBlock.filter({ fingerprint, active: true }, '-created_date', 20).catch(() => []);
    const block = (blocks || []).find(activeByExpiry);
    if (block) {
      return Response.json({
        blocked: true,
        kind: 'fingerprint_block',
        message: block.show_message === false ? 'Acesso bloqueado por segurança.' : (block.custom_message || DEFAULT_BLOCK_MESSAGE),
        expires_at: block.expires_at || null,
        source_event_id: block.source_event_id || null,
        can_appeal: true,
      });
    }

    return Response.json({ blocked: false });
  } catch (error) {
    const blocked = securityResponse(error); if (blocked) return blocked;
    return Response.json({ blocked: false });
  }
}
