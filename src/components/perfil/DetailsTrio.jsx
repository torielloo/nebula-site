import React from "react";
import { ShieldCheck, Gamepad2, CalendarDays } from "lucide-react";
import CopyIdButton from "@/components/CopyIdButton";
import { parseDate } from "@/lib/time";
import { roleLabel } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

function InfoCard({ icon, label, children }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-5">
      <div className="flex items-center gap-2.5">
        <span className="text-primary">{icon}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

export default function DetailsTrio({ user, profile, discordMsg, onConnect }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <InfoCard icon={<ShieldCheck className="h-4 w-4" />} label={t("perfil.role")}>
        <p className="text-sm font-bold">{user ? roleLabel(user) : "—"}</p>
      </InfoCard>

      <InfoCard icon={<Gamepad2 className="h-4 w-4" />} label={t("perfil.account")}>
        {profile.discord_username ? (
          <>
            <p className="truncate text-sm font-bold">Discord: {profile.discord_display_name || profile.discord_username}</p>
            <p className="text-xs text-muted-foreground">@{profile.discord_handle || profile.discord_username}</p>
            <div className="flex items-center gap-1"><p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">ID {profile.discord_id || "—"}</p><CopyIdButton value={profile.discord_id} label="Discord ID" className="h-6 w-6" /></div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{t("perfil.discord_hint")}</p>
            <Button size="sm" className="mt-2 h-8" onClick={onConnect}>
              {t("perfil.connect")}
            </Button>
          </>
        )}
        {discordMsg && <p className="mt-1 text-[11px] font-semibold text-primary">{discordMsg}</p>}
      </InfoCard>

      <InfoCard icon={<CalendarDays className="h-4 w-4" />} label={t("perfil.since")}>
        <div className="flex items-center gap-1"><p className="min-w-0 flex-1 truncate text-sm font-bold">{user && user.created_date ? parseDate(user.created_date).format("DD/MM/YYYY") : "—"}</p><CopyIdButton value={user?.id} label="ID do usuário" className="h-6 w-6" /></div>
      </InfoCard>
    </div>
  );
}
