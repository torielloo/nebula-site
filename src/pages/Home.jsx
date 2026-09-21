import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  Megaphone,
  ShieldAlert,
  Ticket,
  History,
  Headphones,
  Download as DownloadIcon,
  User as UserIcon,
  SlidersHorizontal,
  Zap,
  ArrowRight,
  Play,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import Reveal from "@/components/motion/Reveal";
import { useUiStudio } from "@/lib/uiStudio/UiStudioContext";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import StoreCard from "@/components/StoreCard";
import AboutNebula from "@/components/home/AboutNebula";
import SeasonShowcase from "@/components/home/SeasonShowcase";
import BattlePassShowcase from "@/components/home/BattlePassShowcase";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const NebulaLogo3D = lazy(() => import("@/components/three/NebulaLogo3D"));
const Iphone3D = lazy(() => import("@/components/three/Iphone3D"));
import { displayName } from "@/lib/displayName";
import { base44 } from "@/api/base44Client";
import { parseDate } from "@/lib/time";

const HERO_VIDEO =
  "https://media.base44.com/videos/public/6aa87196309472108abb65fb/ccca74459_Desktop20260902-20145902.mp4";

const GROUPS = [
  {
    titleKey: "home.groups.0.title",
    subtitleKey: "home.groups.0.subtitle",
    items: [
      { to: "/solucoes", icon: ShieldAlert, titleKey: "home.groups.0.item0.title", descKey: "home.groups.0.item0.desc" },
      { to: "/tickets", icon: Ticket, titleKey: "home.groups.0.item1.title", descKey: "home.groups.0.item1.desc" },
      { to: "/tickets", icon: History, titleKey: "home.groups.0.item2.title", descKey: "home.groups.0.item2.desc" },
    ],
  },
  {
    titleKey: "home.groups.1.title",
    subtitleKey: "home.groups.1.subtitle",
    items: [
      { to: "/calls", icon: Headphones, titleKey: "home.groups.1.item0.title", descKey: "home.groups.1.item0.desc" },
    ],
  },
  {
    titleKey: "home.groups.2.title",
    subtitleKey: "home.groups.2.subtitle",
    items: [
      { to: "/downloads", icon: DownloadIcon, titleKey: "home.groups.2.item0.title", descKey: "home.groups.2.item0.desc" },
    ],
  },
  {
    titleKey: "home.groups.3.title",
    subtitleKey: "home.groups.3.subtitle",
    items: [
      { to: "/perfil", icon: UserIcon, titleKey: "home.groups.3.item0.title", descKey: "home.groups.3.item0.desc" },
      { to: "/nitro", icon: SlidersHorizontal, titleKey: "home.groups.3.item1.title", descKey: "home.groups.3.item1.desc" },
      { to: "/nitro", icon: Zap, titleKey: "home.groups.3.item2.title", descKey: "home.groups.3.item2.desc" },
    ],
  },
];

export default function Home() {
  const { user } = useAuth();
  const { t } = useI18n();
  const ui = useUiStudio();
  const isMobile = useIsMobile();
  const heroVideoRef = useRef(null);
  const heroVideoVisibleRef = useRef(false);
  const [heroVideoNeedsTap, setHeroVideoNeedsTap] = useState(false);
  const [projectNews, setProjectNews] = useState(null);
  const el = (key) => ui.element(key);

  useEffect(() => {
    base44.entities.PatchNote.filter({ status: "published" }, "-updated_date", 6)
      .then((rows) => setProjectNews(rows || []))
      .catch(() => setProjectNews([]));
  }, []);

  useEffect(() => {
    const video = heroVideoRef.current;
    if (!video) return undefined;

    const attemptPlay = () => {
      if (!heroVideoVisibleRef.current || document.hidden) return;
      video.muted = true;
      const result = video.play();
      if (result && typeof result.then === "function") {
        result.then(() => setHeroVideoNeedsTap(false)).catch(() => setHeroVideoNeedsTap(true));
      }
    };

    const observer = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => {
          heroVideoVisibleRef.current = !!entry?.isIntersecting;
          if (entry?.isIntersecting) attemptPlay();
          else video.pause();
        }, { threshold: 0.02 })
      : null;

    if (observer) observer.observe(video);
    else {
      heroVideoVisibleRef.current = true;
      attemptPlay();
    }

    const onVisible = () => { if (!document.hidden) attemptPlay(); };
    const onPageShow = () => attemptPlay();
    const onCanPlay = () => attemptPlay();
    const onPause = () => {
      if (heroVideoVisibleRef.current && !document.hidden && isMobile) setHeroVideoNeedsTap(true);
    };
    const unlockFromGesture = () => attemptPlay();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("pause", onPause);
    window.addEventListener("pointerdown", unlockFromGesture, { passive: true });
    window.addEventListener("touchstart", unlockFromGesture, { passive: true });

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("pause", onPause);
      window.removeEventListener("pointerdown", unlockFromGesture);
      window.removeEventListener("touchstart", unlockFromGesture);
    };
  }, [isMobile]);

  const resumeHeroVideo = () => {
    const video = heroVideoRef.current;
    if (!video) return;
    video.muted = true;
    video.play().then(() => setHeroVideoNeedsTap(false)).catch(() => setHeroVideoNeedsTap(true));
  };

  const profile = (user && user.profile) || {};
  const name = displayName(user);
  const firstName = name.split(" ")[0];
  const homeGroups = GROUPS.map((g, gi) => {
    const key = `home.group.${gi}`;
    const e = el(key);
    return { g, key, e, ord: e.order !== undefined ? e.order : gi };
  })
    .filter((x) => !x.e.hidden)
    .sort((a, b) => a.ord - b.ord);

  return (
    <div className="space-y-6">
      <section className="relative left-1/2 -mt-14 w-[100vw] -translate-x-1/2 overflow-hidden">
        <video
          ref={heroVideoRef}
          src={HERO_VIDEO}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          onPlay={() => setHeroVideoNeedsTap(false)}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {isMobile && heroVideoNeedsTap && (
          <button
            type="button"
            onClick={resumeHeroVideo}
            className="font-fortnite-readable absolute right-4 top-[4.75rem] z-20 flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-md sm:hidden"
            aria-label="Tocar vídeo de fundo"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Tocar vídeo
          </button>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/45 to-transparent" />
        <div className="relative mx-auto flex max-w-[1600px] flex-col items-start px-6 py-28 text-left md:py-44">
          <motion.span
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="font-fortnite-readable flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-400"
          >
            <Activity className="h-3.5 w-3.5 shrink-0" />
            {t("home.hero.badge")}
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="font-fortnite-readable mt-5 text-sm uppercase tracking-[0.28em] text-primary sm:text-base md:text-lg"
          >
            {t("home.hero.kicker")}
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="font-fortnite mt-2 text-4xl leading-[1.05] tracking-tight md:text-7xl"
            data-ui-key="home.hero.title"
            data-ui-selected={ui.selectedKey === "home.hero.title" || undefined}
            data-ui-custom-color={el("home.hero.title").color ? "true" : undefined}
            style={el("home.hero.title").color ? { color: el("home.hero.title").color, "--ui-custom-color": el("home.hero.title").color } : undefined}
          >
            {el("home.hero.title").text || t("home.hero.title")}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="font-fortnite-readable mt-3 max-w-xl text-sm text-muted-foreground md:text-base"
            data-ui-key="home.hero.subtitle"
            data-ui-selected={ui.selectedKey === "home.hero.subtitle" || undefined}
            data-ui-custom-color={el("home.hero.subtitle").color ? "true" : undefined}
            style={el("home.hero.subtitle").color ? { color: el("home.hero.subtitle").color, "--ui-custom-color": el("home.hero.subtitle").color } : undefined}
          >
            {el("home.hero.subtitle").text || t("home.hero.subtitle")}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 flex flex-wrap items-center justify-start gap-3"
          >
            <Link
              to="/solucoes"
              data-ui-key="home.cta.solucoes"
              data-ui-selected={ui.selectedKey === "home.cta.solucoes" || undefined}
              style={{
                backgroundColor: el("home.cta.solucoes").color || undefined,
                backgroundImage: el("home.cta.solucoes").image ? `url(${el("home.cta.solucoes").image})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
              className={cn(
                "font-fortnite-readable flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground transition-transform hover:-translate-y-0.5",
                el("home.cta.solucoes").glow !== false && "nebula-glow-sm"
              )}
            >
              <ShieldAlert className="h-4 w-4" />
              {el("home.cta.solucoes").label || t("home.cta.solucoes")}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/calls"
              data-ui-key="home.cta.calls"
              data-ui-selected={ui.selectedKey === "home.cta.calls" || undefined}
              style={{ backgroundColor: el("home.cta.calls").color || undefined }}
              className="font-fortnite-readable flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm text-foreground backdrop-blur-xl transition-colors hover:bg-white/15"
            >
              <Headphones className="h-4 w-4" />
              {el("home.cta.calls").label || t("home.cta.calls")}
            </Link>
          </motion.div>
        </div>
      </section>

      <BattlePassShowcase />

      <SeasonShowcase />

      <AboutNebula />

      <Reveal>
      <section className="rounded-3xl border border-white/[0.07] bg-[#060606]/92 p-5 shadow-[0_24px_80px_-58px_rgba(0,0,0,1)] backdrop-blur-md md:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-foreground">{t("home.start.label")}</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl font-extrabold">{t("home.start.hello", { name: firstName })}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("home.start.subtitle")}</p>
            <span
              data-ui-key="home.badge.status"
              data-ui-selected={ui.selectedKey === "home.badge.status" || undefined}
              data-ui-custom-color={el("home.badge.status").color ? "true" : undefined}
              style={el("home.badge.status").color ? { color: el("home.badge.status").color, "--ui-custom-color": el("home.badge.status").color } : undefined}
              className="mt-3 flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400"
            >
              <Activity className="h-3.5 w-3.5 shrink-0" />
              {el("home.badge.status").text || t("home.badge.status")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Suspense fallback={<div className="hidden h-20 w-20 sm:block" />}>
              <NebulaLogo3D className="hidden h-12 w-12 shrink-0 sm:block" />
            </Suspense>
          </div>
        </div>
      </section>
      </Reveal>

      <Reveal delay={0.08}>
        <section aria-label={t("store.card_title")} className="w-full">
          <StoreCard />
        </section>
      </Reveal>

      <Reveal delay={0.1}>
      <section>
        <div className="flex items-end justify-between">
          <h3 className="font-heading text-base font-bold">{t("home.news.title")}</h3>
          <span className="text-xs text-muted-foreground">{t("home.news.tag")}</span>
        </div>
        <div className="mt-3 space-y-3">
          {(projectNews && projectNews.length ? projectNews : [null]).map((news, index) => (
            <article key={news?.id || "default-news"} className="rounded-3xl border border-white/[0.07] bg-[#060606] p-5 shadow-[0_20px_60px_-46px_rgba(0,0,0,1)] md:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Megaphone className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-primary">{news?.version || t("home.news.important")}</span>
                {news && (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {parseDate(news.updated_date || news.created_date).format("DD/MM/YYYY HH:mm")}
                  </span>
                )}
              </div>
              <h4 className="mt-2 font-display text-2xl font-extrabold">{news?.title || t("home.news.beta")}</h4>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{news?.notes || t("home.news.body")}</p>
              {index === 0 && projectNews === null && <span className="sr-only">{t("common.loading")}</span>}
            </article>
          ))}
        </div>
      </section>
      </Reveal>

      <Reveal delay={0.15}>
      <section className="grid items-center gap-6 overflow-visible rounded-3xl border border-white/[0.07] bg-[#060606] p-5 shadow-[0_24px_70px_-52px_rgba(0,0,0,1)] md:grid-cols-[190px_1fr] md:p-7">
        <Suspense fallback={<div className="h-44 w-full" />}>
          <Iphone3D className="h-44 w-full" />
        </Suspense>
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.3em] text-primary">{t("home.mobile.kicker")}</p>
          <h3 className="mt-1 font-heading text-2xl font-bold">{t("home.mobile.title")}</h3>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">{t("home.mobile.body")}</p>
          <Link
            to="/solucoes?aba=mobile"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            {t("home.mobile.cta")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>
      </Reveal>

      <div className="grid gap-4 md:grid-cols-2">
        {homeGroups.map((entry) => (
          <div
            key={entry.key}
            data-ui-key={entry.key}
            data-ui-selected={ui.selectedKey === entry.key || undefined}
            style={
              entry.e.image
                ? {
                    backgroundImage: `linear-gradient(hsl(var(--card) / 0.82), hsl(var(--card) / 0.82)), url(${entry.e.image})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
            className="rounded-3xl border border-white/[0.07] bg-[#060606] p-5 shadow-[0_18px_55px_-48px_rgba(0,0,0,1)] transition-all hover:border-white/[0.14] hover:bg-[#080808] md:p-6"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.06] pb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground">{entry.e.title || t(entry.g.titleKey)}</p>
                <h4 className="mt-0.5 font-heading text-base font-bold tracking-tight">{entry.e.subtitle || t(entry.g.subtitleKey)}</h4>
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              {entry.g.items.map((item) => (
                <Link
                  key={`${entry.key}-${item.titleKey}`}
                  to={item.to}
                  className="group flex items-center gap-3 rounded-2xl border border-white/[0.045] bg-[#0b0b0b] p-3 transition-all hover:-translate-y-px hover:border-white/[0.12] hover:bg-[#0e0e0e]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.035] text-foreground transition-colors duration-300 group-hover:bg-white group-hover:text-black">
                    <item.icon className="h-4 w-4 transition-transform duration-300" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{t(item.titleKey)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t(item.descKey)}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
