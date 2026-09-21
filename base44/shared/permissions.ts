const ROLE_PERMISSIONS: Record<string, string[]> = {
  user: [
    'users.view', 'users.profile.view', 'mentions.use', 'reports.create',
    'verification.view', 'appeals.create'
  ],
  support: [
    'users.view', 'users.profile.view', 'users.profile.admin_view',
    'users.discord_id.view', 'users.discord_connection.view', 'mentions.use', 'reports.create', 'reports.view',
    'tickets.view', 'tickets.reply', 'tickets.manage', 'tickets.delete',
    'verification.view', 'moderation.notes.view', 'moderation.notes.create'
  ],
  staff: [
    'users.view', 'users.profile.view', 'users.profile.admin_view',
    'users.discord_id.view', 'users.discord_connection.view', 'mentions.use',
    'reports.create', 'reports.view', 'reports.manage', 'reports.resolve',
    'tickets.view', 'tickets.reply', 'tickets.manage', 'tickets.delete',
    'verification.view', 'verification.request', 'verification.cancel',
    'moderation.notes.view', 'moderation.notes.create', 'audit_logs.view'
  ],
  moderator: [
    'users.view', 'users.profile.view', 'users.profile.admin_view',
    'users.discord_id.view', 'users.discord_connection.view', 'mentions.use',
    'reports.create', 'reports.view', 'reports.manage', 'reports.resolve',
    'tickets.view', 'tickets.reply', 'tickets.manage', 'tickets.delete',
    'verification.view', 'verification.request', 'verification.cancel',
    'verification.approve', 'verification.reject',
    'moderation.notes.view', 'moderation.notes.create', 'audit_logs.view'
  ],
  admin: [
    'users.view', 'users.profile.view', 'users.profile.admin_view',
    'users.discord_id.view', 'users.discord_connection.view', 'users.discord_connection.manage',
    'mentions.use', 'reports.create', 'reports.view', 'reports.manage', 'reports.resolve',
    'tickets.view', 'tickets.reply', 'tickets.manage', 'tickets.delete',
    'verification.view', 'verification.request', 'verification.cancel',
    'verification.approve', 'verification.reject', 'moderation.notes.view',
    'moderation.notes.create', 'audit_logs.view'
  ],
  dev: ['*'],
  owner: ['*'],
};

export const STAFF_ROLES = new Set(['support', 'staff', 'moderator', 'admin', 'dev', 'owner']);

export function roleHasPermission(user: any, permission: string) {
  const list = ROLE_PERMISSIONS[user?.role || 'user'] || ROLE_PERMISSIONS.user;
  return list.includes('*') || list.includes(permission);
}

export async function hasPermission(base44: any, user: any, permission: string) {
  if (!user) return false;
  if (user.role === 'owner' || user.role === 'dev') return true;
  try {
    const overrides = await base44.asServiceRole.entities.PermissionOverride.filter({
      user_id: user.id,
      permission,
    }, '-updated_date', 1);
    if (overrides?.length) return !!overrides[0].allowed;
  } catch {
    // Em caso de indisponibilidade do override, cai para o papel base.
  }
  return roleHasPermission(user, permission);
}

export function requireStaff(user: any) {
  return !!user && STAFF_ROLES.has(user.role);
}
