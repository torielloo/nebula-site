import React from "react";
import { motion } from "framer-motion";
import { Crown, Code2, UserCog, Gavel, Headphones, User, Check, CornerDownRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const ROLES = [
  {
    key: "owner",
    label: "role.owner",
    rank: 100,
    icon: Crown,
    tagline: "painel.ro_tag_owner",
    permissions: ["painel.ro_p_owner_1", "painel.ro_p_owner_2", "painel.ro_p_owner_3"],
  },
  {
    key: "dev",
    label: "role.dev",
    rank: 90,
    icon: Code2,
    tagline: "painel.ro_tag_dev",
    permissions: ["painel.ro_p_dev_1", "painel.ro_p_dev_2", "painel.ro_p_dev_3"],
    inherits: "role.admin",
  },
  {
    key: "admin",
    label: "role.admin",
    rank: 80,
    icon: UserCog,
    tagline: "painel.ro_tag_admin",
    permissions: ["painel.ro_p_admin_1", "painel.ro_p_admin_2", "painel.ro_p_admin_3"],
    inherits: "role.moderator",
  },
  {
    key: "moderator",
    label: "role.moderator",
    rank: 60,
    icon: Gavel,
    tagline: "painel.ro_tag_mod",
    permissions: ["painel.ro_p_mod_1", "painel.ro_p_mod_2", "painel.ro_p_mod_3", "painel.ro_p_mod_4"],
    inherits: "role.support",
  },
  {
    key: "support",
    label: "role.support",
    rank: 40,
    icon: Headphones,
    tagline: "painel.ro_tag_support",
    permissions: ["painel.ro_p_support_1", "painel.ro_p_support_2", "painel.ro_p_support_3"],
    inherits: "role.user",
  },
  {
    key: "user",
    label: "role.user",
    rank: 0,
    icon: User,
    tagline: "painel.ro_tag_user",
    permissions: ["painel.ro_p_user_1", "painel.ro_p_user_2", "painel.ro_p_user_3"],
  },
];

export default function RolesTab() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-wrap items-center gap-2"
      >
        {ROLES.map((r, i) => (
          <React.Fragment key={r.key}>
            <span className="rounded-full bg-secondary/70 px-3 py-1 text-xs font-semibold text-foreground/80">
              {t(r.label)}
            </span>
            {i < ROLES.length - 1 && (
              <span className="text-[10px] font-bold text-muted-foreground/60">›</span>
            )}
          </React.Fragment>
        ))}
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ROLES.map((role, i) => (
          <motion.div
            key={role.key}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -4 }}
            className="group relative overflow-hidden rounded-2xl border border-border/40 bg-card/60 p-5 shadow-sm backdrop-blur-xl transition-colors hover:border-primary/30"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-primary/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

            <div className="relative flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary transition-transform duration-300 group-hover:-translate-y-0.5">
                  <role.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold leading-tight">{t(role.label)}</h3>
                  <p className="text-xs text-muted-foreground">{t(role.tagline)}</p>
                </div>
              </div>
              <span className="rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                {t("painel.ro_rank", { rank: role.rank })}
              </span>
            </div>

            <ul className="relative mt-4 space-y-2">
              {role.permissions.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm text-foreground/85">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{t(p)}</span>
                </li>
              ))}
            </ul>

            {role.inherits && (
              <div className="relative mt-4 flex items-center gap-1.5 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
                <CornerDownRight className="h-3 w-3" />
                <span>
                  {t("painel.ro_inherits_prefix")} <span className="font-semibold text-foreground/75">{t(role.inherits)}</span>
                </span>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="text-center text-xs text-muted-foreground/70"
      >
        {t("painel.ro_staff_legacy")}
      </motion.p>
    </div>
  );
}