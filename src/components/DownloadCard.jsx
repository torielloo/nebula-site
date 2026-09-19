import React from "react";
import { motion } from "framer-motion";
import { Monitor, Smartphone, Globe, Package, Download as DownloadIcon, Pause, Pencil, Trash2, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const PLATFORM_ICON = {
  windows: Monitor,
  android: Smartphone,
  web: Globe,
  other: Package,
};

const PLATFORM_LABEL = {
  windows: "Windows",
  android: "Android",
  web: "Web",
};

function localizedOfficialCopy(item, lang) {
  const title = String(item.title || "").toLowerCase();
  if (lang === "pt") return { description: item.description, changelog: item.changelog };

  if (title.includes("nébula mobile") || title.includes("nebula mobile")) {
    return lang === "es"
      ? { description: "App móvil de Nébula para Android — la plataforma en tu bolsillo.", changelog: `v${item.version}: app móvil de Nébula para Android.` }
      : { description: "Nébula mobile app for Android — the platform in your pocket.", changelog: `v${item.version}: Nébula mobile app for Android.` };
  }
  if (title.includes("nébula launcher") || title.includes("nebula launcher")) {
    return lang === "es"
      ? { description: "Launcher oficial de Nébula para Windows — instala y accede a todo directamente desde tu PC.", changelog: `v${item.version}: launcher oficial de Nébula para Windows.` }
      : { description: "Official Nébula launcher for Windows — install and access everything directly from your PC.", changelog: `v${item.version}: official Nébula launcher for Windows.` };
  }
  if (title.includes("14.40") || String(item.version || "").includes("14.40")) {
    return lang === "es"
      ? { description: "Build 14.40 de Nébula — archivo .rar con los archivos del juego.", changelog: `v${item.version}: archivos de la build 14.40 de Nébula en formato .rar.` }
      : { description: "Nébula Build 14.40 — .rar archive containing the game files.", changelog: `v${item.version}: Nébula build 14.40 files in .rar format.` };
  }
  return { description: item.description, changelog: item.changelog };
}

export default function DownloadCard({ item, isAdmin, onEdit, onTogglePause, onDelete }) {
  const { t, lang } = useI18n();
  const Icon = PLATFORM_ICON[item.platform] || Package;
  const copy = localizedOfficialCopy(item, lang);
  const paused = item.status === "paused";
  const hasFile = Boolean((item.file_url || "").trim());
  const available = hasFile && !paused;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6 }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-5 transition-all duration-300 hover:border-white/20 hover:shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9),0_0_34px_-10px_hsl(var(--primary)/0.3)]",
        paused && "opacity-60"
      )}
    >
      {/* brilho vermelho decorativo no hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_18px_-10px_hsl(var(--primary)/0.45)] transition-transform duration-300 group-hover:[transform:perspective(420px)_rotateX(12deg)_rotateY(-8deg)]">
          <Icon className="h-6 w-6" />
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wider",
            paused
              ? "bg-amber-500/15 text-amber-400"
              : available
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-white/[0.06] text-muted-foreground"
          )}
        >
          {paused ? t("downloads.status_paused") : available ? t("downloads.status_available") : t("downloads.status_waiting")}
        </span>
      </div>

      <div className="relative mt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
          {PLATFORM_LABEL[item.platform] || t("downloads.platform_other")}
        </p>
        <h3 className="mt-1 font-heading text-lg font-bold">{item.title}</h3>
        {copy.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
        )}
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-black/40 px-3 py-2.5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("downloads.version_label")}</p>
          <p className="mt-0.5 font-display text-sm font-bold text-foreground">v{item.version}</p>
        </div>
        <div className="rounded-lg bg-black/40 px-3 py-2.5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("downloads.size_label")}</p>
          <p className="mt-0.5 truncate font-display text-sm font-bold text-foreground">
            {item.size_mb ? `${item.size_mb} MB` : t("downloads.size_lookup")}
          </p>
        </div>
      </div>

      {copy.changelog && (
        <p className="relative mt-3 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
          <span className="font-bold text-foreground/80">{t("downloads.changelog_label")}:</span> {copy.changelog}
        </p>
      )}

      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        {available ? (
          <Button asChild size="sm" className="rounded-lg nebula-glow-sm">
            <a href={item.file_url} target="_blank" rel="noreferrer">
              <DownloadIcon className="mr-1.5 h-4 w-4" />
              {t("downloads.download_file")}
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </a>
          </Button>
        ) : (
          <Button size="sm" variant="secondary" className="rounded-lg" disabled>
            <DownloadIcon className="mr-1.5 h-4 w-4" />
            {t("downloads.file_unpublished")}
          </Button>
        )}
        {isAdmin && (
          <>
            <Button size="sm" variant="ghost" className="rounded-lg hover:bg-white/10" onClick={onTogglePause}>
              <Pause className="mr-1 h-3.5 w-3.5" />
              {paused ? t("downloads.resume") : t("downloads.pause")}
            </Button>
            <Button size="sm" variant="ghost" className="rounded-lg hover:bg-white/10" onClick={onEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {t("downloads.edit_action")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-lg text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t("downloads.delete_action")}
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}