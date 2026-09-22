import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import ProfileAvatar from "@/components/ProfileAvatar";
import PageShell from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import ReportUserDialog from "@/components/users/ReportUserDialog";
import { isModerator } from "@/lib/roles";
import { BadgeCheck, Flag, Loader2, MessageCircle, Monitor, ShieldCheck } from "lucide-react";
import CopyIdButton from "@/components/CopyIdButton";
import NitroBadgeRow from "@/components/nitro/NitroBadgeRow";
import { useI18n } from "@/lib/i18n";

export default function UserProfile() {
  const { t, locale } = useI18n();
  const { id } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [screeningBusy, setScreeningBusy] = useState(false);
  const [screeningNotice, setScreeningNotice] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("userDirectory", { action: "profile", user_id: id, request_nonce: Date.now() });
      setProfile(res.data?.profile || null);
    } catch (e) {
      setError(e?.response?.data?.error || t("profile.load_error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (!profile) return <PageShell label={t("profile.label")} title={t("profile.unavailable")} subtitle={error || t("profile.load_error")} />;

  const requestScreening = async () => {
    if (!profile?.id || screeningBusy || !isModerator(user)) return;
    const reason = window.prompt(t("profile.screening_reason_prompt"), profile.report_summary?.open > 0 ? t("profile.open_reports_reason", { count: profile.report_summary.open }) : t("profile.screening_default_reason"));
    if (reason === null) return;
    if (!window.confirm(t("profile.screening_confirm", { name: profile.name }))) return;
    setScreeningBusy(true);
    setScreeningNotice("");
    try {
      await base44.functions.invoke("requestScreening", { user_id: profile.id, reason: reason.trim() });
      setScreeningNotice(t("profile.screening_sent"));
    } catch (e) {
      setScreeningNotice(e?.response?.data?.error || t("profile.screening_error"));
    } finally {
      setScreeningBusy(false);
    }
  };

  const own = user?.id === profile.id;
  return (
    <PageShell className="mx-auto max-w-5xl" label={t("profile.label")} title={profile.name} subtitle={profile.username ? `@${profile.username}` : t("profile.nebula_user", { role: profile.role })}>
      <div
        className="overflow-hidden rounded-3xl border border-border/40 bg-card/50 shadow-[0_28px_90px_-45px_rgba(0,0,0,0.95)]"
        style={{
          borderColor: profile.accent ? `${profile.accent}55` : undefined,
          boxShadow: profile.accent ? `0 28px 90px -45px ${profile.accent}66` : undefined,
        }}
      >
        <div
          className="relative h-44 bg-gradient-to-br from-primary/35 via-card to-background md:h-60"
          style={profile.accent || profile.accent_2 ? { background: `linear-gradient(135deg, ${profile.accent || "#111827"}55, ${profile.accent_2 || profile.accent || "#111827"}22)` } : undefined}
        >
          {profile.banner_url && <img src={profile.banner_url} alt="Banner do perfil" className="absolute inset-0 h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
        </div>
        <div className="relative px-5 pb-6 md:px-8">
          <div className="-mt-14 flex flex-wrap items-end gap-4">
            <ProfileAvatar name={profile.name} avatar={profile.avatar_url} status={profile.status} frame={profile.frame} customFrameUrl={profile.custom_frame_url} size="xl" />
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-heading text-2xl font-extrabold text-foreground md:text-3xl">{profile.name}</h1>
                {profile.custom_tag && <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">{profile.custom_tag}</span>}
                {profile.discord_connected && <span title={t("profile.discord_connected")} className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400"><ShieldCheck className="h-3 w-3" />Discord</span>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{profile.username ? `@${profile.username}` : profile.id}</p>
              <NitroBadgeRow badges={profile.nitro_badges} role={profile.role} nitroActive={profile.nitro_active} compact className="mt-2" />
              {(profile.nitro_status_text || profile.custom_status) && (
                <div className="mt-2 inline-flex max-w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-foreground/90">
                  <span className="truncate">{profile.nitro_status_text || profile.custom_status}</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pb-1">
              {!own && <Button asChild size="sm" className="rounded-full"><Link to={`/mensagens?user=${profile.id}`}><MessageCircle className="mr-1.5 h-3.5 w-3.5" />{t("profile.message")}</Link></Button>}
              {!own && <Button variant="outline" size="sm" className="rounded-full" onClick={() => setReportOpen(true)}><Flag className="mr-1.5 h-3.5 w-3.5" />{t("profile.report")}</Button>}
              {isModerator(user) && !own && <Button variant="outline" size="sm" className="rounded-full border-orange-500/40 text-orange-300" onClick={requestScreening} disabled={screeningBusy}>{screeningBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Monitor className="mr-1.5 h-3.5 w-3.5" />}{t("profile.request_screening")}</Button>}
            </div>
          </div>

          {screeningNotice && <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">{screeningNotice}</p>}
          {profile.bio && <p className="mt-5 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{profile.bio}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full px-3 py-1 text-xs font-bold uppercase" style={{ background: profile.accent ? `${profile.accent}18` : undefined, color: profile.accent || undefined }}>{profile.role}</span>
            {(profile.badges || []).map((badge) => <span key={badge} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-semibold"><BadgeCheck className="h-3 w-3" />{badge}</span>)}
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-3">
            <InfoCard label={t("profile.user_id")} value={profile.id} copy />
            <InfoCard label={t("profile.account")} value={profile.created_date ? new Date(profile.created_date).toLocaleDateString(locale) : t("profile.date_unavailable")} />
            <InfoCard label="Discord" value={profile.discord_connected ? t("profile.connected") : t("profile.not_connected")} />
          </div>

          {profile.internal_id && (
            <section className="mt-7 rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="font-heading text-sm font-bold">{t("profile.admin_info")}</h2></div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <AdminField label={t("profile.internal_id")} value={profile.internal_id} />
                <AdminField label="Discord ID" value={profile.discord?.id || (profile.discord?.connected ? t("profile.hidden_for_role") : t("profile.not_connected"))} copy={!!profile.discord?.id} />
                <AdminField label={t("profile.reports")} value={profile.report_summary ? `${profile.report_summary.total} · ${profile.report_summary.open}` : "—"} />
                <AdminField label={t("profile.verification")} value={profile.verification?.status || t("profile.not_required")} />
              </div>
            </section>
          )}
        </div>
      </div>

      <ReportUserDialog open={reportOpen} onOpenChange={setReportOpen} target={profile} />
    </PageShell>
  );
}

function InfoCard({ label, value, copy = false }) {
  return <div className="flex items-center gap-2 rounded-2xl border border-border/40 bg-secondary/35 p-4"><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</p><p className="mt-2 truncate text-sm font-bold">{value}</p></div>{copy && <CopyIdButton value={value} label={label} />}</div>;
}

function AdminField({ label, value, copy = true }) {
  return <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/60 px-3 py-2.5"><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="truncate font-mono text-xs">{value}</p></div>{copy && value && <CopyIdButton value={value} label={label} />}</div>;
}