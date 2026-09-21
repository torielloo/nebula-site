import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const ROOT_ROUTES = new Set([
  "/",
  "/solucoes",
  "/tickets",
  "/calls",
  "/mensagens",
  "/perfil",
  "/nitro",
  "/downloads",
  "/suporte-ia",
  "/painel",
  "/core-os",
]);

export default function PageShell({ label, title, subtitle, actions, icon, hero, children, className }) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const showBack = !ROOT_ROUTES.has(location.pathname);

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1280px] min-w-0 overflow-x-clip px-0 py-3 sm:px-1 md:px-2 md:py-5",
        className
      )}
    >
      {showBack && (
        <button
          onClick={() => navigate(-1)}
          className="mb-3 flex min-h-[44px] w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {t("common.back")}
        </button>
      )}
      {hero || (
        <div className="flex min-w-0 flex-col items-start justify-between gap-4 border-b border-white/[0.075] pb-5 sm:flex-row sm:items-end">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-[#090909] text-foreground">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {label && <p className="break-words text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>}
              <h1 className="break-words font-heading text-2xl font-extrabold leading-tight md:text-3xl">{title}</h1>
              {subtitle && <p className="mt-1 max-w-2xl break-words text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="w-full sm:w-auto">{actions}</div>}
        </div>
      )}
      <div className="mt-5">{children}</div>
    </div>
  );
}
