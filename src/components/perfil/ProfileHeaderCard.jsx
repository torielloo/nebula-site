import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ImagePlus, LogOut, Check, Camera } from "lucide-react";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";
import NitroAvatarFrame from "@/components/nitro/NitroAvatarFrame";
import { useI18n } from "@/lib/i18n";
import NitroBadgeRow from "@/components/nitro/NitroBadgeRow";

const STATUSES = [
  { value: "online", label: "perfil.status_online", dot: "bg-emerald-400" },
  { value: "away", label: "perfil.status_away", dot: "bg-amber-400" },
  { value: "dnd", label: "perfil.status_dnd", dot: "bg-white" },
  { value: "invisible", label: "perfil.status_invisible", dot: "bg-slate-400" },
];

const STATUS_DOT = {
  online: "bg-emerald-400",
  away: "bg-amber-400",
  dnd: "bg-white",
  invisible: "bg-slate-500",
};

const isGif = (url) => /\.gif(\?.*)?$/i.test(url || "");
const isVideo = (url) => /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url || "");

const item = {
  hidden: { opacity: 0, y: 12 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.06 * i, duration: 0.4, ease: "easeOut" },
  }),
};

export default function ProfileHeaderCard({
  name,
  handle,
  profile,
  role,
  nitroActive,
  uploading,
  bannerError,
  saving,
  saved,
  onUpload,
  onSave,
  onLogout,
}) {
  const { t } = useI18n();
  const status = profile.status || "online";
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  const renderBanner = () => {
    if (!profile.banner_url) return null;
    if (isVideo(profile.banner_url))
      return <video src={profile.banner_url} autoPlay loop muted playsInline className="h-full w-full object-cover" />;
    if (isGif(profile.banner_url))
      return <img src={profile.banner_url} alt="Banner" className="h-full w-full object-cover" />;
    return <Image src={profile.banner_url} alt="Banner" className="h-full w-full object-cover" />;
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="overflow-hidden rounded-3xl bg-white/[0.05] shadow-[0_24px_70px_-30px_rgba(0,0,0,0.85)]"
    >
      {/* Banner */}
      <div className="relative h-36 bg-gradient-to-br from-primary/25 via-secondary to-background md:h-52">
        {renderBanner()}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />

        {bannerError && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-4 top-4 max-w-[70%] rounded-full border border-white/10 bg-black/80 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md"
          >
            {bannerError}
          </motion.p>
        )}

        <label className="absolute right-4 top-4 flex cursor-pointer items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md transition-all duration-200 hover:scale-[1.04] hover:bg-black/80 active:scale-95">
          {uploading === "banner_url" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" />
          )}
          {t("perfil.banner")}
          <input
            type="file"
            accept="image/*,image/gif,video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => onUpload(e, "banner_url")}
            disabled={uploading !== null}
          />
        </label>
      </div>

      {/* Identidade */}
      <div className="flex flex-col gap-5 px-5 md:flex-row md:items-end md:gap-7 md:px-7">
        <motion.div variants={item} custom={1} initial="hidden" animate="show" className="relative -mt-16 shrink-0 md:-mt-20">
          <div className="group relative">
            <NitroAvatarFrame frame={profile.frame} customFrameUrl={profile.custom_frame_url}>
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary/90 to-white/70 text-3xl font-extrabold text-primary-foreground shadow-[0_16px_44px_-14px_rgba(0,0,0,0.95)] ring-4 ring-[#0c0c0c] transition-transform duration-300 group-hover:scale-[1.03] md:h-28 md:w-28">
                {profile.avatar_url ? (
                  isGif(profile.avatar_url) ? (
                    <img src={profile.avatar_url} alt={name} className="h-full w-full object-cover" />
                  ) : (
                    <Image src={profile.avatar_url} alt={name} className="h-full w-full object-cover" />
                  )
                ) : (
                  initial
                )}
              </div>
            </NitroAvatarFrame>
            <label className="absolute inset-0 grid cursor-pointer place-items-center rounded-2xl bg-black/55 opacity-100 backdrop-blur-[2px] transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
              {uploading === "avatar_url" ? (
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              ) : (
                <Camera className="h-5 w-5 text-white" />
              )}
              <input
                type="file"
                accept="image/*,image/gif"
                className="hidden"
                onChange={(e) => onUpload(e, "avatar_url")}
                disabled={uploading !== null}
              />
            </label>
          </div>
          {status !== "invisible" && (
            <span
              className={cn(
                "absolute -bottom-1 -right-1 h-5 w-5 rounded-full ring-4 ring-[#0c0c0c] transition-colors duration-300",
                STATUS_DOT[status]
              )}
            />
          )}
        </motion.div>

        <motion.div variants={item} custom={2} initial="hidden" animate="show" className="min-w-0 flex-1 md:pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">{name}</h1>
            {profile.custom_tag && (
              <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">
                {profile.custom_tag}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm font-semibold text-primary md:text-base">@{handle}</p>
          <NitroBadgeRow badges={profile.nitro_badges} role={role} nitroActive={nitroActive} compact className="mt-2" />
          {(profile.nitro_status_text || profile.custom_status) && (
            <div className="mt-2 inline-flex max-w-full items-center rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-foreground/90">
              <span className="truncate">{profile.nitro_status_text || profile.custom_status}</span>
            </div>
          )}
          <p className="mt-2.5 line-clamp-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {profile.bio || t("perfil.bio_default")}
          </p>
        </motion.div>

        <motion.div
          variants={item}
          custom={3}
          initial="hidden"
          animate="show"
          className="flex flex-wrap items-center gap-2.5 md:pb-2"
        >
          <AnimatePresence>
            {saving && (
              <motion.span
                key="saving"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3.5 py-2 text-xs font-semibold text-muted-foreground"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("common.saving")}
              </motion.span>
            )}
            {saved && !saving && (
              <motion.span
                key="saved"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-400"
              >
                <Check className="h-3.5 w-3.5" />
                {t("common.saved")}
              </motion.span>
            )}
          </AnimatePresence>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 rounded-full bg-white/[0.06] px-4 py-2 text-xs font-semibold text-muted-foreground transition-all duration-200 hover:scale-[1.03] hover:bg-white/[0.12] hover:text-foreground active:scale-95"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t("perfil.logout")}
          </button>
        </motion.div>
      </div>

      {/* Status */}
      <motion.div
        variants={item}
        custom={4}
        initial="hidden"
        animate="show"
        className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-white/[0.06] px-5 py-4 md:px-7"
      >
        <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
          {t("perfil.status")}
        </span>
        {STATUSES.map((s) => {
          const active = status === s.value;
          return (
            <motion.button
              key={s.value}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSave({ status: s.value })}
              className={cn(
                "flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition-all duration-200",
                active
                  ? "bg-primary/20 text-primary shadow-[0_0_18px_-4px_hsl(var(--primary)/0.5)]"
                  : "bg-white/[0.05] text-muted-foreground hover:bg-white/[0.1] hover:text-foreground"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full transition-transform duration-200", s.dot, active && "scale-110")} />
              {t(s.label)}
            </motion.button>
          );
        })}
      </motion.div>
    </motion.section>
  );
}