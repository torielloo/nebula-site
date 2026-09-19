import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Search, Ticket, Flag, Smartphone, ShieldAlert } from "lucide-react";
import PageShell from "@/components/PageShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ErrorCard, { CATEGORY_ICONS } from "@/components/solucoes/ErrorCard";
import ErrorDetailDialog from "@/components/solucoes/ErrorDetailDialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { localizeKnownError } from "@/lib/i18n/knownErrorTranslations";

const CATEGORY_META = {
  todos: "solucoes.cat_todos",
  conexao: "solucoes.cat_conexao",
  inicializacao: "solucoes.cat_inicializacao",
  anticheat: "solucoes.cat_anticheat",
  launcher: "solucoes.cat_launcher",
  discord: "solucoes.cat_discord",
  instalacao: "solucoes.cat_instalacao",
  login: "solucoes.cat_login",
  mobile: "solucoes.cat_mobile",
  windows: "solucoes.cat_windows",
  hardware: "solucoes.cat_hardware",
  graficos: "solucoes.cat_graficos",
  interface: "solucoes.cat_interface",
  outros: "solucoes.cat_outros",
};

const categoryOf = (error) => (error.category && CATEGORY_META[error.category] ? error.category : "outros");

function LightweightPhone() {
  return (
    <div className="relative mx-auto h-48 w-28 shrink-0 rounded-[2rem] border-2 border-white/15 bg-[#080808] p-1.5 shadow-[0_18px_44px_-26px_rgba(0,0,0,0.95)]" aria-hidden="true">
      <div className="relative h-full overflow-hidden rounded-[1.6rem] border border-white/10 bg-[radial-gradient(circle_at_50%_20%,hsl(var(--primary)/0.24),transparent_42%),linear-gradient(155deg,#111,#030303)]">
        <span className="absolute left-1/2 top-2 h-3 w-10 -translate-x-1/2 rounded-full bg-black" />
        <div className="absolute inset-x-3 top-12 rounded-2xl border border-primary/15 bg-primary/[0.06] p-3 text-center">
          <Smartphone className="mx-auto h-7 w-7 text-primary" />
          <span className="mt-2 block text-[8px] font-black uppercase tracking-[0.18em] text-primary">Nébula Mobile</span>
        </div>
        <span className="absolute bottom-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/35" />
      </div>
    </div>
  );
}

export default function Solucoes() {
  const { t, lang } = useI18n();
  const [errors, setErrors] = useState(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [category, setCategory] = useState("todos");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    base44.entities.KnownError.list().then(setErrors).catch(() => setErrors([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const aba = params.get("aba");
    if (aba && CATEGORY_META[aba]) setCategory(aba);
  }, []);

  const list = errors || [];

  const pills = useMemo(
    () =>
      [...new Set(list.map((e) => (e.code || "").trim().toLowerCase()).filter(Boolean))].slice(0, 8),
    [errors]
  );

  const counts = useMemo(() => {
    const c = { todos: list.length };
    for (const e of list) {
      const k = categoryOf(e);
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [errors]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return list.filter((error) => {
      const localized = localizeKnownError(error, lang);
      const matchesQuery = !q || [localized.title, error.code, localized.meaning, localized.cause, localized.identification]
        .some((value) => (value || "").toLowerCase().includes(q));
      const matchesCategory = category === "todos" || categoryOf(error) === category;
      return matchesQuery && matchesCategory;
    });
  }, [list, deferredSearch, category, lang]);

  return (
    <PageShell
      label={t("solucoes.label")}
      title={t("solucoes.title")}
      subtitle={t("solucoes.subtitle")}
      icon={<ShieldAlert className="h-6 w-6" />}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/30 bg-card/55 px-4 py-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">{t("solucoes.help_label")}</p>
            <p className="text-xs text-muted-foreground">{t("solucoes.help_hint")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild className="min-h-[38px] rounded-xl">
              <Link to="/tickets">
                <Ticket className="mr-1.5 h-3.5 w-3.5" /> {t("solucoes.report")}
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild className="min-h-[38px] rounded-xl">
              <Link to="/tickets">
                <Flag className="mr-1.5 h-3.5 w-3.5" /> {t("solucoes.report_player")}
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("solucoes.search_ph")}
            className="h-12 rounded-2xl border-border/30 bg-card/55 pl-11 pr-28 text-sm focus-visible:ring-primary/50"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">
            {t("solucoes.count", { count: counts.todos })}
          </span>
        </div>

        {pills.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pills.map((pill) => (
              <button
                key={pill}
                onClick={() => setSearch(pill)}
                className={cn(
                  "rounded-full border px-3 py-1 font-mono text-[11px] transition-all duration-200 hover:-translate-y-0.5",
                  search === pill
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border/30 bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {pill}
              </button>
            ))}
          </div>
        )}

        <div className="relative overflow-hidden rounded-2xl border border-border/30 bg-card/55 p-5">
          <span className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-primary/[0.06] blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-6">
            <LightweightPhone />
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.3em] text-primary">{t("solucoes.mobile_kicker")}</p>
              <h3 className="mt-1 font-heading text-xl font-bold">{t("solucoes.mobile_title")}</h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">{t("solucoes.mobile_body")}</p>
              <button
                onClick={() => setCategory("mobile")}
                className={cn(
                  "mt-4 flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition-transform duration-200 hover:-translate-y-0.5",
                  category === "mobile" && "opacity-90"
                )}
              >
                <Smartphone className="h-3.5 w-3.5" />
                {t("solucoes.mobile_cta", { count: counts.mobile || 0 })}
              </button>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">{t("solucoes.categories")}</p>
          <p className="text-xs text-muted-foreground">{t("solucoes.categories_hint")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(CATEGORY_META).map(([key, label]) => {
              const Icon = key === "todos" ? null : CATEGORY_ICONS[key];
              return (
                <button
                  key={key}
                  onClick={() => setCategory(key)}
                  disabled={key !== "todos" && !counts[key]}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200",
                    category === key
                      ? "border-transparent bg-primary text-primary-foreground shadow-[0_0_20px_-6px_hsl(var(--primary)/0.8)]"
                      : "border-border/30 bg-card/40 text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
                    key !== "todos" && !counts[key] && "pointer-events-none opacity-40"
                  )}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  {t(label)} {counts[key] || 0}
                </button>
              );
            })}
          </div>
        </div>

        {errors === null && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-52 animate-pulse rounded-2xl border border-border/20 bg-card/30" />
            ))}
          </div>
        )}
        {errors !== null && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
            {t("solucoes.empty")}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e) => (
            <ErrorCard
              key={e.id}
              error={e}
              category={categoryOf(e)}
              categoryLabel={t(CATEGORY_META[categoryOf(e)])}
              onOpen={setSelected}
            />
          ))}
        </div>
      </div>
      <ErrorDetailDialog error={selected} open={!!selected} onOpenChange={(open) => !open && setSelected(null)} />
    </PageShell>
  );
}