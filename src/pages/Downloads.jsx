import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2, ArrowDownToLine, Film } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DownloadCard from "@/components/DownloadCard";
import VideoCard from "@/components/downloads/VideoCard";
import SystemRequirements from "@/components/downloads/SystemRequirements";
import DownloadsShowcase from "@/components/downloads/DownloadsShowcase";
import { Clapperboard } from "lucide-react";
import PageShell from "@/components/PageShell";
import NebulaLogo3D from "@/components/three/NebulaLogo3D";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";
import { isAdminLevel } from "@/lib/roles";
import { useI18n } from "@/lib/i18n";
import { useSiteConfig } from "@/lib/SiteConfigContext";
import { NEBULA_HEADER_ART_URL } from "@/lib/brandAssets";
import OwnerGlobalBannerEditor, { inferBannerKind } from "@/components/OwnerGlobalBannerEditor";

const EMPTY_FORM = {
  title: "",
  version: "",
  platform: "windows",
  file_url: "",
  size_mb: "",
  description: "",
  changelog: "",
  status: "active",
};

export default function Downloads() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { config: siteConfig } = useSiteConfig();
  const isAdmin = isAdminLevel(user);
  const [items, setItems] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const list = await base44.entities.Download.list("-created_date", 50);
    setItems(list);
  };

  const { pull, refreshing } = usePullToRefresh(load);

  useEffect(() => {
    load().catch(() => setItems([]));
  }, []);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (item) => {
    setForm({ ...item, size_mb: item.size_mb || "" });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.version.trim() || saving) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        version: form.version.trim(),
        platform: form.platform,
        file_url: (form.file_url || "").trim(),
        size_mb: form.size_mb ? Number(form.size_mb) : undefined,
        description: form.description || "",
        changelog: form.changelog || "",
        status: form.status,
      };
      if (form.id) {
        await base44.entities.Download.update(form.id, payload);
      } else {
        await base44.entities.Download.create(payload);
      }
      setDialogOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const togglePause = async (item) => {
    await base44.entities.Download.update(item.id, { status: item.status === "active" ? "paused" : "active" });
    await load();
  };

  const remove = async (item) => {
    await base44.entities.Download.delete(item.id);
    await load();
  };

  const bannerOverride = siteConfig?.banners?.downloads_hero;
  const legacyBannerUrl = siteConfig?.downloads?.banner_url || "";
  const bannerUrl = bannerOverride?.url || legacyBannerUrl;
  const bannerKind = inferBannerKind(
    bannerUrl,
    bannerOverride?.kind || (legacyBannerUrl && !bannerOverride ? "video" : "")
  );

  return (
    <PageShell
      hero={
        <section className="relative isolate min-h-[220px] overflow-hidden rounded-3xl border border-white/[0.08] bg-[#050505] shadow-[0_30px_90px_-45px_rgba(0,0,0,0.95)] sm:min-h-[260px] md:min-h-[320px]">
          {bannerUrl ? (
            bannerKind === "video" ? (
              <video
                key={bannerUrl}
                src={bannerUrl}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
            ) : (
              <img key={bannerUrl} src={bannerUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-center" />
            )
          ) : (
            <img src={NEBULA_HEADER_ART_URL} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
          )}

          <div className="pointer-events-none absolute inset-0 bg-black/42" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/70 to-transparent" />

          <div className="relative z-10 flex min-h-[220px] flex-col justify-between gap-8 p-5 sm:min-h-[260px] sm:p-7 md:min-h-[320px] md:p-9">
            <div className="flex items-start justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/75 backdrop-blur-xl">
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Explorar
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <OwnerGlobalBannerEditor
                  bannerKey="downloads_hero"
                  label="Trocar banner"
                />
                <NebulaLogo3D className="h-10 w-10 shrink-0" />
                {isAdmin && (
                  <Button onClick={openNew} className="h-10 rounded-full bg-white px-5 text-black hover:bg-white/90">
                    <Plus className="mr-2 h-4 w-4" /> {t("downloads.new")}
                  </Button>
                )}
              </div>
            </div>

            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-white/60">
                <Film className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em]">Downloads oficiais</span>
              </div>
              <h1 className="font-heading text-3xl font-black leading-none tracking-tight text-white drop-shadow-[0_3px_20px_rgba(0,0,0,0.8)] sm:text-4xl md:text-5xl">
                Downloads Nébula
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-medium text-white/72 drop-shadow-md sm:text-base">
                Launcher, build 14.40, mobile e tutorial oficial.
              </p>

            </div>
          </div>
        </section>
      }
    >
      <div className="space-y-6">
      <PullToRefreshIndicator pull={pull} refreshing={refreshing} />

      <DownloadsShowcase />

      {items === null && (
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-2xl bg-secondary/50" />
          <div className="h-28 animate-pulse rounded-2xl bg-secondary/50" />
        </div>
      )}
      {items && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center text-sm text-muted-foreground">
          {t("downloads.empty")}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {items && items.map((item) => (
          <DownloadCard
            key={item.id}
            item={item}
            isAdmin={isAdmin}
            onEdit={() => openEdit(item)}
            onTogglePause={() => togglePause(item)}
            onDelete={() => remove(item)}
          />
        ))}
      </div>

      <SystemRequirements />

      <div>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Clapperboard className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">{t("downloads.videos")}</p>
            <p className="text-xs text-muted-foreground">{t("downloads.videos_hint")}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <VideoCard
            index={0}
            id="vuVBwwBMFJc"
            badge={t("downloads.badge_tutorial")}
            title={t("downloads.video1_title")}
            description={t("downloads.video1_desc")}
          />
          <VideoCard
            index={1}
            id="9r_zROliKoA"
            badge={t("downloads.video2_badge")}
            title="Nebula Biggest Update Ever! | Nebula New 14.40 Trailer"
            description={t("downloads.video2_desc")}
          />
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border/60 bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">{form.id ? t("downloads.edit") : t("downloads.new")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dl-title">{t("downloads.form_title")}</Label>
              <Input id="dl-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Nébula OS Desktop" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="dl-version">{t("downloads.form_version")}</Label>
                <Input id="dl-version" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="0.67" />
              </div>
              <div className="space-y-2">
                <Label>{t("downloads.form_platform")}</Label>
                <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="windows">Windows</SelectItem>
                    <SelectItem value="android">Android</SelectItem>
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="other">{t("downloads.form_platform_other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="dl-url">{t("downloads.form_url")}</Label>
                <Input id="dl-url" value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dl-size">{t("downloads.form_size")}</Label>
                <Input id="dl-size" type="number" value={form.size_mb} onChange={(e) => setForm({ ...form, size_mb: e.target.value })} placeholder="148" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dl-desc">{t("downloads.form_desc")}</Label>
              <Textarea id="dl-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dl-changelog">Changelog</Label>
              <Textarea id="dl-changelog" value={form.changelog} onChange={(e) => setForm({ ...form, changelog: e.target.value })} rows={2} placeholder="v0.67: ..." />
            </div>
            <div className="space-y-2">
              <Label>{t("perfil.status")}</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t("downloads.form_active")}</SelectItem>
                  <SelectItem value="paused">{t("downloads.form_paused")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={save} disabled={saving || !form.title.trim() || !form.version.trim()} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? t("downloads.form_save") : t("downloads.form_publish")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </PageShell>
  );
}