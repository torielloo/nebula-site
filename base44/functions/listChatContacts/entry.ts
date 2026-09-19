import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    await guardRequest(req, base44, { route: 'listChatContacts', user, body: {}, limit: 20, windowMs: 60_000, maxBodyBytes: 1000 });

    // 1) Contacts with a prior relationship: participants of the caller's
    // existing conversations (RLS-scoped to the caller, no elevation needed).
    const contacts = [];
    const seen = new Set([user.id]);
    const conversations = await base44.entities.Conversation.list('-updated_date', 100);
    for (const c of conversations) {
      const metas = Array.isArray(c.participant_meta) ? c.participant_meta : [];
      for (const m of metas) {
        if (!m || !m.id || seen.has(m.id)) continue;
        seen.add(m.id);
        contacts.push({ id: m.id, name: String(m.name || 'Usuário'), avatar: String(m.avatar || '') });
      }
    }

    // 2) Staff directory (support reachability only, not a full user
    // enumeration): team members only, display name never derived from email.
    const staffRoles = ['support', 'moderator', 'staff', 'admin', 'dev', 'owner'];
    const roleLabels = {
      support: 'Suporte Nébula',
      moderator: 'Moderador Nébula',
      staff: 'Staff Nébula',
      admin: 'Admin Nébula',
      dev: 'DEV Nébula',
      owner: 'Owner',
    };
    const users = await base44.asServiceRole.entities.User.list('-created_date', 200);
    for (const u of users) {
      if (u.id === user.id || seen.has(u.id)) continue;
      if (!staffRoles.includes(u.role)) continue;
      seen.add(u.id);
      const name = (u.full_name && String(u.full_name).trim()) || roleLabels[u.role] || 'Equipe Nébula';
      contacts.push({ id: u.id, name, avatar: String(u?.profile?.avatar_url || '') });
    }

    return Response.json({ contacts });
  } catch (error) {
    const blocked = securityResponse(error); if (blocked) return blocked;
    return Response.json({ error: error.message }, { status: 500 });
  }
}