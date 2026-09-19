// Cargos oficiais do Nébula OS — hierarquia e permissões
// "staff" é o cargo legado (equivalente a Moderador) mantido para contas antigas.
export const ROLE_META = {
  owner: { label: "Dono", rank: 100 },
  dev: { label: "DEV", rank: 90 },
  admin: { label: "Administrador", rank: 80 },
  moderator: { label: "Moderador", rank: 60 },
  support: { label: "Suporte", rank: 40 },
  staff: { label: "Staff", rank: 60 },
  user: { label: "Usuário", rank: 0 },
};

export const ROLE_LABELS = Object.fromEntries(
  Object.entries(ROLE_META).map(([k, v]) => [k, v.label])
);

export const TEAM_ROLES = ["owner", "dev", "admin", "moderator", "support", "staff"];

export const roleRank = (user) => (ROLE_META[(user && user.role) || "user"] || ROLE_META.user).rank;

export const hasRole = (user, minRole) =>
  roleRank(user) >= (ROLE_META[minRole] || ROLE_META.user).rank;

// Qualquer membro da equipe (Suporte e acima)
export const isStaffUser = (user) => hasRole(user, "support");

// Moderador e acima (moderação: denúncias, punições, desban, erros, logs, nitro)
export const isModerator = (user) => hasRole(user, "moderator");

// Administrador e acima (gerencia usuários, sistema, downloads, patch notes)
export const isAdminLevel = (user) => hasRole(user, "admin");

// Dono ou DEV (acesso ao Owner Center / Core OS)
export const isOwnerOrDev = (user) => !!user && ["owner", "dev"].includes(user.role);

export const roleLabel = (user) =>
  (ROLE_META[(user && user.role) || "user"] || ROLE_META.user).label;