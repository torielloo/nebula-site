import React, { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import Reveal from "@/components/motion/Reveal";
import { useI18n } from "@/lib/i18n";
import { NEBULA_LOGO_URL } from "@/lib/brandAssets";
import { cn } from "@/lib/utils";
import { useSiteConfig } from "@/lib/SiteConfigContext";
import OwnerGlobalBannerEditor from "@/components/OwnerGlobalBannerEditor";

const POINTS = ["about.point_safe", "about.point_classic", "about.point_free"];

const DEFAULT_BRAND_BANNERS = [
  { key: "about_banner_1", src: "/brand/gallery/banner-hq-1.webp", altKey: "about.gallery_alt_1" },
  { key: "about_banner_2", src: "/brand/gallery/banner-hq-2.webp", altKey: "about.gallery_alt_2" },
];

export default function AboutNebula() {
  const { t } = useI18n();
  const { config } = useSiteConfig();
  const [activeSlide, setActiveSlide] = useState(0);

  const brandBanners = DEFAULT_BRAND_BANNERS.map((banner) => ({
    ...banner,
    src: config?.banners?.[banner.key]?.url || banner.src,
  }));

  useEffect(() => {
    brandBanners.forEach((banner) => {
      const image = new Image();
      image.decoding = "async";
      image.src = banner.src;
    });
  }, [brandBanners[0].src, brandBanners[1].src]);

  const goToSlide = (index) => {
    setActiveSlide((index + brandBanners.length) % brandBanners.length);
  };

  return (
    <Reveal delay={0.04}>
      <section className="relative bg-transparent px-4 py-8 sm:px-6 sm:py-10 md:px-9 md:py-12 lg:px-11">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
          <div className="grid w-full place-items-center">
            <img
              src={NEBULA_LOGO_URL}
              alt="Nébula"
              className="w-[170px] object-contain sm:w-[210px] md:w-[240px]"
              loading="lazy"
              decoding="async"
            />
          </div>

          <div className="font-fortnite mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground sm:text-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {t("about.badge")}
          </div>

          <h2 className="font-fortnite-exact mt-3 text-[2.65rem] uppercase leading-[0.9] tracking-[-0.012em] text-white sm:mt-4 sm:text-5xl md:text-6xl">
            {t("about.title")}
          </h2>
          <div className="mt-3 h-1.5 w-28 rounded-full bg-gradient-to-r from-transparent via-white/80 to-transparent sm:w-36" />

          <p className="mt-5 max-w-3xl text-[13px] font-medium leading-6 text-white/72 sm:text-[15px] sm:font-semibold sm:leading-7">
            {t("about.body")}
          </p>

          <div className="mt-6 grid w-full max-w-4xl gap-2.5">
            {POINTS.map((pointKey, index) => (
              <div
                key={pointKey}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.055] bg-white/[0.018] px-3 py-3 text-left transition hover:border-white/[0.12] hover:bg-white/[0.035] sm:px-4"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-white/80">
                  {index === 0 ? <ShieldCheck className="h-3.5 w-3.5" /> : index === 1 ? <Zap className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                </span>
                <span className="text-[13px] font-semibold leading-5 tracking-normal text-white/82 sm:text-[15px] sm:leading-6">
                  {t(pointKey)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-6 grid w-full max-w-sm grid-cols-1 gap-2 sm:flex sm:max-w-none sm:flex-wrap sm:justify-center">
            <Link
              to="/downloads"
              className="font-fortnite-exact-readable inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm uppercase tracking-[0.01em] text-black transition hover:-translate-y-0.5 hover:bg-white/90 sm:w-auto sm:text-base"
            >
              <Zap className="h-3.5 w-3.5" />
              {t("about.play")}
            </Link>
            <Link
              to="/termos-de-servico"
              className="font-fortnite-exact-readable inline-flex w-full items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.025] px-5 py-2.5 text-sm uppercase tracking-[0.01em] text-white/70 transition hover:border-white/[0.18] hover:text-white sm:w-auto sm:text-base"
            >
              {t("about.terms")}
            </Link>
          </div>

          <div className="mt-8 w-full max-w-5xl sm:mt-10">
            <div className="relative aspect-[3/1] w-full overflow-hidden rounded-[1.1rem] border border-white/[0.08] bg-black sm:rounded-[1.5rem]">
              {brandBanners.map((banner, index) => (
                <img
                  key={`${banner.key}:${banner.src}`}
                  src={banner.src}
                  alt={t(banner.altKey)}
                  loading="eager"
                  fetchPriority={index === 0 ? "high" : "auto"}
                  decoding="async"
                  draggable={false}
                  className={cn(
                    "absolute inset-0 h-full w-full select-none object-cover transition-opacity duration-500 will-change-opacity",
                    index === activeSlide ? "opacity-100" : "pointer-events-none opacity-0"
                  )}
                />
              ))}

              <button
                type="button"
                onClick={() => goToSlide(activeSlide - 1)}
                aria-label={t("about.gallery_prev")}
                className="absolute left-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur-md transition hover:bg-black/80 sm:left-3 sm:h-10 sm:w-10"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => goToSlide(activeSlide + 1)}
                aria-label={t("about.gallery_next")}
                className="absolute right-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur-md transition hover:bg-black/80 sm:right-3 sm:h-10 sm:w-10"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-center gap-2">
              {brandBanners.map((banner, index) => (
                <button
                  key={`${banner.key}:${banner.src}`}
                  type="button"
                  onClick={() => goToSlide(index)}
                  aria-label={t("about.gallery_slide", { current: index + 1, total: brandBanners.length })}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    index === activeSlide ? "w-8 bg-white" : "w-3 bg-white/25 hover:bg-white/45"
                  )}
                />
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <OwnerGlobalBannerEditor
                bannerKey="about_banner_1"
                label="Trocar banner 1"
                accept="image/png,image/jpeg,image/webp,image/gif"
                maxBytes={30 * 1024 * 1024}
                compact
              />
              <OwnerGlobalBannerEditor
                bannerKey="about_banner_2"
                label="Trocar banner 2"
                accept="image/png,image/jpeg,image/webp,image/gif"
                maxBytes={30 * 1024 * 1024}
                compact
              />
            </div>
          </div>
        </div>
      </section>
    </Reveal>
  );
}
