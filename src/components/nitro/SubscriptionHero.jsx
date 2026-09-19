import React from "react";
import { Sparkles, Gem, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

const FEATURE_KEYS = ["nitro.f1", "nitro.f2", "nitro.f3"];

export default function SubscriptionHero({ active }) {
  const { t } = useI18n();
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[1.15fr,1fr]">
      <div className="rounded-xl border border-border/40 bg-secondary/40 p-6 md:p-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-[11px] font-bold tracking-wide">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> NÉBULA NITRO
        </span>
        <h2 className="mt-4 font-display text-3xl font-extrabold md:text-4xl">
          {t("nitro.hero_a")} <span className="text-glow text-primary">{t("nitro.hero_b")}</span>
        </h2>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">{t("nitro.hero_desc")}</p>
        <button
          onClick={() => scrollTo("beneficios")}
          className="mt-3 text-sm font-semibold text-primary underline underline-offset-4"
        >
          {t("nitro.hero_cta")}
        </button>
      </div>

      <div className="rounded-xl border border-border/30 bg-gradient-to-b from-accent/60 to-card p-6">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          <Gem className="h-3.5 w-3.5 text-primary" /> {t("nitro.sub_kicker")}
        </p>
        <h3 className="mt-2 font-heading text-xl font-extrabold">Nitro</h3>
        <p className="mt-2 font-display text-4xl font-extrabold">R$ 6,99</p>
        <p className="text-xs text-muted-foreground">{t("nitro.price_90")}</p>
        <div className="my-4 border-t border-border/40" />
        <ul className="space-y-2 text-sm text-muted-foreground">
          {FEATURE_KEYS.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-primary" /> {t(f)}
            </li>
          ))}
        </ul>
        <Button onClick={() => scrollTo("renovar")} className="mt-5 w-full nebula-glow-sm">
          {active ? t("nitro.renew") : t("nitro.activate")}
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">{t("nitro.pix_note")}</p>
      </div>
    </section>
  );
}