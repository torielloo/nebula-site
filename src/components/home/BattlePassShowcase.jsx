import React, { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { Link } from "react-router-dom";
import Reveal from "@/components/motion/Reveal";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const SLIDE_DURATION = 6.2;

const BATTLE_PASS_SLIDES = [
  { src: "/battle-pass/team.jpg", altKey: "battlepass.alt_team" },
  { src: "/battle-pass/wolverine.jpg", altKey: "battlepass.alt_wolverine" },
  { src: "/battle-pass/thor.jpg", altKey: "battlepass.alt_thor" },
  { src: "/battle-pass/groot.jpg", altKey: "battlepass.alt_groot" },
];

function BattlePassMedal() {
  return (
    <div
      aria-hidden="true"
      className="relative grid h-[64px] w-[64px] shrink-0 place-items-center sm:h-[112px] sm:w-[112px]"
    >
      <div className="absolute inset-[11%] rotate-45 rounded-[24%] bg-gradient-to-br from-[#fff3a0] via-[#ffbf1c] to-[#8d4700] shadow-[0_8px_18px_-10px_rgba(255,184,0,.45)]" />
      <div className="absolute inset-[20%] rotate-45 rounded-[22%] border-[5px] border-[#fff0a0]/80 bg-gradient-to-br from-[#ffc21c] to-[#a75a00]" />
      <div className="absolute bottom-[3%] h-[32%] w-[72%] rounded-b-full border border-[#fff0a0]/35 bg-gradient-to-b from-[#ffbf1c] via-[#c67a0d] to-[#8d4700] shadow-[0_10px_18px_-12px_rgba(255,184,0,.45)]" />
      <div className="relative grid h-[52%] w-[52%] place-items-center rounded-full border-[4px] border-[#fff3a0] bg-gradient-to-br from-[#ffda42] to-[#a95d00] shadow-inner">
        <Star className="h-[62%] w-[62%] fill-[#fff2a0] text-[#fff2a0] drop-shadow-[0_2px_0_rgba(110,55,0,.8)]" />
      </div>
    </div>
  );
}

export default function BattlePassShowcase() {
  const { t } = useI18n();
  const [active, setActive] = useState(0);

  const advance = useCallback(() => {
    setActive((current) => (current + 1) % BATTLE_PASS_SLIDES.length);
  }, []);

  return (
    <Reveal delay={0.04}>
      <section id="battle-pass-showcase" className="relative left-1/2 w-[100vw] scroll-mt-20 -translate-x-1/2 overflow-hidden border-y border-white/[0.04] bg-background">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_26%,rgba(255,255,255,0.024),transparent_34%),radial-gradient(circle_at_72%_72%,rgba(255,255,255,0.012),transparent_30%)]" />
        <div className="relative z-10 mx-auto grid w-full max-w-[1400px] items-center gap-6 px-4 py-8 sm:gap-8 sm:px-8 sm:py-14 md:grid-cols-[1.02fr_.98fr] md:gap-10 lg:px-12 lg:py-16 xl:gap-16">
          <div className="relative z-10 min-w-0">
            <div className="relative mb-1 inline-flex w-fit items-center rounded-md border border-[#f4ef00]/35 bg-[#f4ef00]/10 px-2.5 py-1 shadow-[0_8px_24px_-18px_rgba(244,239,0,.8)] sm:-top-3 sm:px-3.5 sm:py-2">
              <p className="font-fortnite-exact-readable text-[11px] uppercase tracking-[0.04em] text-[#f4ef00] sm:text-base md:text-lg">
                {t("battlepass.kicker")}
              </p>
            </div>

            <div className="mt-1 flex items-center gap-2 sm:items-start sm:gap-5">
              <h2 className="font-fortnite-exact min-w-0 text-[clamp(2.7rem,14vw,4.7rem)] uppercase leading-[0.78] tracking-[-0.018em] text-[#f2f2ef] drop-shadow-[0_7px_0_rgba(0,0,0,.45)] sm:text-[clamp(3.3rem,8vw,7.4rem)] sm:leading-[0.76]">
                {t("battlepass.title")}
              </h2>
              <BattlePassMedal />
            </div>

            <p className="font-fortnite-exact-readable mt-5 max-w-[680px] text-base leading-[1.2] text-white/78 sm:mt-7 sm:text-2xl sm:leading-[1.12] lg:text-[1.7rem]">
              {t("battlepass.desc_line1")}
              <br className="hidden sm:block" /> {t("battlepass.desc_line2")}
            </p>

            <Link
              to="/downloads"
              className="fortnite-cta font-fortnite-exact-readable mt-7 inline-flex min-h-12 w-full items-center justify-center bg-[#f4ef00] px-7 py-2.5 text-xl uppercase text-black shadow-[0_18px_40px_-18px_rgba(244,239,0,.8)] transition duration-200 hover:-translate-y-1 hover:brightness-105 sm:mt-16 sm:min-h-14 sm:w-auto sm:px-12 sm:py-3 sm:text-3xl"
            >
              {t("battlepass.cta")}
            </Link>
          </div>

          <div className="relative min-w-0">
            <div className="relative aspect-video w-full overflow-hidden rounded-[1.2rem] border border-white/[0.08] bg-black shadow-[0_30px_80px_-42px_rgba(0,0,0,1)] sm:rounded-[1.7rem]">
              {BATTLE_PASS_SLIDES.map((slide, index) => (
                <img
                  key={slide.src}
                  src={slide.src}
                  alt={t(slide.altKey)}
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  className={cn(
                    "absolute inset-0 h-full w-full object-cover transition duration-700 ease-out",
                    index === active
                      ? "scale-100 opacity-100"
                      : "pointer-events-none scale-[1.025] opacity-0"
                  )}
                />
              ))}

              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/35 to-transparent" />

              <div className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-2 px-4 sm:bottom-4">
                {BATTLE_PASS_SLIDES.map((slide, index) => {
                  const current = index === active;
                  return (
                    <button
                      key={slide.src}
                      type="button"
                      onClick={() => setActive(index)}
                      aria-label={t("battlepass.slide", { current: index + 1, total: BATTLE_PASS_SLIDES.length })}
                      aria-current={current ? "true" : undefined}
                      className="relative h-2 w-10 overflow-hidden rounded-full border border-white/25 bg-black/55 shadow-sm backdrop-blur-md transition hover:border-white/45 sm:w-16"
                    >
                      {current ? (
                        <motion.span
                          key={`progress-${active}`}
                          className="absolute inset-y-0 left-0 rounded-full bg-[#55e8ff]"
                          initial={{ width: "0%" }}
                          animate={{ width: "100%" }}
                          transition={{ duration: SLIDE_DURATION, ease: "linear" }}
                          onAnimationComplete={advance}
                        />
                      ) : (
                        <span className="absolute inset-y-0 left-0 w-[28%] rounded-full bg-white/28" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    </Reveal>
  );
}
