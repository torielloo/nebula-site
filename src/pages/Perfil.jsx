import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { moment } from "@/lib/time";
import { Loader2, Music2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import PageShell from "@/components/PageShell";
import { useI18n } from "@/lib/i18n";
import ProfileHeaderCard from "@/components/perfil/ProfileHeaderCard";
import DetailsTrio from "@/components/perfil/DetailsTrio";
import NitroCard from "@/components/perfil/NitroCard";
import EditProfileSection from "@/components/perfil/EditProfileSection";
import CallDevicesSection from "@/components/perfil/CallDevicesSection";
import PasswordSection from "@/components/perfil/PasswordSection";
import ImageEditorDialog from "@/components/media/ImageEditorDialog";
import { motion } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { getAmbientBeatEnabled, setAmbientBeatEnabled } from "@/lib/ambientMusicPreferences";
import { getUiClickSoundEnabled, setUiClickSoundEnabled } from "@/lib/uiClickSound";
import { discordHandle, displayName } from "@/lib/displayName";
import { fetchNitroStatus } from "@/lib/nitro";
import NitroCodeRedeem from "@/components/nitro/NitroCodeRedeem";

const NITRO_STYLE_KEYS = new Set(["accent", "accent_2", "background_url", "frame", "custom_tag", "theme", "sounds"]);

const Fade = ({ delay = 0, children }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.08 * delay, duration: 0.45, ease: "easeOut" }}
  >
    {children}
  </motion.div>
);

moment.locale("pt-br");

export default function Perfil() {
  const { user, checkUserAuth, logout } = useAuth();
  const { t } = useI18n();
  const profile = (user && user.profile) || {};
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [bannerError, setBannerError] = useState("");
  const [nitroUntil, setNitroUntil] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [ambientBeatEnabled, setAmbientBeatEnabledState] = useState(() => getAmbientBeatEnabled());
  const [uiClickSoundEnabled, setUiClickSoundEnabledState] = useState(() => getUiClickSoundEnabled());

  const refreshNitro = async () => {
    if (!user) return;
    const state = await fetchNitroStatus(user.id);
    setNitroUntil(state.active ? state.validUntil : null);
    if (state.reset) await checkUserAuth().catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    refreshNitro().catch(() => setNitroUntil(null));
  }, [user && user.id]);

  const name = displayName(user);
  const handle = discordHandle(user);

  const save = async (changes) => {
    setSaving(true);
    setSaved(false);
    try {
      const keys = Object.keys(changes || {});
      const nitroStyleChange = keys.length > 0 && keys.every((key) => NITRO_STYLE_KEYS.has(key));
      if (nitroStyleChange) {
        if (!nitroUntil) throw new Error("Nébula Nitro ativo é necessário");
        await base44.functions.invoke("saveNitroProfileStyle", { changes });
      } else {
        await base44.auth.updateMe({ profile: { ...profile, ...changes } });
      }
      await checkUserAuth();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const [pendingImage, setPendingImage] = useState(null);

  const doUpload = async (file, key) => {
    setBannerError("");
    const limitMb = 200;
    if (file.size > limitMb * 1024 * 1024) {
      setBannerError(t("perfil.file_big", { size: (file.size / 1024 / 1024).toFixed(0), limit: limitMb }));
      return;
    }
    if (key === "avatar_url" && !file.type.startsWith("image/")) {
      setBannerError(t("perfil.avatar_image"));
      return;
    }
    setUploading(key);
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file });
      await save({ [key]: res.file_url });
    } catch {
      setBannerError(t("perfil.upload_fail"));
    } finally {
      setUploading(null);
    }
  };

  const upload = (e, key) => {
    const input = e.target;
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    const isGifFile = file.type === "image/gif" || /\.gif$/i.test(file.name);
    if (isGifFile) doUpload(file, key);
    else if (file.type.startsWith("image/")) setPendingImage({ file, key });
    else doUpload(file, key);
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await base44.functions.invoke("deleteMyAccount", {});
      logout();
    } catch {
      setDeleteError(t("perfil.delete_error"));
      setDeleting(false);
    }
  };

  return (
    <PageShell
      className="mx-auto max-w-5xl"
      label={t("perfil.label")}
      title="Perfil"
      subtitle={t("perfil.subtitle")}
    >
      <div className="space-y-5">
        <ProfileHeaderCard
          name={name}
          handle={handle}
          profile={profile}
          role={user?.role || "user"}
          nitroActive={!!nitroUntil}
          uploading={uploading}
          bannerError={bannerError}
          saving={saving}
          saved={saved}
          onUpload={upload}
          onSave={save}
          onLogout={() => logout()}
        />

        <Fade delay={1}>
          <DetailsTrio user={user} profile={profile} onConnect={() => window.location.assign('/connect-discord')} />
        </Fade>

        <Fade delay={2}>
          <NitroCard validUntil={nitroUntil} />
        </Fade>

        <Fade delay={2.5}>
          <NitroCodeRedeem active={!!nitroUntil} validUntil={nitroUntil} onRedeemed={refreshNitro} />
        </Fade>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <EditProfileSection
            profile={profile}
            save={save}
            saving={saving}
            nitroActive={!!nitroUntil}
            handle={handle}
          />
          <div className="space-y-5">
            <CallDevicesSection />
          </div>
        </div>

        <Fade delay={3}>
          <section className="rounded-2xl border border-border/40 bg-white/[0.03] p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Music2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-heading text-base font-bold">{t("perfil.ambient_music")}</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("perfil.beat_hint")}
                </p>
              </div>
              <Switch
                checked={ambientBeatEnabled}
                onCheckedChange={(checked) => {
                  const next = setAmbientBeatEnabled(checked);
                  setAmbientBeatEnabledState(next);
                }}
                aria-label="Sincronizar botões com a música"
              />
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-background/30 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">{t("perfil.sync_buttons")}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{t("perfil.device_only")}</p>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">
                {ambientBeatEnabled ? t("common.enabled") : t("common.disabled")}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-background/30 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">{t("perfil.click_sound")}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{t("perfil.click_sound_hint")}</p>
              </div>
              <Switch
                checked={uiClickSoundEnabled}
                onCheckedChange={(checked) => {
                  const next = setUiClickSoundEnabled(checked);
                  setUiClickSoundEnabledState(next);
                }}
                aria-label="Som ao clicar nos botões"
              />
            </div>
          </section>
        </Fade>

        <Fade delay={4}>
          <PasswordSection user={user} />
        </Fade>

        <Fade delay={5}>
        <section className="rounded-2xl bg-white/[0.03] p-5">
          <h2 className="font-heading text-base font-bold text-destructive">{t("perfil.danger")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("perfil.danger_hint")}</p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="mt-4 min-h-[44px]">
                <Trash2 className="mr-2 h-4 w-4" />
                {t("perfil.delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-border/60 bg-card sm:max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-heading">{t("perfil.delete_confirm")}</AlertDialogTitle>
                <AlertDialogDescription>{t("perfil.delete_desc")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <Button variant="destructive" onClick={deleteAccount} disabled={deleting} className="min-h-[44px]">
                  {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {deleting ? t("perfil.deleting") : t("perfil.delete_final")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {deleteError && <p className="mt-2 text-xs font-semibold text-destructive">{deleteError}</p>}
        </section>
        </Fade>
      </div>

      <ImageEditorDialog
        file={pendingImage && pendingImage.file}
        open={!!pendingImage}
        onOpenChange={(o) => !o && setPendingImage(null)}
        defaultAspect={pendingImage && pendingImage.key === "avatar_url" ? 1 : null}
        onConfirm={(f) => doUpload(f, pendingImage.key)}
      />
    </PageShell>
  );
}
