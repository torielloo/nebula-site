import React from "react";
import { CheckCircle2, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import Reveal from "@/components/motion/Reveal";
import { useI18n } from "@/lib/i18n";

const POINTS = ["about.point_safe", "about.point_classic", "about.point_free"];

export default function AboutNebula() {
  const { t } = useI18n();
  return (
    <Reveal delay={0.04}>
      <section className="relative overflow-hidden bg-transparent">
        <div className="relative grid items-center gap-5 px-4 py-6 sm:gap-7 sm:px-6 sm:py-8 md:grid-cols-[minmax(180px,0.72fr)_minmax(0,1.55fr)] md:p-9 lg:gap-12 lg:p-11">
          <div className="relative mx-auto grid w-full max-w-[170px] place-items-center sm:max-w-[220px] md:max-w-[250px]">
            <img
              src="https://media.base44.com/images/public/6aa87196309472108abb65fb/8eaf849a6_NEBULAV2.png"
              alt="Nébula"
              className="w-[76%] max-w-[210px] object-contain drop-shadow-[0_12px_34px_rgba(0,0,0,0.55)] sm:w-[82%]"
              loading="lazy"
              decoding="async"
            />
          </div>

          <div className="min-w-0 text-center md:text-left">
            <div className="font-fortnite mx-auto inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground sm:text-sm md:mx-0">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {t("about.badge")}
            </div>

            <h2 className="font-fortnite-exact mt-3 text-[2.65rem] uppercase leading-[0.9] tracking-[-0.012em] text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.34)] sm:mt-4 sm:text-5xl md:text-6xl">
              {t("about.title")}
            </h2>
            <div className="mx-auto mt-3 h-1.5 w-28 rounded-full bg-gradient-to-r from-primary via-white/70 to-transparent shadow-[0_0_22px_hsl(var(--primary)/0.35)] sm:w-32 md:mx-0" />

            <p className="mx-auto mt-4 max-w-3xl text-[13px] font-medium leading-6 text-white/72 sm:mt-5 sm:text-[15px] sm:font-semibold sm:leading-7 md:mx-0">
              {t("about.body")}
            </p>

            <div className="mt-5 grid gap-2 sm:mt-6 sm:gap-2.5">
              {POINTS.map((pointKey, index) => (
                <div
                  key={pointKey}
                  className="flex items-center gap-3 rounded-2xl border border-white/[0.055] bg-white/[0.025] px-3 py-3 text-left transition hover:border-white/[0.12] hover:bg-white/[0.045] sm:px-4"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                    {index === 0 ? <ShieldCheck className="h-3.5 w-3.5" /> : index === 1 ? <Zap className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  </span>
                  <span className="text-[13px] font-semibold leading-5 tracking-normal text-white/82 sm:text-[15px] sm:leading-6">{t(pointKey)}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2 sm:mt-6 sm:flex sm:flex-wrap">
              <Link
                to="/downloads"
                className="font-fortnite-exact-readable inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm uppercase tracking-[0.01em] text-black transition hover:-translate-y-0.5 hover:bg-white/90 sm:w-auto sm:text-base"
              >
                <Zap className="h-3.5 w-3.5" />
                {t("about.play")}
              </Link>
              <Link
                to="/termos-de-servico"
                className="font-fortnite-exact-readable inline-flex w-full items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.035] px-5 py-2.5 text-sm uppercase tracking-[0.01em] text-white/70 transition hover:border-white/[0.18] hover:text-white sm:w-auto sm:text-base"
              >
                {t("about.terms")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </Reveal>
  );
}
