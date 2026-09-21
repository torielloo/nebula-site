import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, ExternalLink, Flag, Image as ImageIcon, Loader2, Search, ShieldCheck, UserRound, Video, X } from "lucide-react";
import { parseDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const STATUS = {
  new: ["new", "bg-white/10 text-white"],
  pending: ["new", "bg-white/10 text-white"],
  in_review: ["in_review", "bg-blue-500/12 text-blue-300"],
  awaiting_info: ["awaiting_info", "bg-amber-500/12 text-amber-300"],
  confirmed: ["confirmed", "bg-emerald-500/12 text-emerald-300"],
  approved: ["confirmed", "bg-emerald-500/12 text-emerald-300"],
  rejected: ["rejected", "bg-slate-500/15 text-slate-300"],
  resolved: ["resolved", "bg-primary/12 text-primary"],
};
const OPEN = new Set(["new", "pending", "in_review", "awaiting_info"]);
const CONFIRMED = new Set(["confirmed", "approved", "resolved"]);
const PAGE_SIZE = 6;

const GROUPS = [
  { key: "open", label: "Em revisão", match: (r) => OPEN.has(r.status || "pending") },
  { key: "confirmed", label: "Confirmadas / resolvidas", match: (r) => CONFIRMED.has(r.status) },
  { key: "rejected", label: "Rejeitadas", match: (r) => r.status === "rejected" },
];

export default function ReportsTab({ reports = [], onChanged }) {
  const { t } = useI18n();
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [collapsed, setCollapsed] = useState({});
  const [pages, setPages] = useState({ open: 1, confirmed: 1, rejected: 1 });

  const sorted = useMemo(() => [...reports].sort((a, b) => {
    const oa = OPEN.has(a.status || "pending") ? 0 : 1;
    const ob = OPEN.has(b.status || "pending") ? 0 : 1;
    if (oa !== ob) return oa - ob;
    const pa = a.priority === "urgent" ? 3 : a.priority === "high" ? 2 : a.priority === "low" ? 0 : 1;
    const pb = b.priority === "urgent" ? 3 : b.priority === "high" ? 2 : b.priority === "low" ? 0 : 1;
    return pb - pa || new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime();
  }), [reports]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((r) => {
      if (priority !== "all" && (r.priority || "normal") !== priority) return false;
      if (!q) return true;
      return [
        r.id,
        r.reason,
        r.description,
        r.context,
        r.reporter_name,
        r.target_author,
        r.reported_user_id,
        r.resolution,
      ].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [sorted, query, priority]);

  const update = async (item, status) => {
    if (busyId) return;
    let resolution = "";
    if (["confirmed", "rejected", "resolved"].includes(status)) {
      const value = window.prompt(status === "rejected" ? t("reports.prompt_reject") : t("reports.prompt_resolution"), "");
      if (value === null) return;
      resolution = value.trim();
    }
    setBusyId(item.id);
    setMessage("");
    try {
      await base44.functions.invoke("manageReport", { report_id: item.id, status, resolution });
      setMessage(t("reports.updated", { id: item.id.slice(-6).toUpperCase() }));
      await onChanged?.();
    } catch (e) {
      setMessage(e?.response?.data?.error || t("reports.update_error"));
    } finally {
      setBusyId(null);
    }
  };

  const openCount = reports.filter((r) => OPEN.has(r.status || "pending")).length;
  const confirmedCount = reports.filter((r) => CONFIRMED.has(r.status)).length;
  const rejectedCount = reports.filter((r) => r.status === "rejected").length;
  const spikes = reports.filter((r) => r.risk_flag === "reports_spike").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label={t("reports.open")} value={openCount} icon={Clock3} />
        <Metric label={t("reports.confirmed")} value={confirmedCount} icon={ShieldCheck} />
        <Metric label={t("reports.rejected")} value={rejectedCount} icon={X} />
        <Metric label={t("reports.spikes")} value={spikes} icon={AlertTriangle} />
      </div>

      <div className="rounded-2xl border border-border/40 bg-secondary/25 p-4 text-xs leading-relaxed text-muted-foreground">
        {t("reports.notice")}
      </div>

      <div className="grid gap-2 rounded-2xl border border-border/40 bg-card/40 p-3 md:grid-cols-[1fr_210px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setPages({ open: 1, confirmed: 1, rejected: 1 }); }} placeholder="Buscar por usuário, motivo, protocolo ou resolução..." className="pl-9" />
        </div>
        <select value={priority} onChange={(e) => { setPriority(e.target.value); setPages({ open: 1, confirmed: 1, rejected: 1 }); }} className="h-10 rounded-xl border border-border/60 bg-background px-3 text-sm outline-none">
          <option value="all">Todas as prioridades</option>
          <option value="urgent">Urgente</option>
          <option value="high">Alta</option>
          <option value="normal">Normal</option>
          <option value="low">Baixa</option>
        </select>
      </div>

      {message && <p role="status" className="rounded-xl border border-border/40 bg-card/60 p-3 text-xs font-semibold">{message}</p>}
      {filtered.length === 0 && <p className="rounded-2xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">{t("reports.empty")}</p>}

      <div className="space-y-3">
        {GROUPS.map((group) => {
          const rows = filtered.filter(group.match);
          if (!rows.length) return null;
          const maxPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
          const page = Math.min(pages[group.key] || 1, maxPage);
          const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
          const isCollapsed = !!collapsed[group.key];

          return (
            <section key={group.key} className="overflow-hidden rounded-2xl border border-border/40 bg-card/35">
              <button
                type="button"
                onClick={() => setCollapsed((current) => ({ ...current, [group.key]: !current[group.key] }))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
              >
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                <span className="text-sm font-bold">{group.label}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{rows.length}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">agrupado por status</span>
              </button>

              {!isCollapsed && (
                <div className="border-t border-border/30 p-3">
                  <div className="space-y-2">
                    {pageRows.map((r) => <ReportCard key={r.id} report={r} busyId={busyId} update={update} t={t} />)}
                  </div>

                  {maxPage > 1 && (
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-border/30 bg-background/35 px-3 py-2">
                      <span className="text-[11px] text-muted-foreground">Página {page} de {maxPage}</span>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={page <= 1} onClick={() => setPages((current) => ({ ...current, [group.key]: page - 1 }))}><ChevronLeft className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={page >= maxPage} onClick={() => setPages((current) => ({ ...current, [group.key]: page + 1 }))}><ChevronRight className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ReportCard({ report: r, busyId, update, t }) {
  const [statusKey, statusCls] = STATUS[r.status] || STATUS.pending;
  const statusLabel = t(`reports.status.${statusKey}`);
  const attachments = Array.isArray(r.attachments) ? r.attachments : [];

  return (
    <article className={cn("rounded-xl border bg-card/60 p-4 transition-colors", r.risk_flag === "reports_spike" ? "border-amber-500/35" : "border-border/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary"><Flag className="h-3.5 w-3.5" /></div>
        <span className="font-mono text-[11px] font-bold">#{r.id.slice(-6).toUpperCase()}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", statusCls)}>{statusLabel}</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{t("reports.priority", { value: t(`reports.priority.${r.priority || "normal"}`) })}</span>
        {r.risk_flag === "reports_spike" && <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300"><AlertTriangle className="h-3 w-3" />{t("reports.abnormal")}</span>}
        <span className="ml-auto text-[10px] text-muted-foreground">{r.created_date ? parseDate(r.created_date).format("DD/MM/YYYY HH:mm") : ""}</span>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="text-sm"><strong>{t("reports.reason")}:</strong> {r.reason}</p>
          {r.description && <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{r.description}</p>}
          {r.context && <p className="mt-1.5 text-xs text-muted-foreground"><strong className="text-foreground">{t("reports.context")}:</strong> {r.context}</p>}
          {r.target_content && <blockquote className="mt-2 line-clamp-3 rounded-xl border border-border/40 bg-secondary/30 px-3 py-2 text-xs italic text-muted-foreground">{r.target_content}</blockquote>}

          {attachments.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Evidências · {attachments.length}</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {attachments.map((item, index) => (
                  <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noopener noreferrer" className="group relative overflow-hidden rounded-xl border border-border/40 bg-black/20">
                    {item.type === "video" ? (
                      <div className="flex h-28 items-center justify-center gap-2 bg-black/50 text-xs font-semibold text-white/80"><Video className="h-4 w-4" />Abrir vídeo</div>
                    ) : (
                      <img src={item.url} alt={item.name || "Evidência"} className="h-28 w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
                    )}
                    <div className="flex items-center gap-2 px-2.5 py-2 text-[10px] text-muted-foreground">
                      {item.type === "video" ? <Video className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                      <span className="truncate">{item.name || "Evidência"}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>{t("reports.reporter", { name: r.reporter_name || t("common.user") })}</span>
            <span>{t("reports.target", { name: r.target_author || r.reported_user_id || r.target_id || "—" })}</span>
            {r.handled_by && <span>{t("reports.handled", { name: r.handled_by })}</span>}
          </div>
          {r.resolution && <p className="mt-2 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-2.5 text-xs"><strong>{t("reports.resolution")}:</strong> {r.resolution}</p>}
        </div>

        <div className="flex min-w-[170px] flex-col gap-2">
          {r.reported_user_id && <Button asChild variant="outline" size="sm"><Link to={`/user/${r.reported_user_id}`}><UserRound className="mr-1.5 h-3.5 w-3.5" />{t("reports.open_user")}</Link></Button>}
          {r.content_url && r.content_url.startsWith("/") && <Button asChild variant="ghost" size="sm"><Link to={r.content_url}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />{t("reports.open_context")}</Link></Button>}
          {OPEN.has(r.status || "pending") && (
            <>
              {(r.status === "new" || r.status === "pending") && <Button variant="outline" size="sm" disabled={busyId === r.id} onClick={() => update(r, "in_review")}>{t("reports.review")}</Button>}
              <Button size="sm" disabled={busyId === r.id} onClick={() => update(r, "confirmed")} className="bg-emerald-600 hover:bg-emerald-600/90">{busyId === r.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}{t("reports.confirm")}</Button>
              <Button variant="outline" size="sm" disabled={busyId === r.id} onClick={() => update(r, "rejected")}><X className="mr-1 h-3.5 w-3.5" />{t("reports.reject")}</Button>
            </>
          )}
          {r.status === "confirmed" && <Button variant="outline" size="sm" disabled={busyId === r.id} onClick={() => update(r, "resolved")}>{t("reports.resolve")}</Button>}
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value, icon: Icon }) {
  return <div className="rounded-2xl border border-border/40 bg-card/50 p-4"><Icon className="h-4 w-4 text-primary" /><p className="mt-2 font-display text-2xl font-extrabold">{value}</p><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</p></div>;
}
