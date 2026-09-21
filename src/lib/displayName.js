/**
 * Nome público do usuário: prioriza SEMPRE o nome do Discord vinculado
 * (identidade oficial da plataforma), com fallbacks para contas antigas
 * que ainda não passaram pelo fluxo de vinculação.
 */
export const displayName = (user) => {
  if (!user) return "Você";
  const p = user.profile || {};
  return (
    p.discord_display_name ||
    p.discord_username ||
    p.name ||
    user.full_name ||
    (user.email ? user.email.split("@")[0] : null) ||
    "Você"
  );
};

export const discordHandle = (user) => {
  if (!user) return "voce";
  const p = user.profile || {};
  return p.discord_handle || p.discord_username || p.name || user.full_name || "voce";
};

export const discordId = (user) => user?.profile?.discord_id || "";
