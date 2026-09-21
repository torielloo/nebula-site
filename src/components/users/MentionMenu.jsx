import React from "react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { cn } from "@/lib/utils";

const STAFF_ROLES = new Set(["owner", "dev", "admin", "moderator", "support", "staff"]);
const ROLE_LABEL = {
  owner: "Owner",
  dev: "DEV",
  admin: "Administrador",
  moderator: "Moderador",
  staff: "Staff",
  support: "Suporte",
  user: "Usuário",
};

export default function MentionMenu({ open, matches, active, onActive, onPick, className, staffGroupLabel = "Equipe Nébula", userGroupLabel = "Usuário do ticket" }) {
  if (!open || !matches?.length) return null;

  const rows = matches.map((item, index) => ({ item, index }));
  const staff = rows.filter(({ item }) => STAFF_ROLES.has(item.role));
  const users = rows.filter(({ item }) => !STAFF_ROLES.has(item.role));
  const groups = [
    ...(staff.length ? [{ label: staffGroupLabel, rows: staff }] : []),
    ...(users.length ? [{ label: userGroupLabel, rows: users }] : []),
  ];

  return (
    <div className={cn("absolute bottom-full left-0 z-50 mb-2 w-[min(360px,calc(100vw-2rem))] max-h-[360px] overflow-y-auto rounded-2xl border border-border/50 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl scrollbar-thin", className)} role="listbox" aria-label="Sugestões de menção">
      <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Marcar pessoa</p>
      {groups.map((group) => (
        <div key={group.label} className="mb-1 last:mb-0">
          <div className="sticky top-0 z-10 flex items-center justify-between bg-popover/95 px-2 py-1.5 backdrop-blur-xl">
            <span className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/80">{group.label}</span>
            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">{group.rows.length}</span>
          </div>
          {group.rows.map(({ item, index }) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={active === index}
              onMouseEnter={() => onActive?.(index)}
              onClick={() => onPick?.(item)}
              className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors", active === index ? "bg-primary/12" : "hover:bg-accent")}
            >
              <ProfileAvatar name={item.name} avatar={item.avatar || item.avatar_url} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold">{item.name}</span>
                {(item.username || item.role) && (
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {item.username ? `@${item.username}` : ""}
                    {item.username && item.role ? " · " : ""}
                    {item.role ? (ROLE_LABEL[item.role] || item.role) : ""}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
