import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const CARDS = [
  {
    image: "/downloads-showcase/pois.webp",
    titleKey: "downloads.now.pois.title",
    descKey: "downloads.now.pois.desc",
  },
  {
    image: "/downloads-showcase/quests.png",
    titleKey: "downloads.now.quests.title",
    descKey: "downloads.now.quests.desc",
  },
  {
    image: "/downloads-showcase/pois.webp",
    titleKey: "downloads.now.map.title",
    descKey: "downloads.now.map.desc",
  },
  {
    image: "/downloads-showcase/creative.png",
    titleKey: "downloads.now.creative.title",
    descKey: "downloads.now.creative.desc",
  },
  {
    image: "/downloads-showcase/teams.png",
    titleKey: "downloads.now.teams.title",
    descKey: "downloads.now.teams.desc",
  },
];

if (typeof window !== "undefined") {
  [...new Set(CARDS.map((card) => card.image))].forEach((src) => {
    const image = new Image();
    image.fetchPriority = "high";
    image.decoding = "async";
    image.src = src;
    image.decode?.().catch(() => {});
  });
}

export default function DownloadsShowcase() {
  const { t } = useI18n();
  const trackRef = useRef(null);
  const frameRef = useRef(0);
  const wheelLockRef = useRef(0);
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);

  const syncFromScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const maxScroll = Math.max(1, track.scrollWidth - track.clientWidth);
    setProgress(Math.max(0, Math.min(1, track.scrollLeft / maxScroll)));

    const viewportCenter = track.scrollLeft + track.clientWidth / 2;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const cards = track.querySelectorAll("[data-nebula-news-card]");
    cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const distance = Math.abs(cardCenter - viewportCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setActive(nearestIndex);
  }, []);

  const onScroll = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(syncFromScroll);
  }, [syncFromScroll]);

  useEffect(() => {
    syncFromScroll();
    const onResize = () => syncFromScroll();
    const track = trackRef.current;

    const onWheel = (event) => {
      if (!track) return;

      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(delta) < 4) return;

      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      if (maxScroll <= 0) return;

      const direction = delta > 0 ? 1 : -1;
      const atStart = track.scrollLeft <= 2 && direction < 0;
      const atEnd = track.scrollLeft >= maxScroll - 2 && direction > 0;
      if (atStart || atEnd) return;

      event.preventDefault();

      const now = performance.now();
      if (now < wheelLockRef.current) return;
      wheelLockRef.current = now + 360;

      const cards = track.querySelectorAll("[data-nebula-news-card]");
      const first = cards[0];
      const second = cards[1];
      const stride = second
        ? Math.max(1, second.offsetLeft - first.offsetLeft)
        : Math.max(1, first?.offsetWidth || track.clientWidth * 0.32);

      track.scrollBy({
        left: stride * direction,
        behavior: "smooth",
      });
    };

    window.addEventListener("resize", onResize);
    track?.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
      track?.removeEventListener("wheel", onWheel);
    };
  }, [syncFromScroll]);

  const goTo = (index) => {
    const track = trackRef.current;
    const cards = track?.querySelectorAll("[data-nebula-news-card]");
    const card = cards?.[index];
    if (!track || !card) return;

    const trackRect = track.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const left = track.scrollLeft + (cardRect.left - trackRect.left);
    track.scrollTo({ left, behavior: "smooth" });
  };

  const scrollByCard = (direction) => {
    const track = trackRef.current;
    const cards = track?.querySelectorAll("[data-nebula-news-card]");
    if (!track || !cards?.length) return;

    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    if (maxScroll <= 0) return;

    const first = cards[0];
    const second = cards[1];
    const stride = second
      ? Math.max(1, second.offsetLeft - first.offsetLeft)
      : Math.max(1, first.offsetWidth);

    if (direction < 0) {
      if (track.scrollLeft <= 2) {
        track.scrollTo({ left: maxScroll, behavior: "smooth" });
        return;
      }
      track.scrollBy({ left: -stride, behavior: "smooth" });
      return;
    }

    if (track.scrollLeft >= maxScroll - 2) {
      track.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }
    track.scrollBy({ left: stride, behavior: "smooth" });
  };

  const goPrevious = () => scrollByCard(-1);
  const goNext = () => scrollByCard(1);

  return (
    <section className="relative left-1/2 w-[100vw] -translate-x-1/2 overflow-hidden bg-background py-5 sm:py-8 md:py-10">
      <div>
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-8">
          <div className="w-full text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/65 sm:text-[13px] sm:tracking-[0.18em]">
              {t("downloads.now.kicker")}
            </p>
            <h2 className="font-fortnite-exact mt-1.5 text-[clamp(2rem,11vw,3.1rem)] uppercase leading-[0.9] tracking-[-0.012em] text-white drop-shadow-[0_5px_0_rgba(0,0,0,.36)] sm:text-[clamp(2.25rem,5vw,4.25rem)] sm:leading-[0.88]">
              {t("downloads.now.title")}
            </h2>
          </div>
        </div>

        <div className="relative mx-auto mt-5 max-w-[1180px] sm:mt-7">
          <button
            type="button"
            onClick={goPrevious}
            aria-label={t("downloads.now.prev")}
            className="absolute left-5 top-1/2 z-30 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/65 text-white shadow-xl backdrop-blur-xl transition hover:bg-black/85 lg:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div
            ref={trackRef}
            onScroll={onScroll}
            className="mx-auto flex w-full touch-pan-x snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4 sm:px-5 lg:gap-5 lg:px-0"
            style={{
              scrollPaddingInline: "1.5rem",
            }}
          >
            {CARDS.map((card, index) => {
              const current = index === active;
              return (
                <article
                  key={`${card.titleKey}:${index}`}
                  data-nebula-news-card
                  className={cn(
                    "w-[86vw] shrink-0 snap-start overflow-hidden rounded-[1rem] border bg-background shadow-[0_20px_48px_-40px_rgba(0,0,0,1)] transition-[transform,opacity,border-color] duration-300 sm:w-[46vw] md:w-[41vw] lg:w-[calc((100%_-_2.5rem)/3)] lg:min-w-[calc((100%_-_2.5rem)/3)] sm:rounded-[1.25rem]",
                    current
                      ? "border-white/[0.10] opacity-100"
                      : "border-white/[0.06] opacity-85"
                  )}
                >
                  <div className="relative aspect-video overflow-hidden bg-background">
                    <img
                      src={card.image}
                      alt=""
                      loading="eager"
                      fetchPriority={index < 3 ? "high" : "auto"}
                      decoding="async"
                      draggable="false"
                      className={cn(
                        "h-full w-full object-cover transition duration-500",
                        current ? "scale-100 brightness-100" : "scale-[1.008] brightness-[0.92]"
                      )}
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/25 to-transparent" />
                  </div>

                  <div className="min-h-[88px] border-t border-white/[0.055] bg-background px-3.5 py-3 sm:min-h-[92px] sm:px-4 sm:py-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/58 sm:text-[11px]">
                      {t("downloads.now.new")}
                    </p>
                    <h3 className="font-fortnite-exact mt-0.5 text-xl uppercase leading-[0.92] tracking-[-0.01em] text-white sm:text-2xl">
                      {t(card.titleKey)}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 break-words text-[12px] font-medium leading-[1.35] text-white/72 sm:text-sm">
                      {t(card.descKey)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>

          <button
            type="button"
            onClick={goNext}
            aria-label={t("downloads.now.next")}
            className="absolute right-5 top-1/2 z-30 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/65 text-white shadow-xl backdrop-blur-xl transition hover:bg-black/85 lg:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-auto mt-4 max-w-[900px] px-4 sm:mt-5 sm:px-8">
          <div className="relative h-6">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full border border-white/15 bg-white/[0.045]">
              <span
                className="absolute inset-y-0 rounded-full bg-white/80 shadow-[0_0_12px_rgba(255,255,255,.16)]"
                style={{ width: "24%", left: `${progress * 76}%` }}
              />
            </div>
            <input
              type="range"
              min="0"
              max="1000"
              step="1"
              value={Math.round(progress * 1000)}
              onChange={(event) => {
                const ratio = Number(event.target.value) / 1000;
                const track = trackRef.current;
                if (!track) return;
                const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
                track.scrollLeft = ratio * maxScroll;
              }}
              aria-label={t("downloads.now.progress")}
              className="absolute inset-0 h-full w-full cursor-ew-resize touch-pan-x opacity-0"
            />
          </div>

          <div className="mt-3 flex items-center justify-center gap-1.5 sm:hidden">
            {CARDS.map((card, index) => (
              <button
                key={`dot:${card.titleKey}`}
                type="button"
                onClick={() => goTo(index)}
                aria-label={t("downloads.now.slide", { current: index + 1, total: CARDS.length })}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === active ? "w-7 bg-white/85" : "w-3 bg-white/25"
                )}
              />
            ))}
          </div>

          <p className="mt-3 text-center text-[11px] font-medium text-white/35 sm:hidden">
            {t("downloads.now.swipe")}
          </p>
        </div>
      </div>
    </section>
  );
}
