import React from "react";
import {
  CheckCircle2,
  ArrowUpRight,
  Wifi,
  Power,
  ShieldAlert,
  Rocket,
  MessageSquare,
  Download,
  LogIn,
  Smartphone,
  Monitor,
  Cpu,
  Gauge,
  LayoutGrid,
  Box,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { localizeKnownError } from "@/lib/i18n/knownErrorTranslations";

export const CATEGORY_ICONS = {
  conexao: Wifi,
  inicializacao: Power,
  anticheat: ShieldAlert,
  launcher: Rocket,
  discord: MessageSquare,
  instalacao: Download,
  login: LogIn,
  mobile: Smartphone,
  windows: Monitor,
  hardware: Cpu,
  graficos: Gauge,
  interface: LayoutGrid,
  outros: Box,
};

function ErrorCard({ error, categoryLabel, category, onOpen }) {
  const { t, lang } = useI18n();
  const localizedError = localizeKnownError(error, lang);
  const Icon = CATEGORY_ICONS[category] || Box;
  return (
    <button
      type="button"
      onClick={() => onOpen(error)}
      className="group relative flex min-h-[204px] w-full flex-col overflow-hidden rounded-2xl border border-border/35 bg-card/55 p-5 text-left shadow-[0_12px_34px_-26px_rgba(0,0,0,0.95)] transition-[transform,border-color,background-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-primary/35 hover:bg-card/70 hover:shadow-[0_18px_40px_-28px_hsl(var(--primary)/0.28)] focus-visible:ring-2 focus-visible:ring-primary/60"
      style={{ contentVisibility: "auto", containIntrinsicSize: "204px" }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/55 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-105">
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-extrabold tracking-wider text-emerald-400">
          <CheckCircle2 className="h-3 w-3" /> {t("solucoes.verified")}
        </span>
      </div>

      <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.22em] text-primary">{categoryLabel}</p>
      <h3 className="mt-1.5 font-heading text-[15px] font-bold leading-snug">{localizedError.title}</h3>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{localizedError.meaning}</p>

      <span className="mt-auto flex items-center gap-1.5 pt-4 text-xs font-bold text-primary">
        {t("solucoes.view_solution")}
        <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

export default React.memo(ErrorCard);
