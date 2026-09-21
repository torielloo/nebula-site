import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RefreshCw, ShieldAlert, Ban, CheckCircle2, Download, Bot, Sparkles, Settings2, UserX, EyeOff, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import CoreOS from "@/pages/CoreOS";
import { useI18n } from "@/lib/i18n";

const severityStyles = {
  low: "text-slate-300 bg-slate-400/10",
  medium: "text-amber-300 bg-amber-400/10",
  high: "text-orange-300 bg-orange-400/10",
  critical: "text-red-200 bg-red-500/15",
};

function groupSecurityEvents(events = []) {
  const groups = new Map();
  for (const event of events) {
    const decision = event.owner_decision || (event.reviewed ? "reviewed" : "pending");
    const key = [
      event.reason || event.category || "evento",
      event.route || "",
      event.severity || "low",
      decision,
    ].join("|");
    const existing = groups.get(key);
    const time = new Date(event.occurred_at || event.created_date || 0).getTime() || 0;
    if (!existing) {
      groups.set(key, {
        ...event,
        groupKey: key,
        members: [event],
        groupCount: 1,
        latestTime: time,
        maxRisk: Number(event.risk_score || 0),
        fingerprints: new Set(event.request_fingerprint ? [event.request_fingerprint] : []),
      });
      continue;
    }
    existing.members.push(event);
    existing.groupCount += 1;
    existing.maxRisk = Math.max(existing.maxRisk, Number(event.risk_score || 0));
    if (event.request_fingerprint) existing.fingerprints.add(event.request_fingerprint);
    if (time > existing.latestTime) {
      const members = existing.members;
      const groupCount = existing.groupCount;
      const maxRisk = existing.maxRisk;
      const fingerprints = existing.fingerprints;
      Object.assign(existing, event, { groupKey: key, members, groupCount, maxRisk, fingerprints, latestTime: time });
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      uniqueFingerprints: group.fingerprints.size,
      members: [...group.members].sort((a, b) =>
        new Date(b.occurred_at || b.created_date || 0).getTime() -
        new Date(a.occurred_at || a.created_date || 0).getTime()
      ),
    }))
    .sort((a, b) => b.latestTime - a.latestTime);
}

export default function SecurityCenter({ ownerAI = false }) {
  const { t, locale } = useI18n();
  const [searchParams] = useSearchParams();
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [promptIncidents, setPromptIncidents] = useState([]);
  const [duration, setDuration] = useState("24");
  const [customMessage, setCustomMessage] = useState(() => t("security.default_message"));
  const [expandedEventGroups, setExpandedEventGroups] = useState(() => new Set());

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [res, incidents] = await Promise.all([
        base44.functions.invoke("securityReport", { action: "summary" }),
        base44.entities.PromptInjectionIncident.list("-last_seen_at", 80).catch(() => []),
      ]);
      setReport(res.data || res);
      setPromptIncidents((incidents || []).filter((item) => item.status !== "ignored"));
    } catch (err) {
      try {
        const [events, blocks, policies, incidents] = await Promise.all([
          base44.entities.SecurityEvent.list("-occurred_at", 400),
          base44.entities.SecurityBlock.list("-created_date", 150),
          base44.entities.SecurityResponsePolicy.list("-created_date", 150),
          base44.entities.PromptInjectionIncident.list("-last_seen_at", 80).catch(() => []),
        ]);
        const since = Date.now() - 24 * 60 * 60 * 1000;
        const visibleEvents = (events || []).filter((event) => (event.owner_decision || (event.reviewed ? "reviewed" : "pending")) !== "ignored");
        const recent = visibleEvents.filter((event) => new Date(event.occurred_at || event.created_date || 0).getTime() >= since);
        const activeBlocks = (blocks || []).filter((block) => block.active !== false && (!block.expires_at || new Date(block.expires_at).getTime() > Date.now()));
        setReport({
          generated_at: new Date().toISOString(),
          summary: {
            events_24h: recent.length,
            blocked_24h: recent.filter((event) => event.action === "blocked").length,
            critical_unreviewed: visibleEvents.filter((event) => event.severity === "critical" && !event.reviewed).length,
            pending_decisions: visibleEvents.filter((event) => !event.reviewed && (event.owner_decision || "pending") === "pending").length,
            active_blocks: activeBlocks.length,
          },
          events: visibleEvents,
          blocks: blocks || [],
          policies: policies || [],
          fallback: true,
        });
        setPromptIncidents((incidents || []).filter((item) => item.status !== "ignored"));
        setError("Relatório carregado pelo modo de contingência porque o endpoint principal não respondeu.");
      } catch {
        setError(err?.response?.status === 404 ? t("security.report_404") : err?.response?.status === 403 ? t("security.report_403") : t("security.load_error"));
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!report?.events?.length || selectedEvent) return;
    const requested = searchParams.get("event");
    if (!requested) return;
    const found = report.events.find((event) => event.event_id === requested || event.id === requested);
    if (found) {
      setSelectedEvent(found);
      setCustomMessage(t("security.default_message"));
      window.setTimeout(() => document.getElementById("security-response-panel")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    }
  }, [report, searchParams, selectedEvent]);

  const runAction = async (payload, confirmText = "") => {
    if (confirmText && !window.confirm(confirmText)) return false;
    setBusy(true);
    setError("");
    try {
      await base44.functions.invoke("securityReport", payload);
      setSelectedEvent(null);
      await load();
      return true;
    } catch (err) {
      setError(err?.response?.data?.error || t("security.action_error"));
      setBusy(false);
      return false;
    }
  };

  const reviewPromptIncident = async (incident, status) => {
    if (!incident?.id) return;
    setBusy(true);
    setError("");
    try {
      await base44.entities.PromptInjectionIncident.update(incident.id, {
        status,
        review_notes: status === "ignored" ? "Revisado e ignorado manualmente." : "Revisado manualmente pela equipe autorizada.",
        reviewed_by: "security-center",
      });
      await load();
    } catch (err) {
      setError(err?.message || t("security.action_error"));
      setBusy(false);
    }
  };

  const configureIncidentEvent = (incident) => {
    const related = (report?.events || []).find((event) => event.event_id === incident?.incident_id);
    if (related) configure(related);
    else setError("O evento técnico relacionado não está mais na janela atual do relatório. O incidente especializado continua salvo para revisão.");
  };

  const configure = (event) => {
    setSelectedEvent(event);
    setDuration("24");
    setCustomMessage(t("security.default_message"));
    window.setTimeout(() => document.getElementById("security-response-panel")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const permanent = duration === "permanent";
  const hours = permanent ? 0 : Number(duration) || 24;

  const exportReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nebula-security-report-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeBlocks = useMemo(() => (report?.blocks || []).filter((block) => block.active !== false && (!block.expires_at || new Date(block.expires_at).getTime() > Date.now())), [report]);
  const groupedEvents = useMemo(() => groupSecurityEvents(report?.events || []), [report?.events]);

  const toggleEventGroup = (key) => {
    setExpandedEventGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (busy && !report) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!report) return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white"><span>{error || t("security.not_loaded")}</span><Button onClick={load} variant="outline" disabled={busy}>{t("security.retry")}</Button></div>;

  const summary = report.summary || {};
  return (
    <div className="space-y-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold">{t("security.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("security.subtitle")}</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
          <Button variant="outline" onClick={load} disabled={busy}><RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />{t("security.refresh")}</Button>
          <Button variant="outline" onClick={exportReport}><Download className="mr-2 h-4 w-4" />{t("security.export")}</Button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-100">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          [t("security.events24"), summary.events_24h || 0, ShieldAlert],
          [t("security.blocked24"), summary.blocked_24h || 0, Ban],
          [t("security.pending"), summary.pending_decisions || 0, Settings2],
          [t("security.critical"), summary.critical_unreviewed || 0, ShieldAlert],
          [t("security.active_blocks"), summary.active_blocks || 0, ShieldCheck],
        ].map(([label, value, Icon]) => (
          <div key={label} className="rounded-2xl border border-border/60 bg-card/40 p-4">
            <Icon aria-hidden="true" className="mb-2 h-4 w-4 text-primary" />
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {selectedEvent && (
        <section id="security-response-panel" className="rounded-3xl border border-red-500/20 bg-red-500/[0.04] p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-300">{t("security.owner_response")}</p>
              <h3 className="mt-1 font-heading text-base font-bold">{t("security.configure_attempt")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("security.event")} {selectedEvent.event_id?.slice(0, 18)} · {selectedEvent.route || t("security.unknown_route")}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(null)}>{t("security.close")}</Button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_220px]">
            <div>
              <label className="text-xs font-semibold">{t("security.block_message")}</label>
              <Textarea value={customMessage} onChange={(event) => setCustomMessage(event.target.value)} maxLength={800} className="mt-2 min-h-24" placeholder={t("security.block_message_ph")} />
              <p className="mt-1 text-[10px] text-muted-foreground">{t("security.block_message_hint")}</p>
            </div>
            <div>
              <label className="text-xs font-semibold">{t("security.duration")}</label>
              <select value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="1">{t("security.hour")}</option>
                <option value="24">{t("security.hours24")}</option>
                <option value="168">{t("security.days7")}</option>
                <option value="720">{t("security.days30")}</option>
                <option value="permanent">{t("security.permanent")}</option>
              </select>
              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] text-muted-foreground">
                <p><strong className="text-foreground">{t("security.fingerprint")}:</strong> {selectedEvent.request_fingerprint ? `${selectedEvent.request_fingerprint.slice(0, 16)}…` : t("security.unavailable")}</p>
                <p className="mt-1"><strong className="text-foreground">{t("security.account")}:</strong> {selectedEvent.user_id ? t("security.linked") : t("security.unauth")}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {selectedEvent.request_fingerprint && (
              <Button disabled={busy} onClick={() => runAction({ action: "block", event_id: selectedEvent.event_id, fingerprint: selectedEvent.request_fingerprint, hours, permanent, reason: selectedEvent.reason, custom_message: customMessage, show_message: true }, t("security.confirm_block", { block: permanent ? t("security.block_permanent") : t("security.block_hours", { hours }) }))}>
                <Ban className="mr-2 h-4 w-4" />{t("security.block_fingerprint")}
              </Button>
            )}
            {selectedEvent.user_id && (
              <Button variant="destructive" disabled={busy} onClick={() => runAction({ action: "ban_user", event_id: selectedEvent.event_id, hours, permanent, reason: selectedEvent.reason, custom_message: customMessage }, t("security.confirm_ban", { duration: permanent ? t("security.ban_permanent") : t("security.ban_hours", { hours }) }))}>
                <UserX className="mr-2 h-4 w-4" />{t("security.ban_account")}
              </Button>
            )}
            <Button variant="outline" disabled={busy} onClick={() => runAction({ action: "review", event_id: selectedEvent.event_id, notes: t("security.review_note") })}>
              <CheckCircle2 className="mr-2 h-4 w-4" />{t("security.review_only")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => runAction({ action: "ignore", event_id: selectedEvent.event_id, notes: t("security.ignore_note") }, t("security.ignore_confirm"))}>
              <EyeOff className="mr-2 h-4 w-4" />{t("security.ignore")}
            </Button>
          </div>
        </section>
      )}

      <section className="min-w-0 overflow-hidden rounded-2xl border border-red-500/15 bg-red-500/[0.025] p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-300" />
          <h3 className="font-semibold">Prompt Guard · Core OS</h3>
          <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-200">
            {promptIncidents.filter((item) => item.status === "pending").length} pendentes
          </span>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          Tentativas de prompt injection, extração de segredos, falsificação de cargo e sondagem entre projetos. A Core OS isola o conteúdo antes do modelo e a punição fica para decisão humana.
        </p>
        <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
          {promptIncidents.slice(0, 40).map((incident) => (
            <article key={incident.id || incident.incident_id} className="rounded-xl border border-border/50 bg-background/30 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-1 font-semibold uppercase ${severityStyles[incident.severity] || severityStyles.high}`}>{incident.severity || "high"}</span>
                <span className="rounded bg-secondary px-2 py-1 font-mono text-[10px]">risco {Number(incident.risk_score || 0)}/100</span>
                <span className="rounded border border-border/50 px-2 py-1 font-semibold">tentativa {Number(incident.attempt_count || 1)}</span>
                {incident.takeover_active && <span className="rounded bg-red-500/15 px-2 py-1 font-bold text-red-200">CORE OS INTERVEIO</span>}
                <span className="font-semibold">{String(incident.category || "prompt_injection").replaceAll("_", " ")}</span>
                <span className="text-muted-foreground sm:ml-auto">{incident.last_seen_at ? new Date(incident.last_seen_at).toLocaleString(locale) : ""}</span>
              </div>
              <div className="mt-2 grid gap-1 text-[11px] leading-relaxed text-muted-foreground">
                <p><span className="font-semibold text-foreground">Conta:</span> {incident.user_id ? `${incident.user_id.slice(0, 18)}…` : "não vinculada"} · <span className="font-semibold text-foreground">cargo autenticado:</span> {incident.authenticated_role || "user"}</p>
                <p><span className="font-semibold text-foreground">Trecho sanitizado:</span> {incident.sanitized_excerpt || "conteúdo omitido"}</p>
                <p><span className="font-semibold text-foreground">Recomendação:</span> {incident.recommended_action || "Revisar antes de qualquer medida."}</p>
                <p className="font-mono text-[10px] text-muted-foreground/70">sessão: {incident.conversation_id?.slice(0, 24) || "-"} · status: {incident.status || "pending"}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => configureIncidentEvent(incident)}>
                  <Settings2 className="mr-1.5 h-3.5 w-3.5" />Abrir resposta de segurança
                </Button>
                {incident.status === "pending" && (
                  <>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => reviewPromptIncident(incident, "reviewed")}>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Marcar revisado
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => reviewPromptIncident(incident, "ignored")}>
                      <EyeOff className="mr-1.5 h-3.5 w-3.5" />Ignorar
                    </Button>
                  </>
                )}
              </div>
            </article>
          ))}
          {!promptIncidents.length && <p className="text-sm text-muted-foreground">Nenhum incidente de prompt injection registrado.</p>}
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card/30 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">{t("security.reports")}</h3>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {groupedEvents.length} grupos · {(report.events || []).length} eventos
          </span>
        </div>
        <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
          {groupedEvents.slice(0, 30).map((event) => {
            const expanded = expandedEventGroups.has(event.groupKey);
            return (
              <article key={event.groupKey} className={`rounded-xl border px-3 py-3 text-xs ${selectedEvent?.event_id === event.event_id ? "border-red-500/35 bg-red-500/[0.04]" : "border-border/60 bg-background/30"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-1 font-semibold uppercase ${severityStyles[event.severity] || severityStyles.low}`}>{event.severity || "low"}</span>
                  <span className="rounded bg-secondary px-2 py-1 font-mono text-[10px]">{t("security.risk")} {event.maxRisk}/100</span>
                  {event.groupCount > 1 && <span className="rounded-full border border-border/50 bg-white/[0.04] px-2 py-1 text-[10px] font-extrabold">×{event.groupCount}</span>}
                  <span className="min-w-0 break-words font-semibold">{event.reason || event.category}</span>
                  <span className="min-w-0 break-all text-muted-foreground">{event.route}</span>
                  <span className="text-muted-foreground sm:ml-auto">{event.occurred_at ? new Date(event.occurred_at).toLocaleString(locale) : ""}</span>
                </div>
                <div className="mt-2 grid gap-1 text-[11px] leading-relaxed text-muted-foreground">
                  <p><span className="font-semibold text-foreground">{t("security.analysis")}:</span> {event.ai_summary || t("security.awaiting_analysis")}</p>
                  <p><span className="font-semibold text-foreground">{t("security.recommendation")}:</span> {event.ai_recommendation || t("security.recommendation_default")}</p>
                  <p className="font-mono text-[10px] text-muted-foreground/70">
                    {event.uniqueFingerprints} fingerprint{event.uniqueFingerprints === 1 ? "" : "s"} · {t("security.decision")}: {event.owner_decision || (event.reviewed ? "reviewed" : "pending")}
                  </p>
                </div>

                {expanded && event.groupCount > 1 && (
                  <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-border/40 bg-black/10 p-2 scrollbar-thin">
                    {event.members.slice(0, 20).map((member) => (
                      <button
                        key={member.id || member.event_id}
                        type="button"
                        onClick={() => configure(member)}
                        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10px] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                      >
                        <span className="shrink-0 font-mono">{member.request_fingerprint ? `${member.request_fingerprint.slice(0, 12)}…` : "-"}</span>
                        <span className="min-w-0 flex-1 truncate">{member.ai_summary || member.reason || member.category}</span>
                        <span className="shrink-0">{member.occurred_at ? new Date(member.occurred_at).toLocaleString(locale) : ""}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button disabled={busy} size="sm" variant="outline" onClick={() => configure(event)}>
                    <Settings2 className="mr-1.5 h-3.5 w-3.5" />{t("security.configure_response")}
                  </Button>
                  {!event.reviewed && (
                    <Button disabled={busy} size="sm" variant="ghost" onClick={() => runAction({ action: "review", event_id: event.event_id })}>
                      <CheckCircle2 className="mr-1 h-3 w-3" />{t("security.reviewed")}
                    </Button>
                  )}
                  {event.groupCount > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => toggleEventGroup(event.groupKey)} className="gap-1.5 text-muted-foreground">
                      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {expanded ? "Recolher" : `Ver ${event.groupCount} ocorrências`}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
          {!groupedEvents.length && <p className="text-sm text-muted-foreground">{t("security.no_events")}</p>}
        </div>
      </section>

      {activeBlocks.length > 0 && (
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card/30 p-3 sm:p-4">
          <h3 className="mb-3 font-semibold">{t("security.active_blocks")}</h3>
          <div className="space-y-2">
            {activeBlocks.slice(0, 30).map((block) => (
              <div key={block.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-border/50 px-3 py-3 text-xs">
                <Ban className="h-4 w-4 text-red-300" />
                <span className="font-mono break-all">{block.fingerprint?.slice(0, 16)}…</span>
                <span className="text-muted-foreground">{block.reason}</span>
                <span className="text-muted-foreground sm:ml-auto">{block.expires_at ? t("security.until", { date: new Date(block.expires_at).toLocaleString(locale) }) : t("security.permanent").toLowerCase()}</span>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => runAction({ action: "unblock", fingerprint: block.fingerprint }, t("security.unblock_confirm"))}>{t("security.unblock")}</Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {ownerAI && (
        <section className="mt-6 rounded-3xl border border-white/[0.08] bg-[#050505] p-4 md:p-5">
          <div className="mb-4 flex items-center gap-3 border-b border-white/[0.07] pb-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04]"><Bot className="h-5 w-5" /></div>
            <div><h3 className="font-heading text-sm font-bold">Core Security AI</h3><p className="text-xs text-muted-foreground">{t("security.core_desc")}</p></div>
          </div>
          <CoreOS mode="owner" context="security" />
        </section>
      )}
    </div>
  );
}
