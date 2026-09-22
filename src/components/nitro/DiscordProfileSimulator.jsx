import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Check, Clipboard, Code2, Gem, HeartHandshake, Loader2, LockKeyhole, Save, ShieldCheck, Upload, UsersRound } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import ProfileAvatar from "@/components/ProfileAvatar";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { hasRole } from "@/lib/roles";

const BADGES = [
  { id: "hypesquad", label: "HypeSquad", Icon: ShieldCheck, cls: "text-fuchsia-300 bg-fuchsia-500/15 border-fuchsia-400/25" },
  { id: "booster", label: "Booster", Icon: Gem, cls: "text-pink-300 bg-pink-500/15 border-pink-400/25" },
  { id: "developer", label: "Active Developer", Icon: Code2, cls: "text-cyan-300 bg-cyan-500/15 border-cyan-400/25" },
  { id: "supporter", label: "Early Supporter", Icon: HeartHandshake, cls: "text-amber-300 bg-amber-500/15 border-amber-400/25" },
  { id: "staff", label: "Nébula Staff", Icon: UsersRound, cls: "text-emerald-300 bg-emerald-500/15 border-emerald-400/25" },
];

const MAX_AVATAR = 8 * 1024 * 1024;
const MAX_BANNER = 20 * 1024 * 1024;
const MAX_PRONOUNS = 20;
const MAX_STATUS = 40;

function safeObjectUrl(file) {
  return file ? URL.createObjectURL(file) : "";
}

function normalizeMultilineText(value) {
  return String(value || "").replace(/\\n/g, "\n");
}

export default function DiscordProfileSimulator({ user, profile, active, saving, save, name }) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(profile.display_name || name || "Você");
  const discordHandle = String(profile.discord_handle || profile.discord_username || "usuario").replace(/^@/, "").slice(0, 32);
  const [pronouns, setPronouns] = useState((profile.nitro_pronouns || "").slice(0, MAX_PRONOUNS));
  const [statusText, setStatusText] = useState((profile.nitro_status_text || "Explorando o Nébula").slice(0, MAX_STATUS));
  const [about, setAbout] = useState(normalizeMultilineText(profile.nitro_about || profile.bio || ""));
  const [primary, setPrimary] = useState(profile.accent || "#5865F2");
  const [secondary, setSecondary] = useState(profile.accent_2 || "#EB459E");
  const [badges, setBadges] = useState(() => new Set(Array.isArray(profile.nitro_badges) ? profile.nitro_badges : []));
  const [avatarFile, setAvatarFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url || "");
  const [bannerPreview, setBannerPreview] = useState(profile.banner_url || "");
  const [frame, setFrame] = useState(profile.frame || "plasma");
  const [copyDone, setCopyDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(profile.avatar_url || "");
      return undefined;
    }
    const url = safeObjectUrl(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile, profile.avatar_url]);

  useEffect(() => {
    if (!bannerFile) {
      setBannerPreview(profile.banner_url || "");
      return undefined;
    }
    const url = safeObjectUrl(bannerFile);
    setBannerPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [bannerFile, profile.banner_url]);

  const data = useMemo(() => ({
    displayName: displayName.trim().slice(0, 64),
    handle: discordHandle,
    pronouns: pronouns.trim().slice(0, MAX_PRONOUNS),
    statusText: statusText.trim().slice(0, MAX_STATUS),
    about: about.slice(0, 300),
    primary,
    secondary,
    badges: [...badges],
    frame,
  }), [displayName, discordHandle, pronouns, statusText, about, primary, secondary, badges, frame]);

  const badgePermission = (id) => {
    if (id === "developer") return { allowed: hasRole(user, "dev"), requirement: "DEV ou superior" };
    if (id === "supporter") return { allowed: active === true, requirement: "Nitro ativo" };
    if (id === "staff") return { allowed: hasRole(user, "support"), requirement: "Membro da equipe Nébula" };
    if (id === "booster") return { allowed: active === true, requirement: "Nitro ativo" };
    if (id === "hypesquad") return { allowed: hasRole(user, "moderator"), requirement: "Staff/Moderador ou superior" };
    return { allowed: false, requirement: "Sem permissão" };
  };

  useEffect(() => {
    const persisted = Array.isArray(profile.nitro_badges) ? profile.nitro_badges : [];
    setBadges(new Set(persisted.filter((id) => badgePermission(id).allowed)));
  }, [profile.nitro_badges, user?.role, active]);

  useEffect(() => {
    setFrame(profile.frame || "");
  }, [profile.frame]);

  useEffect(() => {
    if (profile.accent) setPrimary(profile.accent);
    if (profile.accent_2) setSecondary(profile.accent_2);
  }, [profile.accent, profile.accent_2]);

  const toggleBadge = (id) => {
    if (!badgePermission(id).allowed) return;
    setBadges((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pickAvatar = (file) => {
    setError("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      setError("Avatar: use PNG, JPG, WEBP ou GIF.");
      return;
    }
    if (file.size > MAX_AVATAR) {
      setError("Avatar: máximo de 8 MB.");
      return;
    }
    setAvatarFile(file);
  };

  const pickBanner = (file) => {
    setError("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm"].includes(file.type)) {
      setError("Banner: use PNG, JPG, WEBP, GIF, MP4 ou WEBM.");
      return;
    }
    if (file.size > MAX_BANNER) {
      setError("Banner: máximo de 20 MB.");
      return;
    }
    setBannerFile(file);
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 1600);
    } catch {
      setError("Não foi possível copiar as configurações.");
    }
  };

  const applyProfile = async () => {
    if (!active || busy || saving) return;
    setBusy(true);
    setError("");
    try {
      let avatarUrl = profile.avatar_url || "";
      let bannerUrl = profile.banner_url || "";

      if (avatarFile) {
        const uploaded = await base44.integrations.Core.UploadPublicFile({ file: avatarFile });
        if (!uploaded?.file_url) throw new Error("Falha ao enviar o avatar.");
        avatarUrl = uploaded.file_url;
      }
      if (bannerFile) {
        const uploaded = await base44.integrations.Core.UploadPublicFile({ file: bannerFile });
        if (!uploaded?.file_url) throw new Error("Falha ao enviar o banner.");
        bannerUrl = uploaded.file_url;
      }

      const ok = await save({
        display_name: data.displayName,
        avatar_url: avatarUrl,
        banner_url: bannerUrl,
        frame,
        nitro_pronouns: data.pronouns,
        nitro_status_text: data.statusText,
        nitro_about: data.about,
        nitro_badges: data.badges.filter((badge) => badge !== "staff"),
        accent: data.primary,
        accent_2: data.secondary,
        accent_source: "profile",
      });
      if (!ok) throw new Error("Não foi possível aplicar a personalização.");
    } catch (err) {
      setError(err?.message || "Falha ao aplicar o perfil.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="simulador-perfil" className="scroll-mt-24 overflow-hidden rounded-3xl border border-border/40 bg-card/35">
      <div className="border-b border-border/35 p-5 md:p-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Live Profile Sandbox</p>
          <h2 className="mt-1 font-heading text-xl font-extrabold">Simulador de perfil em tempo real</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Teste avatar, banner, cores, bio e molduras antes de aplicar ao Nébula. As badges de prévia respeitam seu cargo e seu status Nitro.
          </p>
        </div>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)] md:p-6">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[11px] font-bold text-muted-foreground">Nome</span>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value.slice(0, 64))} />
            </label>
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-muted-foreground">{t("nitro.profile.discord_handle")}</span>
              <div className="flex h-10 items-center rounded-md border border-border/50 bg-background/25 px-3 text-sm font-semibold text-muted-foreground">
                @{discordHandle}
              </div>
              <p className="text-[10px] leading-4 text-muted-foreground">{t("nitro.profile.discord_handle_hint")}</p>
            </div>
            <label className="space-y-1.5">
              <span className="flex items-center justify-between gap-2 text-[11px] font-bold text-muted-foreground"><span>Pronomes</span><span>{pronouns.length}/{MAX_PRONOUNS}</span></span>
              <Input maxLength={MAX_PRONOUNS} value={pronouns} onChange={(e) => setPronouns(e.target.value.slice(0, MAX_PRONOUNS))} placeholder="ele/dele" />
            </label>
            <label className="space-y-1.5">
              <span className="flex items-center justify-between gap-2 text-[11px] font-bold text-muted-foreground"><span>Status personalizado</span><span>{statusText.length}/{MAX_STATUS}</span></span>
              <Input maxLength={MAX_STATUS} value={statusText} onChange={(e) => setStatusText(e.target.value.slice(0, MAX_STATUS))} />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="rounded-2xl border border-border/40 bg-background/30 p-3">
              <span className="text-[11px] font-bold text-muted-foreground">Avatar / GIF</span>
              <span className="mt-2 flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 text-xs font-bold hover:border-primary/40">
                <Upload className="h-4 w-4" /> Escolher avatar
                <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickAvatar(f); }} />
              </span>
            </label>
            <label className="rounded-2xl border border-border/40 bg-background/30 p-3">
              <span className="text-[11px] font-bold text-muted-foreground">Banner / GIF / vídeo</span>
              <span className="mt-2 flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 text-xs font-bold hover:border-primary/40">
                <Upload className="h-4 w-4" /> Escolher banner
                <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickBanner(f); }} />
              </span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="rounded-2xl border border-border/40 bg-background/30 p-3">
              <span className="text-[11px] font-bold text-muted-foreground">Cor principal</span>
              <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-border/40 bg-transparent p-1" />
            </label>
            <label className="rounded-2xl border border-border/40 bg-background/30 p-3">
              <span className="text-[11px] font-bold text-muted-foreground">Cor secundária</span>
              <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-border/40 bg-transparent p-1" />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold text-muted-foreground">Sobre mim · Markdown básico</span>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value.slice(0, 300))}
              rows={5}
              className="w-full resize-y rounded-2xl border border-border/50 bg-background/35 px-3 py-2 text-sm outline-none focus:border-primary/50"
              placeholder={"**Sobre mim**\nAdicione links e formatação."}
            />
            <span className="block text-right text-[10px] text-muted-foreground">{about.length}/300</span>
          </label>

          <div className="rounded-2xl border border-border/40 bg-background/30 p-4">
            <p className="text-xs font-extrabold">Badges de prévia</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {BADGES.map(({ id, label, Icon, cls }) => {
                const permission = badgePermission(id);
                return (
                  <div key={id} className={cn("flex items-center justify-between gap-3 rounded-xl border px-3 py-2", permission.allowed ? "border-border/35" : "border-border/20 opacity-60")}>
                    <span className="flex min-w-0 items-center gap-2 text-xs font-semibold">
                      <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border", cls)}><Icon className="h-3.5 w-3.5" /></span>
                      <span className="min-w-0"><span className="block truncate">{label}</span>{!permission.allowed && <span className="mt-0.5 flex items-center gap-1 text-[9px] font-medium text-muted-foreground"><LockKeyhole className="h-2.5 w-2.5" />{permission.requirement}</span>}</span>
                    </span>
                    <Switch disabled={!permission.allowed || id === "staff"} checked={id === "staff" ? permission.allowed : (permission.allowed && badges.has(id))} onCheckedChange={() => toggleBadge(id)} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={copyJson}>
              {copyDone ? <Check className="mr-2 h-4 w-4" /> : <Clipboard className="mr-2 h-4 w-4" />}
              {copyDone ? "Copiado" : "Exportar configurações"}
            </Button>
            <Button type="button" disabled={!active || busy || saving} onClick={() => void applyProfile()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Aplicar no Nébula
            </Button>
          </div>
          {error && <p className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-3 py-2 text-xs font-semibold text-red-300">{error}</p>}
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <div
            className="overflow-hidden rounded-[26px] border border-white/10 shadow-[0_30px_90px_-35px_rgba(0,0,0,0.95)]"
            style={{ background: `linear-gradient(155deg, ${primary}33, #111214 45%, ${secondary}22)` }}
          >
            <div className="relative h-[152px] bg-[#232428]">
              {bannerPreview && (
                bannerFile?.type?.startsWith("video/") ? (
                  <video src={bannerPreview} autoPlay loop muted playsInline className="h-full w-full object-cover" />
                ) : (
                  <img src={bannerPreview} alt="Preview do banner" className="h-full w-full object-cover" />
                )
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
            </div>
            <div className="relative px-5 pb-5">
              <div className="-mt-11 flex items-end justify-between">
                <ProfileAvatar name={displayName} avatar={avatarPreview} size="xl" frame={frame} customFrameUrl={profile.custom_frame_url} />
                <span className="mb-2 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] font-bold text-white/70">PREVIEW</span>
              </div>

              <div className="mt-3 rounded-2xl bg-black/35 p-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-black text-white">{displayName || "Seu nome"}</h3>
                  {profile.custom_tag && <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white/80">{profile.custom_tag}</span>}
                </div>
                <p className="mt-0.5 text-xs font-semibold text-white/65">@{discordHandle}</p>
                {pronouns && <p className="mt-2 text-xs text-white/55">{pronouns}</p>}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[...badges, ...(hasRole(user, "support") ? ["staff"] : [])].filter((badge, index, all) => all.indexOf(badge) === index).map((badge) => {
                    const meta = BADGES.find((item) => item.id === badge);
                    if (!meta) return null;
                    const Icon = meta.Icon;
                    return (
                      <span key={badge} className={cn("grid h-7 w-7 place-items-center rounded-full border", meta.cls)} title={meta.label}>
                        <Icon className="h-4 w-4" />
                      </span>
                    );
                  })}
                </div>

                {statusText && (
                  <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/75">
                    {statusText}
                  </div>
                )}

                <div className="mt-4 border-t border-white/10 pt-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">Sobre mim</p>
                  <div className={cn("prose prose-invert mt-2 max-w-none text-xs leading-5 text-white/75", "[&_a]:text-cyan-300 [&_p]:my-1 [&_strong]:text-white")}>
                    <ReactMarkdown>{about || "Adicione uma bio para visualizar."}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
