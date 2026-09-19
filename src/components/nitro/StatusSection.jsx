import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export default function StatusSection({ validUntil }) {
  const { t } = useI18n();
  return (
    <section className="rounded-xl border border-border/40 bg-secondary/40 p-5 md:p-6">
      <h2 className="font-heading text-base font-bold">{t("nitro.status_title")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("nitro.status_hint")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/40 bg-card/60 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("perfil.status")}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("nitro.status_active")}
          </p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/60 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("nitro.status_valid")}</p>
          <p className="mt-1 text-sm font-semibold">{validUntil.format("DD/MM/YYYY")}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button asChild variant="outline">
          <Link to="/tickets">{t("nitro.my_tickets")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/perfil">{t("nitro.open_profile")}</Link>
        </Button>
      </div>
    </section>
  );
}