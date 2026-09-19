import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Check, Lock, RotateCcw } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import PageShell from "@/components/PageShell";
import SubscriptionHero from "@/components/nitro/SubscriptionHero";
import StatusSection from "@/components/nitro/StatusSection";
import BenefitsGrid from "@/components/nitro/BenefitsGrid";
import RenewNitro from "@/components/nitro/RenewNitro";
import NebulaMusicLibrary from "@/components/nitro/NebulaMusicLibrary";
import { fetchNitroStatus } from "@/lib/nitro";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const ACCENTS = [
  { label: "nitro.color_crimson", value: "#ff263b", swatch: "#ff263b" },
  { label: "nitro.color_cyan", value: "#06b6d4", swatch: "#06b6d4" },
  { label: "nitro.color_violet", value: "#8b5cf6", swatch: "#8b5cf6" },
  { label: "nitro.color_emerald", value: "#10b981", swatch: "#10b981" },
  { label: "nitro.color_amber", value: "#f59e0b", swatch: "#f59e0b" },
];

const FRAMES = [
  { value: "", label: "nitro.frame_none" },
  { value: "neon", label: "Neon" },
  { value: "gold", label: "nitro.frame_gold" },
  { value: "aurora", label: "Aurora" },
];

export default function Nitro() {
  const { user, checkUserAuth } = useAuth();
  const { t } = useI18n();
  const profile = (user && user.profile) || {};
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [requests, setRequests] = useState(null);
  const [nitroState, setNitroState] = useState({ active: false, validUntil: null });

  const loadRequests = async () => {
    const state = await fetchNitroStatus(user.id);
    setRequests(state.requests || []);
    setNitroState({ active: state.active, validUntil: state.validUntil });
    if (state.reset) await checkUserAuth().catch(() => {});
  };

  useEffect(() => {
    if (!user) return undefined;
    loadRequests().catch(() => setRequests([]));

    const unsubscribe = base44.entities.NitroRequest.subscribe((event) => {
      const row = event?.data;
      if (!row || row.user_id !== user.id) return;
      loadRequests().catch(() => {});
    });

    return () => unsubscribe?.();
  }, [user && user.id]);

  const save = async (changes) => {
    if (!active) return;
    setSaving(true);
    setSaved(false);
    try {
      await base44.functions.invoke("saveNitroProfileStyle", { changes });
      await checkUserAuth();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const name = (user && (user.full_name || (user.email || "Você").split("@")[0])) || "Você";
  const sounds = profile.sounds || { notify: true, call: true };

  const { active, validUntil } = nitroState;

  const soundsDefault = !!sounds.notify && !!sounds.call;
  const resetAll = () => save({ accent: "", accent_source: "", frame: "", sounds: { notify: true, call: true } });
  const ResetBtn = ({ onClick, disabled }) => (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={disabled || saving} className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground">
      <RotateCcw className="mr-1 h-3 w-3" /> {t("nitro.reset")}
    </Button>
  );

  return (
    <PageShell
      className="mx-auto max-w-4xl"
      label={t("nitro.label")}
      title="Nébula Nitro"
      subtitle={t("nitro.subtitle")}
      actions={
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saved && <Check className="h-3.5 w-3.5" />}
          {saving ? t("common.saving") : saved ? t("common.saved") : ""}
        </span>
      }
    >
      <div className="space-y-8">
        <SubscriptionHero active={active} />

        {active && <StatusSection validUntil={validUntil} />}

        <BenefitsGrid />

        <RenewNitro requests={requests} active={active} validUntil={validUntil} onSubmitted={loadRequests} />

        <NebulaMusicLibrary active={active} />

        <section className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div>
            <h2 className="font-heading text-lg font-bold">{t("nitro.customize")}</h2>
            <p className="text-xs text-muted-foreground">{t("nitro.customize_hint")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={resetAll} disabled={saving || !active}>
            <RotateCcw className="mr-2 h-4 w-4" /> {t("nitro.reset_all")}
          </Button>
        </section>

        <section className="rounded-xl border border-border/40 bg-secondary/40 p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-base font-bold">{t("nitro.accent")}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("nitro.accent_hint")}</p>
            </div>
            <ResetBtn onClick={() => save({ accent: "", accent_source: "" })} disabled={!profile.accent} />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                onClick={() => save({ accent: a.value })}
                disabled={!active || saving}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-all",
                  profile.accent === a.value ? "border-foreground/40 bg-card" : "border-border/60 hover:border-foreground/20"
                )}
              >
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: a.swatch }} />
                {t(a.label)}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border/40 bg-secondary/40 p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-base font-bold">{t("nitro.frame")}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("nitro.frame_hint")}</p>
            </div>
            <ResetBtn onClick={() => save({ frame: "" })} disabled={!profile.frame} />
          </div>
          {!active ? (
            <p className="mt-4 rounded-xl border border-dashed border-border/60 bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground">
              <Lock className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
              Molduras de avatar são exclusivas do Nébula Nitro.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-6">
              {FRAMES.map((f) => (
                <button key={f.value} onClick={() => save({ frame: f.value })} disabled={saving} className="group flex flex-col items-center gap-2 disabled:cursor-not-allowed disabled:opacity-45">
                  <ProfileAvatar
                    name={name}
                    avatar={profile.avatar_url}
                    size="lg"
                    frame={f.value}
                    className={cn(
                      "rounded-full transition-transform group-hover:scale-105",
                      (profile.frame || "") === f.value && "scale-105"
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      (profile.frame || "") === f.value ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {t(f.label)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border/40 bg-secondary/40 p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-base font-bold">{t("nitro.sounds")}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("nitro.sounds_hint")}</p>
            </div>
            <ResetBtn onClick={() => save({ sounds: { notify: true, call: true } })} disabled={soundsDefault} />
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card/60 px-4 py-3">
              <span className="text-sm font-medium">{t("nitro.sound_notify")}</span>
              <Switch checked={!!sounds.notify} disabled={!active || saving} onCheckedChange={(v) => save({ sounds: { ...sounds, notify: v } })} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card/60 px-4 py-3">
              <span className="text-sm font-medium">{t("nitro.sound_call")}</span>
              <Switch checked={!!sounds.call} disabled={!active || saving} onCheckedChange={(v) => save({ sounds: { ...sounds, call: v } })} />
            </div>
          </div>
        </section>
      </div>

    </PageShell>
  );
}