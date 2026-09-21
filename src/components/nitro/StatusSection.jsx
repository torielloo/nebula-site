import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CalendarDays, Ticket, UserRound } from "lucide-react";
import { moment } from "@/lib/time";
import { useI18n } from "@/lib/i18n";

export default function StatusSection({ validUntil }) {
  const { t } = useI18n();
  const remainingDays = Math.max(0, Math.ceil(validUntil.diff(moment(), "hours", true) / 24));

  return (
    <section className="grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr]">
      <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.055] p-4">
        <div className="flex items-center gap-2 text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          <p className="text-[10px] font-black uppercase tracking-[0.18em]">{t("perfil.status")}</p>
        </div>
        <p className="mt-3 text-lg font-extrabold">{t("nitro.status_active")}</p>
        <p className="mt-1 text-xs text-muted-foreground">Todos os recursos Nitro estão liberados.</p>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
        <div className="flex items-center gap-2 text-primary">
          <CalendarDays className="h-4 w-4" />
          <p className="text-[10px] font-black uppercase tracking-[0.18em]">{t("nitro.status_valid")}</p>
        </div>
        <p className="mt-3 text-lg font-extrabold">{validUntil.format("DD/MM/YYYY")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{remainingDays} {remainingDays === 1 ? "dia restante" : "dias restantes"}</p>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">{t("nitro.status_title")}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("nitro.status_hint")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to="/tickets"><Ticket className="mr-1.5 h-3.5 w-3.5" />{t("nitro.my_tickets")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to="/perfil"><UserRound className="mr-1.5 h-3.5 w-3.5" />{t("nitro.open_profile")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}