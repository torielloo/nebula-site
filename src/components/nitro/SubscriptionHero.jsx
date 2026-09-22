import React from "react";
import { Sparkles, Gem, Check, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { NEBULA_HEADER_ART_URL, NEBULA_LOGO_URL } from "@/lib/brandAssets";
import { useSiteConfig } from "@/lib/SiteConfigContext";
import OwnerGlobalBannerEditor, { inferBannerKind } from "@/components/OwnerGlobalBannerEditor";

const FEATURE_KEYS = ["nitro.f1", "nitro.f2", "nitro.f3"];

export default function SubscriptionHero({ active, validUntil = null }) {
  const { t } = useI18n();
  const { config: siteConfig } = useSiteConfig();
  const bannerOverride = siteConfig?.banners?.nitro_hero;
  const bannerUrl = bannerOverride?.url || NEBULA_HEADER_ART_URL;
  const bannerKind = inferBannerKind(bannerUrl, bannerOverride?.kind || "image");

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative grid overflow-hidden rounded-3xl border border-white/[0.08] bg-[#07090c]/92 shadow-[0_30px_100px_-60px_rgba(0,0,0,.95)] lg:grid-cols-[1.35fr_.8fr]">
      {bannerKind === "video" ? (
        <video
          key={bannerUrl}
          src={bannerUrl}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.16]"
        />
      ) : (
        <img key={bannerUrl} src={bannerUrl} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.13]" />
      )}
      <OwnerGlobalBannerEditor
        bannerKey="nitro_hero"
        label="Trocar banner Nitro"
        className="absolute right-3 top-3 z-30"
        compact
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#07090c]/78 via-[#07090c]/88 to-[#07090c]/96" />
      <div className="relative overflow-hidden p-6 md:p-9">
        <div className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-white/[0.018] blur-3xl" />
        <img src={NEBULA_LOGO_URL} alt="" aria-hidden="true" className="pointer-events-none absolute -bottom-10 -right-8 h-48 w-72 object-contain opacity-[0.055] sm:h-64 sm:w-96" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.08] px-3 py-1.5 text-[10px] font-black tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" /> NÉBULA NITRO
            </span>
            <span className={active ? "inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-300" : "inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-white/[0.03] px-3 py-1.5 text-[10px] font-bold text-muted-foreground"}>
              <span className={active ? "h-1.5 w-1.5 rounded-full bg-emerald-400" : "h-1.5 w-1.5 rounded-full bg-white/30"} />
              {active ? "Nitro ativo" : "Plano premium"}
            </span>
          </div>

          <h2 className="mt-5 max-w-2xl font-display text-4xl font-black leading-[1.03] tracking-tight md:text-5xl">
            {t("nitro.hero_a")} <span className="text-glow text-primary">{t("nitro.hero_b")}</span>
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">{t("nitro.hero_desc")}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => scrollTo("renovar")} size="lg" className="rounded-full px-6 nebula-glow-sm">
              <Zap className="mr-2 h-4 w-4" />
              {active ? t("nitro.renew") : t("nitro.activate")}
            </Button>
            <Button onClick={() => scrollTo("codigo-nitro")} size="lg" variant="outline" className="rounded-full px-6">
              Resgatar código <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Pagamento por PIX</span>
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Código de ativação único</span>
            <button onClick={() => scrollTo("beneficios")} className="inline-flex items-center gap-1.5 text-primary hover:underline">
              Ver todos os benefícios <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative border-t border-white/[0.07] bg-gradient-to-b from-[#e31b23]/[0.10] via-white/[0.025] to-transparent p-6 lg:border-l lg:border-t-0 md:p-7">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-primary">
          <Gem className="h-3.5 w-3.5" /> {t("nitro.sub_kicker")}
        </p>
        <div className="mt-3 flex items-end gap-2">
          <p className="font-display text-4xl font-black">R$ 6,99</p>
          <span className="pb-1 text-xs text-muted-foreground">/ 30 dias</span>
        </div>
        {active && validUntil && (
          <p className="mt-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-2 text-[11px] font-semibold text-emerald-300">
            Seu Nitro está ativo e pode ser renovado a qualquer momento.
          </p>
        )}
        <div className="my-5 border-t border-border/40" />
        <ul className="space-y-3 text-sm">
          {FEATURE_KEYS.map((f) => (
            <li key={f} className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Check className="h-3 w-3" />
              </span>
              <span className="text-muted-foreground">{t(f)}</span>
            </li>
          ))}
        </ul>
        <Button onClick={() => scrollTo("renovar")} variant="secondary" className="mt-6 w-full rounded-full">
          {active ? "Renovar meu Nitro" : "Começar agora"}
        </Button>
        <p className="mt-3 text-center text-[10px] leading-4 text-muted-foreground">{t("nitro.pix_note")}</p>
      </div>
    </section>
  );
}