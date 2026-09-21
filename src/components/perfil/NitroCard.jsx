import React from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function NitroCard({ validUntil }) {
  const { t } = useI18n();
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl bg-white/[0.04] p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
        <Star className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Nébula Nitro</p>
        <p className="text-xs text-muted-foreground">
          {validUntil ? t("perfil.nitro_active", { date: validUntil.format("DD/MM/YYYY") }) : t("perfil.nitro_none")}
        </p>
      </div>
      <Link
        to="/nitro"
        className="rounded-full bg-primary/15 px-4 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/25"
      >
        {t("perfil.nitro_cta")}
      </Link>
    </section>
  );
}