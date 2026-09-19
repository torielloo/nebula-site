import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import UserPicker from "@/components/users/UserPicker";
import ProfileAvatar from "@/components/ProfileAvatar";
import { Button } from "@/components/ui/button";
import { ExternalLink, Flag, Loader2, Monitor, RefreshCw, Search, ShieldAlert, ShieldCheck, UserRoundSearch } from "lucide-react";
import CopyIdButton from "@/components/CopyIdButton";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { isModerator } from "@/lib/roles";

const ACTIVE = new Set(["requested", "awaiting_user", "scheduled", "in_review", "awaiting_staff"]);
const LABEL = {
  requested: "usermod.status.requested",
  awaiting_user: "usermod.status.awaiting_user",
  scheduled: "usermod.status.scheduled",
  in_review: "usermod.status.in_review",
  awaiting_staff: "usermod.status.awaiting_staff",
  approved: "usermod.status.approved",
  rejected: "usermod.status.rejected",
  cancelled: "usermod.status.cancelled",
};

export default function UserModerationTab() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canRequestScreening = isModerator(user);
  const labelStatus = (status) => LABEL[status] ? t(LABEL[status]) : status;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [cases, setCases] = useState([]);
  const [casesBusy, setCasesBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState("");
  const [message, setMessage] = useState("");

  const loadCases = async () => {
    setCasesBusy(true);
    try {
      const res = await base44.functions.invoke("manageVerification", { action: "list", limit: 100 });
      setCases(res.data?.cases || []);
    } catch {
      setCases([]);
    } finally {
      setCasesBusy(false);
    }
  };

  useEffect(() => { loadCases(); }, []);

  const choose = async (item) => {
    setSelected(item);
    setQuery(item.name || item.username || item.id);
    setProfileBusy(true);
    setMessage("");
    try {
      const res = await base44.functions.invoke("userDirectory", { action: "profile", user_id: item.id });
      setProfile(res.data?.profile || null);
    } catch (e) {
      setProfile(null);
      setMessage(e?.response?.data?.error || t("usermod.profile_error"));
    } finally {
      setProfileBusy(false);
    }
  };

  const updateCase = async (item, status) => {
    if (actionBusy) return;
    const resolution = window.prompt(t("usermod.prompt", { id: item.protocol || item.id, status: labelStatus(status) }), "");
    if (resolution === null) return;
    setActionBusy(item.id);
    setMessage("");
    try {
      await base44.functions.invoke("manageVerification", { action: "update", case_id: item.id, status, resolution });
      setMessage(t("usermod.case_updated", { id: item.protocol || item.id, status: labelStatus(status) }));
      await loadCases();
      if (profile?.id === item.user_id) await choose({ id: item.user_id, name: profile.name });
    } catch (e) {
      setMessage(e?.response?.data?.error || t("usermod.case_error"));
    } finally {
      setActionBusy("");
    }
  };

  const requestScreening = async () => {
    if (!profile?.id || actionBusy || !canRequestScreening) return;
    const reason = window.prompt("Motivo da solicitação de telagem (opcional, será enviado ao usuário):", profile.report_summary?.open > 0 ? `${profile.report_summary.open} denúncia(s) em aberto para revisão.` : "Verificação preventiva de segurança.");
    if (reason === null) return;
    if (!window.confirm(`Enviar uma solicitação de telagem para ${profile.name}? A mensagem informará prazo de 5 minutos para entrar no Discord/call de aguardando telagem.`)) return;
    setActionBusy(`screening:${profile.id}`);
    setMessage("");
    try {
      await base44.functions.invoke("requestScreening", { user_id: profile.id, reason: reason.trim() });
      setMessage(`Solicitação de telagem enviada para ${profile.name}. O usuário recebeu as instruções e o prazo de 5 minutos no privado.`);
    } catch (e) {
      setMessage(e?.response?.data?.error || "Não foi possível enviar a solicitação de telagem.");
    } finally {
      setActionBusy("");
    }
  };

  const activeCases = useMemo(() => cases.filter((item) => ACTIVE.has(item.status)), [cases]);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-br from-primary/10 via-card/70 to-card/45 p-5 md:p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex min-w-0 flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-primary"><UserRoundSearch className="h-4 w-4" /><span className="text-[10px] font-extrabold uppercase tracking-[0.22em]">{t("usermod.kicker")}</span></div>
            <h2 className="mt-2 font-heading text-xl font-extrabold md:text-2xl">{t("usermod.title")}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("usermod.desc")}</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
            <Metric label={t("usermod.active")} value={activeCases.length} />
            <Metric label={t("usermod.registered")} value={cases.length} />
          </div>
        </div>
        <div className="relative mt-5 max-w-2xl">
          <UserPicker
            value={query}
            onChange={(v) => { setQuery(v); if (!v) { setSelected(null); setProfile(null); } }}
            onSelect={choose}
            placeholder={t("usermod.search")}
            searchContext={{ type: "admin" }}
            autoSelectNumeric
          />
        </div>
      </section>

      {message && <p role="status" className="rounded-2xl border border-border/40 bg-secondary/40 p-3 text-sm font-semibold">{message}</p>}

      {(selected || profileBusy) && (
        <section className="min-w-0 overflow-hidden rounded-3xl border border-border/40 bg-card/55 p-4 sm:p-5 md:p-6">
          {profileBusy ? <div className="grid min-h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : profile ? (
            <div>
              <div className="relative mb-4 h-28 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/30 via-card to-background sm:h-36">
                {profile.banner_url && <img src={profile.banner_url} alt={`Banner de ${profile.name}`} className="absolute inset-0 h-full w-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <ProfileAvatar name={profile.name} avatar={profile.avatar_url} size="lg" status={profile.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-heading text-xl font-extrabold">{profile.name}</h3><span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase text-primary">{profile.role}</span></div>
                  <p className="mt-1 text-xs text-muted-foreground">{profile.username ? `@${profile.username}` : t("usermod.no_public_username")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm" className="rounded-full"><Link to={`/user/${profile.id}`}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />{t("usermod.open_profile")}</Link></Button>
                  {canRequestScreening && (
                    <Button size="sm" variant="outline" className="rounded-full border-amber-500/30 text-amber-300 hover:bg-amber-500/10" onClick={requestScreening} disabled={!!actionBusy}>
                      {actionBusy === `screening:${profile.id}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Monitor className="mr-1.5 h-3.5 w-3.5" />}
                      Solicitar telagem
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <AdminValue label={t("usermod.internal_id")} value={profile.internal_id || profile.id} copy />
                <AdminValue label="Discord" value={profile.discord?.connected ? (profile.discord.username || t("usermod.connected")) : t("usermod.not_connected")} />
                <AdminValue label="@ Discord" value={profile.discord?.handle || (profile.discord?.connected ? "—" : t("usermod.not_connected"))} />
                <AdminValue label="Discord ID" value={profile.discord?.id || (profile.discord?.connected ? t("usermod.no_permission") : "—")} copy={!!profile.discord?.id} />
                <AdminValue label={t("usermod.verification")} value={profile.verification?.status ? labelStatus(profile.verification.status) : t("usermod.not_required")} />
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <AdminValue label={t("usermod.reports_total")} value={profile.report_summary?.total ?? 0} icon={Flag} />
                <AdminValue label={t("usermod.reports_open")} value={profile.report_summary?.open ?? 0} icon={ShieldAlert} />
                <AdminValue label={t("usermod.confirmed")} value={profile.report_summary?.confirmed ?? 0} icon={ShieldCheck} />
              </div>
            </div>
          ) : null}
        </section>
      )}

      <section className="min-w-0 overflow-hidden rounded-3xl border border-border/40 bg-card/55 p-4 sm:p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="font-heading text-base font-bold">{t("usermod.queue")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("usermod.audit_hint")}</p></div>
          <Button variant="outline" size="sm" onClick={loadCases} disabled={casesBusy} className="rounded-full">{casesBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</Button>
        </div>
        <div className="mt-4 space-y-2">
          {casesBusy ? <div className="grid min-h-24 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : activeCases.length === 0 ? <p className="rounded-2xl border border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">{t("usermod.none")}</p> : activeCases.map((item) => (
            <div key={item.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-border/40 bg-secondary/25 p-3 sm:p-4">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/10 text-amber-400"><ShieldAlert className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs font-bold">{item.protocol || item.id}</p><span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold">{labelStatus(item.status)}</span></div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{t("usermod.user_requested", { user: item.user_id, staff: item.created_by_name || item.created_by || "Staff" })}</p>
              </div>
              <div className="grid w-full grid-cols-1 gap-1.5 sm:w-auto sm:grid-cols-2 lg:flex lg:flex-wrap">
                <Button asChild variant="ghost" size="sm"><Link to={`/user/${item.user_id}`}><Search className="mr-1 h-3.5 w-3.5" />{t("usermod.open")}</Link></Button>
                <Button variant="outline" size="sm" disabled={!!actionBusy} onClick={() => updateCase(item, "in_review")}>{t("usermod.analyze")}</Button>
                <Button variant="outline" size="sm" disabled={!!actionBusy} onClick={() => updateCase(item, "approved")} className="border-emerald-500/30 text-emerald-400">{t("usermod.approve")}</Button>
                <Button variant="outline" size="sm" disabled={!!actionBusy} onClick={() => updateCase(item, "rejected")} className="border-destructive/30 text-destructive">{t("usermod.reject")}</Button>
                <Button variant="ghost" size="sm" disabled={!!actionBusy} onClick={() => updateCase(item, "cancelled")}>{t("usermod.cancel")}</Button>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}

function Metric({ label, value }) {
  return <div className="min-w-24 rounded-2xl border border-border/40 bg-background/35 px-3 py-2 text-right"><p className="font-display text-xl font-extrabold">{value}</p><p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p></div>;
}

function AdminValue({ label, value, copy = false, icon: Icon }) {
  const { t } = useI18n();
  return <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-border/40 bg-secondary/30 p-3">{Icon && <Icon className="h-4 w-4 shrink-0 text-primary" />}<div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 truncate text-xs font-semibold">{String(value ?? "—")}</p></div>{copy && value && <CopyIdButton value={value} label={label} />}</div>;
}