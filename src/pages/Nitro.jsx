import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  BellRing,
  Check,
  Crown,
  CreditCard,
  Gift,
  History,
  Loader2,
  Lock,
  Music2,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  UserRound,
  Volume2,
  ImagePlus,
  Trash2,
  Tag,
} from "lucide-react";
import PageShell from "@/components/PageShell";
import SubscriptionHero from "@/components/nitro/SubscriptionHero";
import BenefitsGrid from "@/components/nitro/BenefitsGrid";
import RenewNitro from "@/components/nitro/RenewNitro";
import NitroCodeRedeem from "@/components/nitro/NitroCodeRedeem";
import NitroOverviewStatus from "@/components/nitro/NitroOverviewStatus";
import NitroHistory from "@/components/nitro/NitroHistory";
import MixerPromoCard from "@/components/nitro/MixerPromoCard";
import NitroPlansShowcase from "@/components/nitro/NitroPlansShowcase";
import DiscordProfileSimulator from "@/components/nitro/DiscordProfileSimulator";
import NitroFramesStudio from "@/components/nitro/NitroFramesStudio";
import NitroThemeBuilder from "@/components/nitro/NitroThemeBuilder";
import { fetchNitroStatus } from "@/lib/nitro";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useUiStudio } from "@/lib/uiStudio/UiStudioContext";
import { UI_PRESETS } from "@/lib/uiStudio/defaults";
import { displayName as getDisplayName } from "@/lib/displayName";

const ACCENTS = [
  { label: "nitro.color_crimson", value: "#ff263b", swatch: "#ff263b" },
  { label: "nitro.color_cyan", value: "#06b6d4", swatch: "#06b6d4" },
  { label: "nitro.color_violet", value: "#8b5cf6", swatch: "#8b5cf6" },
  { label: "nitro.color_emerald", value: "#10b981", swatch: "#10b981" },
  { label: "nitro.color_amber", value: "#f59e0b", swatch: "#f59e0b" },
];

const STUDIO_TABS = [
  { id: "aparencia", label: "Aparência", icon: Palette },
  { id: "perfil", label: "Perfil", icon: UserRound },
  { id: "interface", label: "Interface", icon: SlidersHorizontal },
  { id: "audio", label: "Áudio", icon: Volume2 },
];

export default function Nitro() {
  const { user, checkUserAuth, mergeUserProfile } = useAuth();
  const { t } = useI18n();
  const ui = useUiStudio();
  const profile = (user && user.profile) || {};
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [requests, setRequests] = useState(null);
  const [nitroState, setNitroState] = useState({ active: false, validUntil: null });
  const [studioTab, setStudioTab] = useState("aparencia");
  const [tagDraft, setTagDraft] = useState(profile.custom_tag || "");
  const [saveError, setSaveError] = useState("");
  const [backgroundUploading, setBackgroundUploading] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState("mensal");
  const nitroLoadSeqRef = useRef(0);

  const loadRequests = async () => {
    if (!user?.id) return;
    const seq = ++nitroLoadSeqRef.current;
    const state = await fetchNitroStatus(user.id);
    if (seq !== nitroLoadSeqRef.current) return;
    setRequests(state.requests || []);
    setNitroState({ active: state.active, validUntil: state.validUntil });
    if (state.reset) await checkUserAuth().catch(() => {});
  };

  useEffect(() => {
    if (!user) return undefined;
    const refresh = () => loadRequests().catch(() => setRequests((current) => current || []));
    refresh();

    const unsubscribe = base44.entities.NitroRequest.subscribe((event) => {
      const row = event?.data;
      if (!row || row.user_id !== user.id) return;
      refresh();
    });
    const timer = window.setInterval(refresh, 10000);
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubscribe?.();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user?.id]);

  const active = nitroState.active;
  const validUntil = nitroState.validUntil;

  useEffect(() => {
    setTagDraft(profile.custom_tag || "");
  }, [profile.custom_tag]);

  const save = async (changes) => {
    if (!active || saving) return;
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      let savedOk = false;
      let lastError = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const savedResult = await base44.functions.invoke("saveNitroProfileStyle", { changes });
          if (savedResult?.data?.profile) mergeUserProfile(savedResult.data.profile);
          else mergeUserProfile(changes);
          savedOk = true;
          break;
        } catch (error) {
          lastError = error;
          const message = String(error?.response?.data?.error || error?.message || "");
          const justActivated = /Nitro ativo é necessário/i.test(message);
          if (!justActivated || attempt >= 2) throw error;
          await loadRequests().catch(() => {});
          await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
        }
      }
      if (!savedOk) throw lastError || new Error("Não foi possível salvar a personalização Nitro.");
      // O backend já devolve o profile persistido e mergeUserProfile atualiza a UI imediatamente.
      // Evita uma leitura auth.me potencialmente defasada sobrescrever as cores recém-salvas.
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (error) {
      setSaveError(error?.response?.data?.error || error?.message || "Não foi possível salvar a personalização Nitro.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const name = getDisplayName(user);
  const sounds = { notify: true, call: true, ...(profile.sounds || {}) };
  const soundsDefault = !!sounds.notify && !!sounds.call;

  const resetAll = async () => {
    const ok = await save({
      accent: "",
      accent_2: "",
      accent_source: "",
      background_url: "",
      frame: "",
      custom_tag: "",
      theme: "nebula",
      cursor_effect: "none",
      sounds: { notify: true, call: true },
    });
    if (ok) {
      setTagDraft("");
      ui?.resetAll?.();
    }
  };

  const uploadBackground = async (file) => {
    if (!active || !file || backgroundUploading) return;
    if (!file.type?.startsWith("image/")) {
      setSaveError("Escolha uma imagem válida para o fundo.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setSaveError("A imagem de fundo deve ter no máximo 12 MB.");
      return;
    }
    setBackgroundUploading(true);
    setSaveError("");
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file });
      if (!res?.file_url) throw new Error("Falha ao enviar a imagem.");
      await save({ background_url: res.file_url });
    } catch (error) {
      setSaveError(error?.message || "Não foi possível enviar o fundo.");
    } finally {
      setBackgroundUploading(false);
    }
  };

  const ResetBtn = ({ onClick, disabled }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled || saving}
      className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
    >
      <RotateCcw className="mr-1 h-3 w-3" /> {t("nitro.reset")}
    </Button>
  );

  const navItems = [
    { id: "status-nitro", label: "Status", icon: Crown },
    { id: "beneficios", label: "Benefícios", icon: Crown },
    { id: "planos-nitro", label: "Planos", icon: CreditCard },
    { id: "simulador-perfil", label: "Profile Lab", icon: UserRound },
    { id: "theme-builder", label: "Theme Builder", icon: Palette },
    { id: "renovar", label: active ? "Renovar" : "Comprar", icon: CreditCard },
    { id: "codigo-nitro", label: "Código", icon: Gift },
    { id: "personalizacao", label: "Nitro Studio", icon: Palette },
    { id: "historico", label: "Histórico", icon: History },
    { id: "mixer-beneficio", label: "Mixer", icon: Music2 },
  ];

  return (
    <PageShell
      className="mx-auto max-w-6xl"
      label={t("nitro.label")}
      title="Nébula Nitro"
      subtitle="Assinatura, benefícios, pagamentos e personalização em um só lugar."
      actions={
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saved && <Check className="h-3.5 w-3.5" />}
          {saving ? t("common.saving") : saved ? t("common.saved") : ""}
        </span>
      }
    >
      <div className="relative space-y-6 overflow-x-hidden pb-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden">
          <div className="absolute left-[12%] top-8 h-52 w-52 rounded-full bg-primary/[0.08] blur-3xl" />
          <div className="absolute right-[8%] top-20 h-56 w-56 rounded-full bg-white/[0.025] blur-3xl" />
        </div>

        <SubscriptionHero active={active} validUntil={validUntil} />

        <nav className="sticky top-3 z-20 -mx-1 overflow-x-auto rounded-2xl border border-border/40 bg-background/85 p-1.5 shadow-lg shadow-black/10 backdrop-blur-xl">
          <div className="flex min-w-max gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground"
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <NitroOverviewStatus active={active} validUntil={validUntil} requests={requests || []} />

        <BenefitsGrid />

        <NitroPlansShowcase
          active={active}
          onChoose={(plan) => setCheckoutPlan(plan === "anual" ? "anual" : "mensal")}
        />

        <DiscordProfileSimulator
          user={user}
          profile={profile}
          active={active}
          saving={saving}
          save={save}
          name={name}
        />

        <NitroThemeBuilder
          profile={profile}
          active={active}
          saving={saving}
          save={save}
        />

        <RenewNitro
          requests={requests}
          active={active}
          validUntil={validUntil}
          onSubmitted={loadRequests}
          selectedPlanKey={checkoutPlan}
        />

        <div id="codigo-nitro" className="scroll-mt-24">
          <NitroCodeRedeem
            active={active}
            validUntil={validUntil}
            onRedeemed={loadRequests}
          />
        </div>

        <section
          id="personalizacao"
          className="scroll-mt-24 overflow-hidden rounded-2xl border border-border/40 bg-card/35"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/35 p-5 md:p-6">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Palette className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Nitro Studio</p>
                <h2 className="mt-1 font-heading text-lg font-extrabold">Personalização Nitro</h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                  Ajuste sua aparência sem misturar as configurações do Nébula Mixer.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={resetAll}
              disabled={saving || !active}
              className="rounded-full"
            >
              <RotateCcw className="mr-2 h-4 w-4" /> {t("nitro.reset_all")}
            </Button>
          </div>

          {!active && (
            <div className="border-b border-border/35 bg-primary/[0.025] px-5 py-3 text-xs text-muted-foreground md:px-6">
              <Lock className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
              Ative o Nébula Nitro para liberar as personalizações abaixo.
            </div>
          )}

          {saveError && (
            <div className="border-b border-destructive/20 bg-destructive/[0.08] px-5 py-3 text-xs font-semibold text-destructive md:px-6">
              {saveError}
            </div>
          )}

          <div className="border-b border-border/35 px-3 py-2 md:px-5">
            <div className="flex gap-1 overflow-x-auto">
              {STUDIO_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStudioTab(tab.id)}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold transition",
                    studioTab === tab.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 md:p-6">
            {studioTab === "aparencia" && (
              <div className="space-y-4">
                <section className="rounded-2xl border border-border/35 bg-background/25 p-4 md:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Palette className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="font-heading text-sm font-bold">{t("nitro.accent")}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">Presets ou duas cores personalizadas aplicadas em todo o Nébula.</p>
                      </div>
                    </div>
                    <ResetBtn onClick={() => save({ accent: "", accent_2: "", accent_source: "" })} disabled={!profile.accent && !profile.accent_2} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {ACCENTS.map((accent) => (
                      <button
                        key={accent.value}
                        type="button"
                        onClick={() => save({ accent: accent.value, accent_source: "nitro-studio" })}
                        disabled={!active || saving}
                        className={cn(
                          "flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                          profile.accent === accent.value
                            ? "border-primary/50 bg-primary/10"
                            : "border-border/40 bg-card/25 hover:border-border"
                        )}
                      >
                        <span className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white/10" style={{ backgroundColor: accent.swatch }} />
                        <span className="truncate">{t(accent.label)}</span>
                        {profile.accent === accent.value && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="rounded-xl border border-border/40 bg-card/25 p-3">
                      <span className="text-[11px] font-bold text-muted-foreground">Cor principal personalizada</span>
                      <input
                        type="color"
                        value={profile.accent || "#ff263b"}
                        onChange={(event) => save({ accent: event.target.value, accent_source: "custom" })}
                        disabled={!active || saving}
                        className="mt-2 h-10 w-full cursor-pointer rounded-lg border border-border/40 bg-background p-1"
                      />
                    </label>
                    <label className="rounded-xl border border-border/40 bg-card/25 p-3">
                      <span className="text-[11px] font-bold text-muted-foreground">Cor secundária</span>
                      <input
                        type="color"
                        value={profile.accent_2 || "#a855f7"}
                        onChange={(event) => save({ accent_2: event.target.value, accent_source: "custom" })}
                        disabled={!active || saving}
                        className="mt-2 h-10 w-full cursor-pointer rounded-lg border border-border/40 bg-background p-1"
                      />
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-border/35 bg-background/25 p-4 md:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-heading text-sm font-bold">Fundo personalizado</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">Use uma imagem própria como fundo global da sua experiência.</p>
                    </div>
                    {profile.background_url && (
                      <Button variant="ghost" size="sm" disabled={saving} onClick={() => save({ background_url: "" })}>
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remover
                      </Button>
                    )}
                  </div>
                  {profile.background_url && (
                    <div className="mt-3 h-28 overflow-hidden rounded-xl border border-border/40">
                      <img src={profile.background_url} alt="Fundo Nitro atual" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <label className={cn(
                    "mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 bg-card/20 px-4 text-xs font-bold transition hover:border-primary/40 hover:bg-primary/[0.04]",
                    (!active || backgroundUploading) && "pointer-events-none opacity-45"
                  )}>
                    {backgroundUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    {backgroundUploading ? "Enviando fundo..." : "Escolher imagem de fundo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      disabled={!active || backgroundUploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) uploadBackground(file);
                      }}
                    />
                  </label>
                </section>
              </div>
            )}

            {studioTab === "perfil" && (
              <div className="space-y-4">
                <NitroFramesStudio
                  profile={profile}
                  active={active}
                  saving={saving}
                  save={save}
                  name={name}
                />

                <section className="rounded-2xl border border-border/35 bg-background/25 p-4 md:p-5">
                  <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-border/40 bg-card/25 p-4">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-bold">Tag personalizada</h3>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Até 16 caracteres. A tag aparece no seu perfil e para outros usuários enquanto o Nitro estiver ativo.</p>
                    <div className="mt-3 flex gap-2">
                      <Input
                        value={tagDraft}
                        onChange={(event) => setTagDraft(event.target.value.replace(/\s+/g, " ").toUpperCase().slice(0, 16))}
                        disabled={!active || saving}
                        maxLength={16}
                        placeholder="EX.: FUNDADOR"
                        className="h-10"
                      />
                      <Button
                        size="sm"
                        className="h-10"
                        disabled={!active || saving || tagDraft.trim() === (profile.custom_tag || "")}
                        onClick={async () => {
                          const ok = await save({ custom_tag: tagDraft });
                          if (ok) setTagDraft(tagDraft.trim().toUpperCase());
                        }}
                      >
                        Salvar
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-10 w-10 shrink-0"
                        disabled={!active || saving || !profile.custom_tag}
                        onClick={async () => {
                          const ok = await save({ custom_tag: "" });
                          if (ok) setTagDraft("");
                        }}
                        title="Remover tag"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Prévia: <b className="text-primary">{tagDraft.trim() || "SEM TAG"}</b></span>
                      <span>{tagDraft.length}/16</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/40 bg-card/25 p-4">
                    <div className="flex items-center gap-2">
                      <Palette className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-bold">Tema do perfil</h3>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Escolha o visual base. O tema Nitro usa sua cor principal e secundária.</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        { id: "nebula", label: "Nébula" },
                        { id: "nebula_nitro", label: "Nébula Nitro" },
                      ].map((theme) => (
                        <button
                          key={theme.id}
                          type="button"
                          disabled={!active || saving}
                          onClick={() => save({ theme: theme.id })}
                          className={cn(
                            "rounded-xl border px-3 py-3 text-left text-xs font-bold transition disabled:opacity-45",
                            (profile.theme || "nebula") === theme.id
                              ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-border/40 bg-background/30 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {theme.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
              </div>
            )}

            {studioTab === "interface" && (
              !active ? (
                <section className="rounded-2xl border border-border/35 bg-background/25 p-5 md:p-6">
                  <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-border/40 bg-card/20 px-6 py-10 text-center">
                    <div className="max-w-md">
                      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-border/40 bg-secondary/40">
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <h3 className="mt-4 font-heading text-base font-extrabold">Interface Nitro bloqueada</h3>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        Ative o Nébula Nitro para liberar o UI Studio, presets, HUD, fundos por página, ordem dos elementos e sons personalizados.
                      </p>
                    </div>
                  </div>
                </section>
              ) : (
              <section className="rounded-2xl border border-border/35 bg-background/25 p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <SlidersHorizontal className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-heading text-sm font-bold">Interface Nitro</h3>
                      <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                        Presets, HUD, ordem de elementos, fundos por página e sons de clique agora abrem e salvam pelo UI Studio.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={!ui?.canEdit && ui?.nitroStatus === "ready"}
                    onClick={() => void ui?.openEditor?.()}
                    className="rounded-full"
                  >
                    <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
                    Abrir UI Studio
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {UI_PRESETS.map((preset) => {
                    const selected = ui?.config?.themePreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={!ui?.canEdit || ui?.saveState === "saving"}
                        onClick={() => ui?.applyPreset?.(preset)}
                        className={cn(
                          "rounded-xl border p-3 text-left transition disabled:opacity-45",
                          selected ? "border-primary/50 bg-primary/10" : "border-border/40 bg-card/25 hover:border-border"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="h-4 w-4 rounded-full ring-2 ring-white/10" style={{ backgroundColor: preset.swatch }} />
                          <span className="text-xs font-extrabold">{preset.name}</span>
                          {selected && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                        </div>
                        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{preset.desc}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/20 px-4 py-3">
                  <div>
                    <p className="text-xs font-bold">Configuração da interface</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {ui?.saveState === "saving" ? "Salvando alterações..." : ui?.saveState === "saved" ? "Alterações salvas." : "As mudanças ficam vinculadas à sua conta Nitro."}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" disabled={!ui?.canEdit || ui?.saveState === "saving"} onClick={() => ui?.resetAll?.()}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restaurar interface
                  </Button>
                </div>
              </section>
              )
            )}

            {studioTab === "audio" && (
              <section className="rounded-2xl border border-border/35 bg-background/25 p-4 md:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <BellRing className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-heading text-sm font-bold">{t("nitro.sounds")}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t("nitro.sounds_hint")}</p>
                    </div>
                  </div>
                  <ResetBtn
                    onClick={() => save({ sounds: { notify: true, call: true } })}
                    disabled={soundsDefault}
                  />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/25 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">{t("nitro.sound_notify")}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Alertas e atividades do Nébula</p>
                    </div>
                    <Switch
                      checked={!!sounds.notify}
                      disabled={!active || saving}
                      onCheckedChange={(value) => save({ sounds: { ...sounds, notify: value } })}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/25 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">{t("nitro.sound_call")}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Entrada, saída e chamadas</p>
                    </div>
                    <Switch
                      checked={!!sounds.call}
                      disabled={!active || saving}
                      onCheckedChange={(value) => save({ sounds: { ...sounds, call: value } })}
                    />
                  </div>
                </div>
              </section>
            )}
          </div>
        </section>

        <NitroHistory requests={requests || []} />

        <MixerPromoCard />
      </div>
    </PageShell>
  );
}
