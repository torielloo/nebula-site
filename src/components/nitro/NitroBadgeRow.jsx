import React from "react";
import { Code2, Gem, HeartHandshake, ShieldCheck, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

const META = {
  hypesquad: { label: "HypeSquad", Icon: ShieldCheck, cls: "text-fuchsia-300 bg-fuchsia-500/15 border-fuchsia-400/25" },
  booster: { label: "Booster", Icon: Gem, cls: "text-pink-300 bg-pink-500/15 border-pink-400/25" },
  developer: { label: "Active Developer", Icon: Code2, cls: "text-cyan-300 bg-cyan-500/15 border-cyan-400/25" },
  supporter: { label: "Early Supporter", Icon: HeartHandshake, cls: "text-amber-300 bg-amber-500/15 border-amber-400/25" },
  staff: { label: "Nébula Staff", Icon: UsersRound, cls: "text-emerald-300 bg-emerald-500/15 border-emerald-400/25" },
};

const RANK = { user: 0, support: 40, staff: 60, moderator: 60, admin: 80, dev: 90, owner: 100 };

export default function NitroBadgeRow({ badges, role = "user", nitroActive = false, compact = false, className }) {
  const rank = RANK[role] || 0;
  const canShow = (id) => {
    if (id === "developer") return rank >= 90;
    if (id === "supporter") return nitroActive === true;
    if (id === "staff") return rank >= 40;
    if (id === "hypesquad") return rank >= 60;
    if (id === "booster") return nitroActive === true;
    return false;
  };
  const stored = Array.isArray(badges) ? badges.filter((id) => META[id] && canShow(id)) : [];
  const list = rank >= 40 && !stored.includes("staff") ? [...stored, "staff"] : stored;
  if (!list.length) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {list.map((id) => {
        const { label, Icon, cls } = META[id];
        return (
          <span
            key={id}
            title={label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border font-semibold",
              cls,
              compact ? "h-7 px-2 text-[10px]" : "h-8 px-2.5 text-[11px]"
            )}
          >
            <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            <span>{label}</span>
          </span>
        );
      })}
    </div>
  );
}
