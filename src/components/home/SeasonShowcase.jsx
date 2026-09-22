import React, { useEffect, useRef, useState } from "react";
import { ExternalLink, Play, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import Reveal from "@/components/motion/Reveal";

const TRAILER_URL = "https://www.youtube.com/watch?v=Fcl30mWtJQU";

const SLIDES = [
  {
    image: "/season-showcase/nexus-war-new.jpg",
    titleKey: "season.title_nexus",
    descKey: "season.desc_nexus",
    position: "center 54%",
    zoom: 1.01,
  },
  {
    image: "/season-showcase/nexus-war.webp",
    titleKey: "season.title_nexus",
    descKey: "season.desc_nexus",
    position: "center 58%",
    zoom: 1,
  },
  {
    image: "/season-showcase/silver-surfer-new.jpg",
    titleKey: "season.title_surf",
    descKey: "season.desc_surf",
    position: "center 18%",
    zoom: 1,
  },
  {
    image: "/season-showcase/silver-surfer.webp",
    titleKey: "season.title_surf",
    descKey: "season.desc_surf",
    position: "center 48%",
    zoom: 1,
  },
];

if (typeof window !== "undefined") {
  SLIDES.forEach(({ image: src }) => {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    image.decode?.().catch(() => {});
  });
}

export default function SeasonShowcase() {
  const { t } = useI18n();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (paused || SLIDES.length < 2) return undefined;
    intervalRef.current = window.setInterval(() => {
      setActive((current) => (current + 1) % SLIDES.length);
    }, 6200);
    return () => window.clearInterval(intervalRef.current);
  }, [paused]);

  const slide = SLIDES[active];

  return (
    <Reveal delay={0.03}>
      <section
        aria-label={t("season.kicker")}
        className="relative mx-auto w-full max-w-[1260px] overflow-hidden rounded-[1.25rem] border border-white/[0.08] bg-[#050505] shadow-[0_30px_90px_-55px_rgba(0,0,0,1)] sm:rounded-[2rem]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <div className="relative h-[360px] sm:h-[390px] md:h-[470px] lg:h-[560px] xl:h-[620px]">
          {SLIDES.map((item, index) => (
            <div
              key={item.image}
              aria-hidden={index !== active}
              className={cn(
                "absolute inset-0 overflow-hidden transition-opacity duration-700 ease-out",
                index === active ? "opacity-100" : "opacity-0"
              )}
              style={{ backgroundColor: "#050505" }}
            >
              <img
                src={item.image}
                alt=""
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover brightness-[0.9] saturate-[1.02] will-change-transform"
                style={{
                  objectPosition: item.position,
                  transform: `scale(${item.zoom || 1})`,
                }}
              />
            </div>
          ))}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/74 via-black/18 to-black/0" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/75 to-transparent" />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.035]" />

          <div className="relative z-10 flex h-full max-w-[720px] flex-col justify-center px-4 py-5 sm:px-7 md:px-10 lg:px-12 xl:px-14">
            <div className="font-fortnite-readable inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-black/42 px-2.5 py-1.5 text-[10px] uppercase text-white/82 backdrop-blur-md sm:gap-2 sm:px-3 sm:text-sm">
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
              {t("season.kicker")}
            </div>

            <h2 className="font-fortnite-exact mt-3 text-3xl uppercase leading-[0.9] tracking-[-0.012em] text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.34)] sm:text-5xl md:text-6xl">
              {t(slide.titleKey)}
            </h2>
            <p className="font-fortnite-readable mt-3 hidden max-w-xl text-base text-white/82 sm:block sm:text-lg">
              {t(slide.descKey)}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-5 sm:gap-3">
              <Link
                to="/downloads"
                className="fortnite-cta font-fortnite-exact-readable inline-flex min-h-10 items-center justify-center bg-[#f4ef00] px-4 py-2 text-sm uppercase text-black shadow-[0_12px_30px_-14px_rgba(244,239,0,0.85)] transition hover:-translate-y-0.5 hover:brightness-105 sm:min-h-12 sm:px-8 sm:py-2.5 sm:text-xl"
              >
                {t("season.play")}
              </Link>

              <a
                href={TRAILER_URL}
                target="_blank"
                rel="noreferrer"
                className="font-fortnite-exact-readable inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-white/18 bg-black/55 px-3 py-2 text-sm uppercase text-white shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-black/72 sm:min-h-12 sm:gap-2 sm:px-5 sm:py-2.5 sm:text-lg"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-black">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </span>
                {t("season.trailer")}
                <ExternalLink className="h-3.5 w-3.5 text-white/55" />
              </a>

              <a
                href="#battle-pass-showcase"
                className="fortnite-cta font-fortnite-exact-readable inline-flex min-h-10 items-center justify-center bg-[#f4ef00]/90 px-4 py-2 text-sm uppercase text-black transition hover:-translate-y-0.5 hover:brightness-105 sm:min-h-12 sm:px-5 sm:py-2.5 sm:text-lg"
              >
                {t("season.learn")}
              </a>
            </div>
          </div>

          <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 p-1.5 backdrop-blur-xl sm:bottom-5 sm:right-5 sm:top-auto">
            {SLIDES.map((item, index) => (
              <button
                key={item.image}
                type="button"
                onClick={() => setActive(index)}
                aria-label={t("season.slide", { current: index + 1, total: SLIDES.length })}
                aria-current={index === active ? "true" : undefined}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === active ? "w-8 bg-cyan-300" : "w-4 bg-white/35 hover:bg-white/60"
                )}
              />
            ))}
          </div>
        </div>
      </section>
    </Reveal>
  );
}
