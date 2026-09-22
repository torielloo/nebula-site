import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatLocalDateTime } from "@/lib/time";
import {
  LifeBuoy,
  Loader2,
  Plus,
  Search,
  User as UserIcon,
  Bug,
  Download,
  Cpu,
  Sparkles,
  CircleDot,
  CheckCircle2,
  Archive,
  RotateCcw,
  AtSign,
} from "lucide-react";
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
import TicketThread from "@/components/TicketThread";
import AttachmentPicker from "@/components/tickets/AttachmentPicker";
import PageShell from "@/components/PageShell";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TICKET_STATUS, TICKET_CATEGORIES } from "@/lib/ticketMeta";
import { useToast } from "@/components/ui/use-toast";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";

const CATEGORY_ICONS = { conta: UserIcon, bugs: Bug, downloads: Download, ia: Cpu, nitro: Sparkles };
const PRIORITY_BAR = {
  low: "border-l-sky-500",
  normal: "border-l-primary",
  high: "border-l-amber-500",
  urgent: "border-l-white",
};

const EMPTY_FORM = { subject: "", priority: "normal", category: "conta", description: "", attachments: [] };
const OPEN_STATUSES = ["novo", "em_atendimento", "aguardando_usuario"];

export default function Tickets() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState(null);
  const [selected, setSelected] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [closedCollapsed, setClosedCollapsed] = useState(() => {
    try { return localStorage.getItem("nebula:tickets-closed-collapsed") === "1"; } catch { return false; }
  });
  const [form, setForm] = useState(EMPTY_FORM);
  const [loadError, setLoadError] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [mentionedTicketIds, setMentionedTicketIds] = useState(() => new Set());
  const [clockNow, setClockNow] = useState(() => Date.now());
  const pendingStatusRef = useRef(new Map());
  const mentionSeenAtRef = useRef(new Map());
  const rawRequesterHandle = user?.profile?.username || user?.profile?.discord_handle || user?.profile?.discord_username || "";
  const requesterDisplay = rawRequesterHandle ? `@${String(rawRequesterHandle).replace(/^@+/, "")}` : (user?.profile?.display_name || user?.full_name || "");

  const markMentionSeen = (ticketId) => {
    if (!ticketId) return;
    mentionSeenAtRef.current.set(ticketId, Date.now());
    setMentionedTicketIds((currentIds) => {
      if (!currentIds.has(ticketId)) return currentIds;
      const next = new Set(currentIds);
      next.delete(ticketId);
      return next;
    });
    base44.functions.invoke("ticketOps", { action: "mark_ticket_mentions_seen", ticket_id: ticketId }).catch(() => {});
  };

  const selectTicket = (ticket) => {
    if (!ticket?.id) return;
    markMentionSeen(ticket.id);
    setSelected(ticket);
  };

  const load = async () => {
    setLoadError("");
    try {
      const rows = await base44.entities.Ticket.filter({ requester_user_id: user.id }, "-created_date", 50);
      const list = (rows || []).filter((tk) => tk.deleted !== true).map((tk) => {
        const pendingStatus = pendingStatusRef.current.get(tk.id);
        return pendingStatus ? { ...tk, status: pendingStatus } : tk;
      });
      setTickets(list);
      setSelected((current) => {
        if (!current) return current;
        const fresh = list.find((tk) => tk.id === current.id);
        return fresh || null;
      });
    } catch {
      setLoadError("Não foi possível carregar seus tickets. Verifique a conexão e tente novamente.");
    }
  };

  const { pull, refreshing } = usePullToRefresh(load);

  useEffect(() => {
    load();

    // A assinatura realtime continua sendo o caminho principal. Este polling
    // leve é apenas um fallback para casos em que uma atualização feita pela
    // Staff não chega pelo websocket no navegador do usuário.
    const syncTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 4000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(syncTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    const loadMentions = () => base44.functions.invoke("ticketOps", { action: "list_my_ticket_mentions" })
      .then((res) => {
        if (cancelled) return;
        const now = Date.now();
        const ids = new Set((res.data?.ticket_ids || []).filter((ticketId) => {
          const seenAt = mentionSeenAtRef.current.get(ticketId) || 0;
          return now - seenAt > 15000;
        }));
        if (selected?.id && ids.has(selected.id)) {
          ids.delete(selected.id);
          markMentionSeen(selected.id);
        }
        setMentionedTicketIds(ids);
      })
      .catch(() => {});
    loadMentions();
    const unsubscribe = base44.entities.TicketMessage.subscribe((event) => {
      const row = event?.data;
      if (!row?.ticket_id) return;
      if ((row.mentions || []).some((mention) => mention?.id === user.id)) {
        if (selected?.id === row.ticket_id) {
          base44.functions.invoke("ticketOps", { action: "mark_ticket_mentions_seen", ticket_id: row.ticket_id }).catch(() => {});
          setMentionedTicketIds((currentIds) => {
            const next = new Set(currentIds);
            next.delete(row.ticket_id);
            return next;
          });
          return;
        }
        mentionSeenAtRef.current.delete(row.ticket_id);
        setMentionedTicketIds((currentIds) => new Set([...currentIds, row.ticket_id]));
      }
    });
    const timer = window.setInterval(loadMentions, 10000);
    return () => { cancelled = true; unsubscribe?.(); window.clearInterval(timer); };
  }, [user.id, selected?.id]);

  // Atualização em tempo real da lista e do ticket selecionado (sem F5)
  useEffect(() => {
    const unsub = base44.entities.Ticket.subscribe((event) => {
      const d = event && event.data;
      if (!d) return;
      if (event.type === "create") {
        if (d.deleted !== true) setTickets((prev) => (prev ? [d, ...prev.filter((tk) => tk.id !== d.id)] : prev));
      } else if (event.type === "update") {
        if (d.deleted === true) {
          setTickets((prev) => (prev ? prev.filter((tk) => tk.id !== d.id) : prev));
          setSelected((prev) => (prev && prev.id === d.id ? null : prev));
        } else {
          const pendingStatus = pendingStatusRef.current.get(d.id);
          const incoming = pendingStatus ? { ...d, status: pendingStatus } : d;
          setTickets((prev) => (prev ? prev.map((tk) => (tk.id === d.id ? { ...tk, ...incoming } : tk)) : prev));
          setSelected((prev) => (prev && prev.id === d.id ? { ...prev, ...incoming } : prev));
        }
      } else if (event.type === "delete") {
        setTickets((prev) => (prev ? prev.filter((tk) => tk.id !== d.id) : prev));
        setSelected((prev) => (prev && prev.id === d.id ? null : prev));
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const ticketId = searchParams.get("ticket");
    if (!ticketId || !tickets) return;
    const found = tickets.find((tk) => tk.id === ticketId);
    if (found) selectTicket(found);
    const next = new URLSearchParams(searchParams);
    next.delete("ticket");
    setSearchParams(next, { replace: true });
  }, [searchParams.get("ticket"), tickets]);

  const stats = useMemo(() => {
    const s = { total: 0, open: 0, resolved: 0, closed: 0 };
    (tickets || []).forEach((tk) => {
      const st = tk.status || "novo";
      s.total += 1;
      if (["novo", "em_atendimento", "aguardando_usuario"].includes(st)) s.open += 1;
      else if (st === "resolvido") s.resolved += 1;
      else if (st === "fechado") s.closed += 1;
    });
    return s;
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const hideClosed = closedCollapsed && statusFilter === "all" && !q;
    return (tickets || []).filter((tk) => {
      const st = tk.status || "novo";
      if (hideClosed && st === "fechado") return false;
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (q && !`${tk.subject} ${tk.description || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tickets, search, statusFilter, closedCollapsed]);

  const submit = async () => {
    if (!form.subject.trim() || !form.description.trim() || saving) return;
    setSaving(true);
    try {
      // Servidor valida e garante a regra de 1 ticket aberto por usuário
      const res = await base44.functions.invoke("createTicket", {
        subject: form.subject.trim(),
        description: form.description.trim(),
        priority: form.priority,
        category: form.category,
        attachments: form.attachments,
      });
      const created = (res && res.data && res.data.ticket) || null;
      setForm(EMPTY_FORM);
      setDialogOpen(false);
      await load();
      if (created) setSelected(created);
    } catch (e) {
      const data = e && e.response && e.response.data;
      toast({ variant: "destructive", title: (data && data.error) || "Erro" });
      if (data && (data.open_ticket_id || data.reuse_ticket_id)) {
        const targetId = data.open_ticket_id || data.reuse_ticket_id;
        setDialogOpen(false);
        await load();
        try {
          const rows = await base44.entities.Ticket.filter({ id: targetId }, "-created_date", 1);
          if (rows?.[0]) setSelected(rows[0]);
        } catch {}
      }
    } finally {
      setSaving(false);
    }
  };

  const changeOwnTicketStatus = async (nextStatus) => {
    if (!selected || statusBusy) return;
    let reason = "";
    if (nextStatus === "fechado" && (selected.status || "novo") !== "fechado") {
      reason = (window.prompt("Informe o motivo do fechamento do ticket:", "") || "").trim();
      if (!reason) return;
    }
    const ticketId = selected.id;
    const previousStatus = selected.status || "novo";
    const reopeningClosed = nextStatus === "novo" && previousStatus === "fechado";
    setStatusBusy(true);

    // Fechar continua otimista para responder rápido. Reabrir NÃO pode ser
    // otimista: o servidor ainda precisa validar cooldown e a regra de apenas
    // um ticket aberto. Enquanto aguarda, o ticket permanece fechado e a call
    // continua bloqueada, eliminando a janela de corrida.
    if (!reopeningClosed) {
      pendingStatusRef.current.set(ticketId, nextStatus);
      setTickets((current) => current ? current.map((tk) => tk.id === ticketId ? { ...tk, status: nextStatus } : tk) : current);
      setSelected((current) => current && current.id === ticketId ? { ...current, status: nextStatus } : current);
    }

    try {
      const res = await base44.functions.invoke("ticketOps", {
        action: "update_ticket",
        ticket_id: ticketId,
        status: nextStatus,
        ...(reason ? { reason } : {}),
      });
      const updated = res?.data?.ticket;
      const confirmed = { ...(updated || {}), status: nextStatus };
      pendingStatusRef.current.set(ticketId, nextStatus);
      setTickets((current) => current ? current.map((tk) => tk.id === ticketId ? { ...tk, ...confirmed } : tk) : current);
      setSelected((current) => current && current.id === ticketId ? { ...current, ...confirmed } : current);
      // Mantém a proteção por alguns segundos: eventos realtime antigos podem
      // chegar DEPOIS da resposta HTTP. Durante essa janela, o status confirmado
      // pelo clique do usuário continua sendo a fonte de verdade da interface.
      window.setTimeout(() => {
        if (pendingStatusRef.current.get(ticketId) === nextStatus) {
          pendingStatusRef.current.delete(ticketId);
        }
      }, 4000);
    } catch (error) {
      pendingStatusRef.current.delete(ticketId);
      // Só existe rollback visual quando realmente houve atualização otimista.
      // Na reabertura a tela nunca sai de "Fechado" antes da confirmação.
      if (!reopeningClosed) {
        setTickets((current) => current ? current.map((tk) => tk.id === ticketId ? { ...tk, status: previousStatus } : tk) : current);
        setSelected((current) => current && current.id === ticketId ? { ...current, status: previousStatus } : current);
      } else {
        load().catch(() => {});
      }
      toast({
        variant: "destructive",
        title: error?.response?.data?.error || "Não foi possível atualizar o ticket",
      });
    } finally {
      setStatusBusy(false);
    }
  };

  const closeTicket = () => changeOwnTicketStatus("fechado");
  const reopenTicket = () => {
    if (!selected || statusBusy) return;
    const otherOpen = (tickets || []).find((tk) =>
      tk.id !== selected.id &&
      tk.deleted !== true &&
      OPEN_STATUSES.includes(tk.status || "novo")
    );
    if (otherOpen) {
      toast({
        variant: "destructive",
        title: "Você já possui outro ticket em aberto. Feche ou continue nele antes de reabrir este.",
      });
      return;
    }
    changeOwnTicketStatus("novo");
  };

  useEffect(() => {
    if (!selected || selected.status !== "fechado" || selected.closed_by !== user.id || !selected.closed_at) return undefined;
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [selected?.id, selected?.status, selected?.closed_by, selected?.closed_at, user.id]);

  const reopenCooldownSeconds = useMemo(() => {
    if (!selected || selected.status !== "fechado" || selected.closed_by !== user.id || !selected.closed_at) return 0;
    const closedAtMs = new Date(selected.closed_at).getTime();
    if (!Number.isFinite(closedAtMs)) return 0;
    return Math.max(0, Math.ceil((60_000 - (clockNow - closedAtMs)) / 1000));
  }, [selected, user.id, clockNow]);

  // Regra: 1 ticket aberto por vez — se existir, "Novo ticket" leva até ele
  const openTicket = (tickets || []).find((tk) => OPEN_STATUSES.includes(tk.status || "novo"));

  const statCards = [
    { key: "total", label: t("tickets.stats_total"), value: stats.total, icon: LifeBuoy, cls: "text-primary" },
    { key: "open", label: t("tickets.stats_open"), value: stats.open, icon: CircleDot, cls: "text-amber-400" },
    { key: "resolved", label: t("ticket.status_resolvido"), value: stats.resolved, icon: CheckCircle2, cls: "text-emerald-400" },
    { key: "closed", label: t("ticket.status_fechado"), value: stats.closed, icon: Archive, cls: "text-muted-foreground" },
  ];

  return (
    <PageShell
      label={t("tickets.label")}
      title="Tickets"
      subtitle={t("tickets.subtitle")}
      actions={
        <div className="flex flex-col items-end gap-1">
          <Button
            onClick={() => {
              if (openTicket) {
                setSelected(openTicket);
                toast({ description: t("tickets.already_open") });
              } else {
                setDialogOpen(true);
              }
            }}
            className="nebula-glow-sm"
          >
            <Plus className="mr-2 h-4 w-4" /> {t("tickets.open")}
          </Button>
          {openTicket && (
            <span className="text-[10px] font-semibold text-muted-foreground">{t("tickets.one_open_hint")}</span>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <PullToRefreshIndicator pull={pull} refreshing={refreshing} />

        {tickets !== null && (
          <div className="grid grid-cols-2 divide-x divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 sm:grid-cols-4">
            {statCards.map((s) => (
              <div key={s.key} className="bg-card/40 p-3.5">
                <div className="flex items-center gap-2">
                  <s.icon className={cn("h-4 w-4", s.cls)} />
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </p>
                </div>
                <p className="mt-1 font-display text-2xl font-extrabold">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {tickets !== null && tickets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/40 bg-card/50 p-3">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("tickets.search_ph")}
                className="h-9 rounded-xl border-border/40 bg-transparent pl-9 text-xs"
              />
            </div>
            {stats.closed >= 3 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-xl px-3 text-xs"
                onClick={() => {
                  setClosedCollapsed((current) => {
                    const next = !current;
                    try { localStorage.setItem("nebula:tickets-closed-collapsed", next ? "1" : "0"); } catch {}
                    return next;
                  });
                }}
              >
                <Archive className="mr-2 h-3.5 w-3.5" />
                {closedCollapsed ? `Mostrar fechados (${stats.closed})` : `Recolher fechados (${stats.closed})`}
              </Button>
            )}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-full rounded-xl text-xs sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("painel.tk_all_status")}</SelectItem>
                {Object.keys(TICKET_STATUS).map((k) => (
                  <SelectItem key={k} value={k}>{t(`ticket.status_${k}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {tickets === null && <div className="h-24 animate-pulse rounded-xl bg-secondary/50" />}
        {loadError && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
            <p className="text-sm text-foreground">{loadError}</p>
            <Button variant="outline" size="sm" onClick={load}>Tentar novamente</Button>
          </div>
        )}
        {tickets && tickets.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
            <LifeBuoy className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold">Você ainda não abriu nenhum ticket.</p>
            <p className="mt-1 text-sm text-muted-foreground">Use esta área para falar com a staff sobre conta, downloads, bugs ou suporte.</p>
            <Button className="mt-4" onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Abrir ticket</Button>
          </div>
        )}

        {tickets && tickets.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-[340px,1fr]">
            <div className={cn("scrollbar-thin max-h-[calc(100dvh-15rem)] space-y-2 overflow-x-hidden overflow-y-auto sm:max-h-[70vh] lg:max-h-none", selected && "hidden sm:block")}>
              {filtered.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                  {t("solucoes.empty")}
                </p>
              )}
              {filtered.map((tk, i) => {
                const meta = TICKET_STATUS[tk.status] || TICKET_STATUS.novo;
                const CatIcon = CATEGORY_ICONS[tk.category || "conta"] || UserIcon;
                return (
                  <motion.button
                    key={tk.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.4), duration: 0.35, ease: "easeOut" }}
                    data-no-beat
                    onClick={() => selectTicket(tk)}
                    className={cn(
                      "w-full rounded-xl border border-l-2 p-3.5 text-left transition-colors",
                      PRIORITY_BAR[tk.priority || "normal"] || PRIORITY_BAR.normal,
                      selected && selected.id === tk.id
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/60 bg-card hover:border-foreground/25"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <CatIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-sm font-semibold">{tk.subject}</span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("ticket.category_" + (tk.category || "conta"))} · {t("ticket.priority_" + (tk.priority || "normal"))} · {formatLocalDateTime(tk.created_date)}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground/70">
                          {t("painel.tk_by", { name: requesterDisplay || tk.requester_name || t("common.user") })}
                        </p>
                      </div>
                      {mentionedTicketIds.has(tk.id) && (
                        <span title="Você foi mencionado neste ticket" aria-label="Você foi mencionado neste ticket" className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                          <AtSign className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", meta.cls)}>
                        {t(`ticket.status_${tk.status || "novo"}`)}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <div className={cn("rounded-xl border border-border/70 bg-card p-3 sm:p-4 md:p-5", !selected && "hidden sm:block")}>
              {selected ? (
                <>
                  <button type="button" onClick={() => setSelected(null)} className="mb-3 w-fit rounded-full border border-border/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:hidden">
                    Voltar aos tickets
                  </button>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <h2 className="font-heading text-base font-bold">{selected.subject}</h2>
                    {selected.status === "fechado" && (
                      <div className="ml-auto flex flex-col items-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={reopenTicket}
                          disabled={statusBusy || reopenCooldownSeconds > 0}
                          className="h-8"
                        >
                          {statusBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                          {reopenCooldownSeconds > 0 ? `Reabrir em ${reopenCooldownSeconds}s` : t("ticket.reopen")}
                        </Button>
                        {reopenCooldownSeconds > 0 && (
                          <span className="text-[10px] text-muted-foreground">Proteção anti-spam após fechar o próprio ticket.</span>
                        )}
                      </div>
                    )}
                  </div>
                  <TicketThread
                    ticket={{ ...selected, requester_name: requesterDisplay || selected.requester_name }}
                    user={user}
                    staffMode={false}
                    onCloseTicket={selected.status !== "fechado" && !statusBusy ? closeTicket : null}
                    onMentionSeen={markMentionSeen}
                  />
                </>
              ) : (
                <div className="grid h-full min-h-[200px] place-items-center text-sm text-muted-foreground">
                  {t("tickets.select")}
                </div>
              )}
            </div>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin border-border/60 bg-card sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">{t("tickets.open")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tk-subject">{t("tickets.subject")}</Label>
                <Input
                  id="tk-subject"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder={t("tickets.subject_ph")}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("tickets.category")}</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TICKET_CATEGORIES).map(([k]) => (
                        <SelectItem key={k} value={k}>{t("ticket.category_" + k)} — {t("ticket.catd_" + k)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("tickets.priority")}</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t("ticket.priority_low")}</SelectItem>
                      <SelectItem value="normal">{t("ticket.priority_normal")}</SelectItem>
                      <SelectItem value="high">{t("ticket.priority_high")}</SelectItem>
                      <SelectItem value="urgent">{t("ticket.priority_urgent")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tk-desc">{t("tickets.desc")}</Label>
                <Textarea
                  id="tk-desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  placeholder={t("tickets.desc_ph")}
                />
              </div>
              <div className="space-y-2 rounded-xl border border-border/40 bg-secondary/30 p-3">
                <Label>{t("ticket.attach")}</Label>
                <AttachmentPicker
                  attachments={form.attachments}
                  onChange={(attachments) => setForm({ ...form, attachments })}
                  disabled={saving}
                />
              </div>
              <Button onClick={submit} disabled={saving || !form.subject.trim() || !form.description.trim()} className="w-full">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("tickets.send")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PageShell>
  );
}
