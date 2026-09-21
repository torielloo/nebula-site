import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const text = (v: any, max = 2048) => typeof v === 'string' ? v.trim().slice(0, max) : '';

function nameOf(user: any) {
  const p = user?.profile || {};
  return text(p.display_name || p.name || p.discord_username || user?.full_name || 'Usuário', 120);
}

function metaOf(user: any) {
  const p = user?.profile || {};
  return {
    id: user.id,
    name: nameOf(user),
    avatar: text(p.avatar_url || p.discord_avatar_url || '', 2048),
    banner: text(p.banner_url || p.discord_banner_url || '', 2048),
    frame: text(p.frame || '', 40),
    custom_frame_url: text(p.custom_frame_url || '', 2048),
    status: text(p.status || 'offline', 24),
  };
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

    await guardRequest(req, base44, {
      route: 'listDirectConversations',
      user,
      body: {},
      limit: 120,
      windowMs: 60_000,
      maxBodyBytes: 1000,
    });

    // A leitura das conversas permanece sob RLS do usuário autenticado.
    const conversations = await base44.entities.Conversation.list('-updated_date', 100).catch(() => []);
    const visible = (conversations || []).filter((conv: any) => {
      const participants = Array.isArray(conv.participants) ? conv.participants : [];
      return participants.includes(user.id) && participants.length === 2;
    });

    const partnerIds = [...new Set(
      visible.flatMap((conv: any) => (conv.participants || []).filter((id: string) => id && id !== user.id && id !== 'core-os'))
    )];

    const svc = base44.asServiceRole;
    const users = partnerIds.length
      ? await svc.entities.User.list('-updated_date', 500).catch(() => [])
      : [];
    const byId = new Map((users || []).filter((u: any) => partnerIds.includes(u.id)).map((u: any) => [u.id, u]));

    const hydrated = visible.map((conv: any) => {
      const meta = Array.isArray(conv.participant_meta) ? conv.participant_meta : [];
      const nextMeta = (conv.participants || []).map((id: string) => {
        if (id === user.id) return meta.find((m: any) => m?.id === id) || { id, name: nameOf(user), avatar: user?.profile?.avatar_url || user?.profile?.discord_avatar_url || '' };
        if (id === 'core-os') return meta.find((m: any) => m?.id === id) || { id, name: 'Core OS', avatar: '' };
        const target = byId.get(id);
        return target ? metaOf(target) : (meta.find((m: any) => m?.id === id) || { id, name: 'Usuário', avatar: '', banner: '' });
      });
      return { ...conv, participant_meta: nextMeta };
    });

    return Response.json({ conversations: hydrated }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao carregar conversas' }, { status: 500 });
  }
}
