// Silenciamento ativo de um usuário — compartilhado entre funções de backend
export async function findActiveMute(svc, user) {
  const profile = (user && user.profile) || {};
  const displayName = profile.display_name || user.full_name || (user.email || '').split('@')[0];

  const list = await svc.entities.Punishment.filter({ type: 'mute', active: true });
  const now = Date.now();
  return (
    (list || []).find((p) => {
      const idMatch = p.user_id && p.user_id === user.id;
      const nameMatch =
        !p.user_id && p.user_name && String(p.user_name).toLowerCase() === String(displayName).toLowerCase();
      if (!idMatch && !nameMatch) return false;
      if (!p.expires_at) return true;
      return new Date(p.expires_at).getTime() > now;
    }) || null
  );
}