import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Crown, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useSiteConfig } from "@/lib/SiteConfigContext";
import OwnerGlobalBannerEditor, { inferBannerKind } from "@/components/OwnerGlobalBannerEditor";

const PAINEL_VIDEO =
  "https://media.base44.com/videos/public/6aa87196309472108abb65fb/4c3f9332d_TRAVISNOVO.mp4";

const MODES = {
  owner: {
    label: "painel.hero_owner_label",
    title: "painel.hero_owner_title",
    desc: "painel.hero_owner_desc",
    icon: Crown,
  },
  staff: {
    label: "painel.hero_staff_label",
    title: "painel.hero_staff_title",
    desc: "painel.hero_staff_desc",
    icon: ShieldCheck,
  },
};

export default function PainelHeroVideo({ mode = "staff", className }) {
  const { t } = useI18n();
  const { config: siteConfig } = useSiteConfig();
  const videoRef = useRef(null);
  const cfg = MODES[mode] || MODES.staff;
  const Icon = cfg.icon;
  const bannerKey = mode === "owner" ? "panel_owner_hero" : "panel_staff_hero";
  const bannerOverride = siteConfig?.banners?.[bannerKey];
  const mediaUrl = bannerOverride?.url || PAINEL_VIDEO;
  const mediaKind = inferBannerKind(mediaUrl, bannerOverride?.kind || (bannerOverride ? "" : "video"));
  const isVideo = mediaKind === "video";

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.05 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [mediaUrl, isVideo]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/40 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.9)]",
        className
      )}
    >
      {isVideo ? (
        <video
          key={mediaUrl}
          ref={videoRef}
          src={mediaUrl}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          disablePictureInPicture
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <img
          key={mediaUrl}
          src={mediaUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <OwnerGlobalBannerEditor
        bannerKey={bannerKey}
        label={mode === "owner" ? "Trocar banner Owner" : "Trocar banner Staff"}
        className="absolute right-3 top-3 z-30 sm:right-4 sm:top-4"
        compact
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-background/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-transparent to-transparent" />

      <div className="relative flex min-h-[180px] flex-col justify-end gap-2 p-4 sm:min-h-[220px] sm:p-5 md:min-h-[300px] md:p-8">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="flex w-fit items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-primary backdrop-blur-md"
        >
          <Icon className="h-3 w-3" />
          {t(cfg.label)}
        </motion.span>
        <motion.h2
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-xl font-heading text-xl font-extrabold leading-tight text-glow sm:text-2xl md:text-4xl"
        >
          {t(cfg.title)}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-md text-xs text-muted-foreground md:text-sm"
        >
          {t(cfg.desc)}
        </motion.p>
      </div>
    </motion.section>
  );
}
