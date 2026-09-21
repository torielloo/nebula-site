import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ShieldCheck, Lock, Send, Trash2, UserRound, Pencil, Check, X, Copy, HandHelping, ArrowRightLeft, GripVertical, AtSign } from "lucide-react";
import UserQuickCard from "@/components/users/UserQuickCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TicketThread from "@/components/TicketThread";
import TicketSupportAi from "@/components/painel/TicketSupportAi";
import { formatLocalDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { TICKET_STATUS, TICKET_CATEGORIES } from "@/lib/ticketMeta";

const STATUS_SORT_PRIORITY = {
  em_atendimento: 1,
  aguardando_usuario: 2,
  novo: 3,
  resolvido: 4,
  fechado: 5,
};

function sortTicketList(list) {
  return [...list].sort((a, b) => {
    const aOrder = Number(a.ticket_list_order);
    const bOrder = Number(b.ticket_list_order);
    const aHasOrder = Number.isFinite(aOrder) && aOrder > 0;
    const bHasOrder = Number.isFinite(bOrder) && bOrder > 0;

    // Se alguém já arrastou manualmente, a ordem manual sempre vence.
    if (aHasOrder && bHasOrder && aOrder !== bOrder) return aOrder - bOrder;
    if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;

    // Sem ordem manual, mantém a fila organizada por status.
    const aPriority = STATUS_SORT_PRIORITY[a.status || "novo"] || 99;
    const bPriority = STATUS_SORT_PRIORITY[b.status || "novo"] || 99;
    if (aPriority !== bPriority) return aPriority - bPriority;

    const aTime = new Date(a.updated_date || a.created_date || 0).getTime() || 0;
    const bTime = new Date(b.updated_date || b.created_date || 0).getTime() || 0;
    return bTime - aTime;
  });
}

export default function TicketsTab({ tickets, user, onChanged, initialTicketId = null, onConsumeInitialTicket }) {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showClosed, setShowClosed] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(initialTicketId || null);
  const [notes, setNotes] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [staffOptions, setStaffOptions] = useState([]);
  const [requesterHandles, setRequesterHandles] = useState({});
  const [helpTarget, setHelpTarget] = useState("");
  const [transferTarget, setTransferTarget] = useState("");
  const [staffActionBusy, setStaffActionBusy] = useState(false);
  const [ticketPatches, setTicketPatches] = useState({});
  const [draggingListId, setDraggingListId] = useState("");
  const [listDropTarget, setListDropTarget] = useState(null);
  const [listOrderBusy, setListOrderBusy] = useState(false);
  const [listOrderError, setListOrderError] = useState("");
  const [mentionedTicketIds, setMentionedTicketIds] = useState(() => new Set());
  const listDraggedRef = React.useRef(false);
  const mentionSeenAtRef = React.useRef(new Map());

  const mergedTickets = (tickets || [])
    .map((ticket) => ({
      ...ticket,
      requester_name: requesterHandles[ticket.requester_user_id] || ticket.requester_name,
      ...(ticketPatches[ticket.id] || {}),
    }));
  const orderedTickets = sortTicketList(mergedTickets);
  const current = orderedTickets.find((t) => t.id === selectedId) || null;

  useEffect(() => {
    if (!initialTicketId) return;
    if (mergedTickets.some((ticket) => ticket.id === initialTicketId)) {
      openTicket(initialTicketId);
      onConsumeInitialTicket?.();
    }
  }, [initialTicketId, tickets]);
  const staffName = user.full_name || (user.email || "Staff").split("@")[0];

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

  const openTicket = (ticketId) => {
    if (!ticketId) return;
    markMentionSeen(ticketId);
    setSelectedId(ticketId);
  };

  const patchTicket = (ticketId, patch) => {
    setTicketPatches((currentPatches) => ({ ...currentPatches, [ticketId]: { ...(currentPatches[ticketId] || {}), ...patch } }));
  };

  const clearTicketPatch = (ticketId) => {
    setTicketPatches((currentPatches) => {
      const next = { ...currentPatches };
      delete next[ticketId];
      return next;
    });
  };

  const closedCount = orderedTickets.filter((t) => (t.status || "novo") === "fechado" || t.deleted === true).length;
  const list = orderedTickets.filter((t) => {
    const status = t.status || "novo";
    const category = t.category || "conta";
    const isClosed = status === "fechado" || t.deleted === true;
    if (!showClosed && statusFilter !== "fechado" && isClosed) return false;
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (categoryFilter !== "all" && category !== categoryFilter) return false;
    if (search && !`${t.subject} ${t.requester_name || ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const reorderVisibleTickets = async (ticketId, targetId, after) => {
    if (!ticketId || listOrderBusy) return;
    const visible = list.filter((ticket) => ticket.id !== ticketId);
    const dragged = list.find((ticket) => ticket.id === ticketId);
    if (!dragged) return;

    let insertAt = visible.length;
    if (targetId) {
      const targetIndex = visible.findIndex((ticket) => ticket.id === targetId);
      if (targetIndex >= 0) insertAt = targetIndex + (after ? 1 : 0);
    }
    visible.splice(Math.max(0, Math.min(insertAt, visible.length)), 0, dragged);

    const visibleIds = new Set(list.map((ticket) => ticket.id));
    const full = sortTicketList(mergedTickets);
    const slots = [];
    full.forEach((ticket, index) => {
      if (visibleIds.has(ticket.id)) slots.push(index);
    });

    const reorderedFull = [...full];
    slots.forEach((slot, index) => {
      reorderedFull[slot] = visible[index];
    });

    const nextOrder = new Map(reorderedFull.map((ticket, index) => [ticket.id, index + 1]));
    const previousPatches = ticketPatches;

    setTicketPatches((currentPatches) => {
      const next = { ...currentPatches };
      for (const ticket of reorderedFull) {
        next[ticket.id] = {
          ...(next[ticket.id] || {}),
          ticket_list_order: nextOrder.get(ticket.id),
        };
      }
      return next;
    });

    setListOrderBusy(true);
    setListOrderError("");
    try {
      await base44.functions.invoke("ticketOps", {
        action: "reorder_ticket_list",
        ticket_id: ticketId,
        ordered_ids: reorderedFull.map((ticket) => ticket.id),
      });
      await onChanged?.();
    } catch (err) {
      setTicketPatches(previousPatches);
      setListOrderError(err?.response?.data?.error || "Não foi possível salvar a ordem dos tickets.");
    } finally {
      setListOrderBusy(false);
    }
  };

  const loadNotes = async () => {
    const n = await base44.entities.StaffNote.filter({ ticket_id: current.id }, "-created_date", 50);
    setNotes(n.reverse());
  };

  useEffect(() => {
    if (current) {
      setNotes(null);
      loadNotes().catch(() => setNotes([]));
    }
  }, [current && current.id]);

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
        if (current?.id && ids.has(current.id)) {
          ids.delete(current.id);
          markMentionSeen(current.id);
        }
        setMentionedTicketIds(ids);
      })
      .catch(() => {});
    loadMentions();
    const unsubscribe = base44.entities.TicketMessage.subscribe((event) => {
      const row = event?.data;
      if (!row?.ticket_id) return;
      if ((row.mentions || []).some((mention) => mention?.id === user.id)) {
        if (current?.id === row.ticket_id) {
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
  }, [user.id, current?.id]);

  useEffect(() => {
    let cancelled = false;
    base44.entities.User.list("full_name", 300)
      .then((rows) => {
        if (cancelled) return;
        const roles = new Set(["owner", "dev", "admin", "moderator", "support", "staff"]);
        setStaffOptions((rows || []).filter((item) => roles.has(item.role) && item.id !== user.id));
        setRequesterHandles(Object.fromEntries((rows || []).map((item) => {
          const profile = item.profile || {};
          const raw = profile.username || profile.discord_handle || profile.discord_username || "";
          return [item.id, raw ? `@${String(raw).replace(/^@+/, "")}` : ""];
        }).filter(([, handle]) => handle)));
      })
      .catch(() => setStaffOptions([]));
    return () => { cancelled = true; };
  }, [user.id]);

  const changeStatus = async (status) => {
    if (!current || current.deleted === true) return;
    const ticketId = current.id;
    let reason = "";
    if (status === "fechado" && (current.status || "novo") !== "fechado") {
      reason = (window.prompt("Informe o motivo do fechamento do ticket:", "") || "").trim();
      if (!reason) return;
    }
    patchTicket(ticketId, { status, ...(reason ? { close_reason: reason } : {}) });
    await base44.functions.invoke("ticketOps", { action: "update_ticket", ticket_id: ticketId, status, ...(reason ? { reason } : {}) });
    await onChanged();
    clearTicketPatch(ticketId);
  };

  const assignMe = async () => {
    const ticketId = current.id;
    patchTicket(ticketId, { status: "em_atendimento", assigned_to_name: staffName });
    await base44.functions.invoke("ticketOps", { action: "update_ticket", ticket_id: ticketId, status: "em_atendimento", assigned_to_name: staffName });
    await onChanged();
    clearTicketPatch(ticketId);
  };

  const changePriority = async (priority) => {
    if (!current || current.deleted === true) return;
    const ticketId = current.id;
    patchTicket(ticketId, { priority });
    await base44.functions.invoke("ticketOps", { action: "update_ticket", ticket_id: ticketId, priority });
    await onChanged();
    clearTicketPatch(ticketId);
  };

  const deleteTicket = async () => {
    if (!current) return;
    const confirmed = window.confirm(t("tickets.archive_confirm", { id: current.id, subject: current.subject, user: current.requester_name || t("common.user") }));
    if (!confirmed) return;
    const reason = (window.prompt("Informe o motivo do arquivamento do ticket:", "") || "").trim();
    if (!reason) return;
    const ticketId = current.id;
    patchTicket(ticketId, { deleted: true, status: "fechado" });
    setSelectedId(null);
    await base44.functions.invoke("ticketOps", { action: "delete_ticket", ticket_id: ticketId, reason });
    await onChanged();
    clearTicketPatch(ticketId);
  };

  const restoreArchived = async () => {
    if (!current || current.deleted !== true || staffActionBusy) return;
    setStaffActionBusy(true);
    const ticketId = current.id;
    try {
      patchTicket(ticketId, {
        deleted: false,
        status: "em_atendimento",
        deleted_at: null,
        deleted_by: "",
        deleted_by_name: "",
        delete_reason: "",
      });
      await base44.functions.invoke("ticketOps", { action: "restore_ticket", ticket_id: ticketId });
      await onChanged?.();
      clearTicketPatch(ticketId);
    } finally {
      setStaffActionBusy(false);
    }
  };

  const beginRename = () => {
    if (!current || current.deleted === true) return;
    setRenameDraft(current.subject || "");
    setRenaming(true);
  };

  const saveRename = async () => {
    const subject = renameDraft.trim();
    if (!current || !subject || renameBusy) return;
    setRenameBusy(true);
    try {
      const ticketId = current.id;
      patchTicket(ticketId, { subject });
      await base44.functions.invoke("ticketOps", { action: "update_ticket", ticket_id: ticketId, subject });
      setRenaming(false);
      await onChanged();
      clearTicketPatch(ticketId);
    } finally {
      setRenameBusy(false);
    }
  };

  const requestHelp = async () => {
    if (!current || current.deleted === true || !helpTarget || staffActionBusy) return;
    setStaffActionBusy(true);
    try {
      await base44.functions.invoke("ticketOps", { action: "request_help", ticket_id: current.id, target_user_id: helpTarget });
      setHelpTarget("");
    } finally {
      setStaffActionBusy(false);
    }
  };

  const transferTicket = async () => {
    if (!current || current.deleted === true || !transferTarget || staffActionBusy) return;
    setStaffActionBusy(true);
    try {
      const target = staffOptions.find((staff) => staff.id === transferTarget);
      const targetName = target?.full_name || target?.email || target?.id || "Staff";
      patchTicket(current.id, { status: "em_atendimento", assigned_to_name: targetName });
      await base44.functions.invoke("ticketOps", { action: "transfer_ticket", ticket_id: current.id, target_user_id: transferTarget });
      setTransferTarget("");
      await onChanged();
      clearTicketPatch(current.id);
    } finally {
      setStaffActionBusy(false);
    }
  };

  const addNote = async () => {
    const content = noteDraft.trim();
    if (!content || addingNote) return;
    setAddingNote(true);
    try {
      await base44.entities.StaffNote.create({ ticket_id: current.id, content, author_name: staffName });
      setNoteDraft("");
      await loadNotes();
    } finally {
      setAddingNote(false);
    }
  };

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(260px,340px),minmax(0,1fr)]">
      <div className={cn("min-w-0 space-y-3 xl:sticky xl:top-20 xl:self-start", current && "hidden sm:block")}>
        <div className="shrink-0 space-y-2 rounded-xl border border-border/40 bg-secondary/40 p-3">
          <Input
            placeholder={t("painel.tk_search_ph")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("painel.tk_all_status")}</SelectItem>
                {Object.keys(TICKET_STATUS).map((k) => (
                  <SelectItem key={k} value={k}>{t(`ticket.status_${k}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("painel.tk_all_categories")}</SelectItem>
                {Object.entries(TICKET_CATEGORIES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{t("ticket.category_" + k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <button
            type="button"
            onClick={() => setShowClosed((value) => !value)}
            className={cn("flex h-8 w-full items-center justify-between rounded-lg border px-3 text-[11px] font-semibold transition-colors", showClosed ? "border-primary/35 bg-primary/10 text-primary" : "border-border/50 bg-background/35 text-muted-foreground hover:text-foreground")}
          >
            <span>{showClosed ? "Ocultar tickets fechados" : "Mostrar tickets fechados"}</span>
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px]">{closedCount}</span>
          </button>
        </div>

        {listOrderError && (
          <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200">
            {listOrderError}
          </div>
        )}

        <div
          className="scrollbar-thin max-h-[calc(100dvh-15rem)] overflow-x-hidden overflow-y-auto pr-1 sm:max-h-[56dvh] xl:max-h-[calc(100dvh-210px)]"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={async (event) => {
            if (event.target !== event.currentTarget) return;
            event.preventDefault();
            const draggedId = event.dataTransfer.getData("text/plain") || draggingListId;
            await reorderVisibleTickets(draggedId, "", true);
            setDraggingListId("");
            setListDropTarget(null);
            window.setTimeout(() => { listDraggedRef.current = false; }, 0);
          }}
        >
          {list.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("painel.tk_none")}</p>}
          {list.map((tk) => {
            const status = tk.status || "novo";
            const meta = TICKET_STATUS[status];
            const isDragging = draggingListId === tk.id;
            const before = listDropTarget?.targetId === tk.id && !listDropTarget?.after;
            const after = listDropTarget?.targetId === tk.id && listDropTarget?.after;

            return (
              <React.Fragment key={tk.id}>
                {before && draggingListId !== tk.id && (
                  <div className="mb-2 h-1 rounded-full bg-primary/70 shadow-[0_0_10px_hsl(var(--primary)/.35)]" />
                )}

                <div
                  draggable={!listOrderBusy}
                  onDragStart={(event) => {
                    if (listOrderBusy) {
                      event.preventDefault();
                      return;
                    }
                    listDraggedRef.current = true;
                    setDraggingListId(tk.id);
                    setListDropTarget(null);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", tk.id);
                  }}
                  onDragEnd={() => {
                    window.setTimeout(() => { listDraggedRef.current = false; }, 0);
                    setDraggingListId("");
                    setListDropTarget(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!draggingListId || draggingListId === tk.id) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const isAfter = event.clientY > rect.top + rect.height / 2;
                    setListDropTarget({ targetId: tk.id, after: isAfter });
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const draggedId = event.dataTransfer.getData("text/plain") || draggingListId;
                    await reorderVisibleTickets(draggedId, tk.id, listDropTarget?.after === true);
                    setDraggingListId("");
                    setListDropTarget(null);
                    window.setTimeout(() => { listDraggedRef.current = false; }, 0);
                  }}
                  onClick={() => {
                    if (!listDraggedRef.current && !isDragging) openTicket(tk.id);
                  }}
                  role="button"
                  tabIndex={0}
                  data-no-beat
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && !listOrderBusy) {
                      event.preventDefault();
                      openTicket(tk.id);
                    }
                  }}
                  className={cn(
                    "mb-2 w-full select-none rounded-2xl border p-3 text-left transition-[opacity,transform,border-color,background-color] sm:p-4",
                    listOrderBusy ? "cursor-wait" : "cursor-grab active:cursor-grabbing",
                    selectedId === tk.id ? "border-border/50 bg-primary/5" : "border-border/40 bg-secondary/40 hover:border-border/30",
                    isDragging && "scale-[.985] opacity-40 ring-1 ring-ring"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <GripVertical className="hidden h-4 w-4 shrink-0 text-muted-foreground/55 sm:block" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{tk.subject}</span>
                    {mentionedTicketIds.has(tk.id) && (
                      <span title="Você foi mencionado neste ticket" aria-label="Você foi mencionado neste ticket" className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                        <AtSign className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className={cn("ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", meta.cls)}>{t(`ticket.status_${status}`)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground sm:pl-6">
                    {t("ticket.category_" + (tk.category || "conta"))} · {tk.requester_name || t("common.user")} · {formatLocalDateTime(tk.created_date)}
                  </p>
                  {tk.assigned_to_name && (
                    <p className="mt-1 truncate text-[11px] text-primary sm:pl-6">{t("painel.tk_in_progress", { name: tk.assigned_to_name })}</p>
                  )}
                </div>

                {after && draggingListId !== tk.id && (
                  <div className="-mt-1 mb-2 h-1 rounded-full bg-primary/70 shadow-[0_0_10px_hsl(var(--primary)/.35)]" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className={cn("min-w-0 overflow-hidden rounded-xl border border-border/40 bg-secondary/40 p-3 sm:p-4 md:p-5", !current && "hidden sm:block")}>
        {current ? (
          <div className="flex flex-col">
            <button type="button" onClick={() => setSelectedId(null)} className="mb-3 w-fit rounded-full border border-border/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:hidden">
              Voltar aos tickets
            </button>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {renaming ? (
                <div className="flex w-full min-w-0 basis-full flex-none flex-col gap-2 sm:basis-auto sm:flex-1 sm:flex-row sm:items-center">
                  <Input
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    maxLength={120}
                    autoFocus
                    className="h-11 w-full min-w-0 max-w-full flex-none px-3 text-base font-semibold sm:h-8 sm:flex-1 sm:text-sm sm:max-w-lg"
                    onFocus={(e) => {
                      if (window.innerWidth < 640) {
                        const input = e.currentTarget;
                        window.setTimeout(() => {
                          input?.scrollIntoView({ block: "center", behavior: "smooth" });
                          input?.setSelectionRange?.(input.value.length, input.value.length);
                        }, 120);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); saveRename(); }
                      if (e.key === "Escape") setRenaming(false);
                    }}
                  />
                  <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                    <Button size="icon" className="h-10 w-10 sm:h-8 sm:w-8" onClick={saveRename} disabled={renameBusy || !renameDraft.trim()}>
                      {renameBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-10 w-10 sm:h-8 sm:w-8" onClick={() => setRenaming(false)} disabled={renameBusy}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <h2 className="truncate font-heading text-base font-bold">{current.subject}</h2>
                  <button type="button" onClick={beginRename} disabled={current.deleted === true} title={t("tickets.rename")} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/[0.05] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", (TICKET_STATUS[current.status || "novo"]).cls)}>
                {t(`ticket.status_${current.status || "novo"}`)}
              </span>
              {current.deleted === true && (
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-300">Arquivado</span>
              )}
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                {t("ticket.category_" + (current.category || "conta"))}
              </span>
              {current.requester_user_id ? (
                <UserQuickCard userId={current.requester_user_id} align="end">
                  <button type="button" className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
                    <UserRound className="h-3.5 w-3.5" />
                    {current.requester_name || t("common.user")}
                  </button>
                </UserQuickCard>
              ) : (
                <span className="text-xs text-muted-foreground">{t("painel.tk_by", { name: current.requester_name || t("common.user") })}</span>
              )}
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-card/60 p-3">
              <Select value={current.status || "novo"} onValueChange={changeStatus} disabled={current.deleted === true}>
                <SelectTrigger className="h-8 w-full text-xs sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(TICKET_STATUS).map((k) => (
                    <SelectItem key={k} value={k}>{t(`ticket.status_${k}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={current.priority || "normal"} onValueChange={changePriority} disabled={current.deleted === true}>
                <SelectTrigger className="h-8 w-full text-xs sm:w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("ticket.priority_low")}</SelectItem>
                  <SelectItem value="normal">{t("ticket.priority_normal")}</SelectItem>
                  <SelectItem value="high">{t("ticket.priority_high")}</SelectItem>
                  <SelectItem value="urgent">{t("ticket.priority_urgent")}</SelectItem>
                </SelectContent>
              </Select>
              {!current.assigned_to_name && current.deleted !== true && (
                <Button size="sm" variant="outline" onClick={assignMe} className="h-8 w-full sm:w-auto">
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> {t("painel.tk_assign_me")}
                </Button>
              )}
              {current.assigned_to_name && (
                <span className="text-xs text-muted-foreground">
                  {t("painel.tk_attendance_label")} <strong className="text-foreground">{current.assigned_to_name}</strong>
                </span>
              )}
              <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(current.id)} className="h-8 w-full gap-1.5 text-muted-foreground sm:w-auto">
                <Copy className="h-3.5 w-3.5" /> Copiar ID
              </Button>
              <div className="grid basis-full grid-cols-1 gap-2 pt-1 sm:grid-cols-2 xl:flex xl:basis-auto xl:flex-wrap xl:items-center xl:pt-0">
                <Select value={helpTarget} onValueChange={setHelpTarget} disabled={current.deleted === true}>
                  <SelectTrigger className="h-8 w-full text-xs xl:w-44"><SelectValue placeholder="Pedir ajuda a…" /></SelectTrigger>
                  <SelectContent>
                    {staffOptions.map((staff) => <SelectItem key={staff.id} value={staff.id}>{staff.full_name || staff.email || staff.id}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={requestHelp} disabled={!helpTarget || staffActionBusy} className="h-8 w-full gap-1.5 sm:w-auto">
                  {staffActionBusy && helpTarget ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HandHelping className="h-3.5 w-3.5" />} Ajuda
                </Button>
                <Select value={transferTarget} onValueChange={setTransferTarget} disabled={current.deleted === true}>
                  <SelectTrigger className="h-8 w-full text-xs xl:w-44"><SelectValue placeholder={t("tickets.transfer_ph")} /></SelectTrigger>
                  <SelectContent>
                    {staffOptions.map((staff) => <SelectItem key={staff.id} value={staff.id}>{staff.full_name || staff.email || staff.id}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={transferTicket} disabled={!transferTarget || staffActionBusy} className="h-8 w-full gap-1.5 sm:w-auto">
                  <ArrowRightLeft className="h-3.5 w-3.5" /> {t("tickets.transfer")}
                </Button>
              </div>
              {current.deleted === true ? (
                <Button size="sm" onClick={restoreArchived} disabled={staffActionBusy} className="h-8 w-full gap-1.5 sm:ml-auto sm:w-auto">
                  {staffActionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />} Reabrir ticket
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={deleteTicket} className="h-8 w-full gap-1.5 sm:ml-auto sm:w-auto">
                  <Trash2 className="h-3.5 w-3.5" /> {t("tickets.archive")}
                </Button>
              )}
            </div>

            {(current.status === "fechado" || current.deleted === true) && (
              <div className="mb-3 rounded-xl border border-border/40 bg-card/60 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Motivo do fechamento / arquivamento</p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-medium">
                  {current.delete_reason || current.close_reason || "Sem motivo registrado (ticket antigo)."}
                </p>
                {(current.deleted_by_name || current.closed_by_name || current.deleted_at || current.closed_at) && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {current.deleted_by_name || current.closed_by_name || "Staff"}
                    {(current.deleted_at || current.closed_at) ? ` · ${formatLocalDateTime(current.deleted_at || current.closed_at)}` : ""}
                  </p>
                )}
              </div>
            )}

            {(current.status === "fechado" || current.deleted === true) && (
              <div className="mb-3 rounded-xl border border-amber-300/20 bg-amber-400/[0.07] px-3 py-2 text-[11px] text-amber-100/90">
                Visualização em somente leitura. Você pode consultar todo o histórico sem reabrir o ticket; use os controles acima quando quiser reabrir.
              </div>
            )}

            <div>
              <TicketThread
                ticket={current}
                user={user}
                staffMode
                onStaffReply={onChanged}
                readOnly={current.deleted === true || current.status === "fechado"}
                onMentionSeen={markMentionSeen}
              />
            </div>

            <div className="mt-3 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-card/60">
              <div className="flex items-center justify-between border-b border-border/40 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" /> {t("painel.tk_notes")}
                </p>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{notes?.length || 0}</span>
              </div>

              <div className="scrollbar-thin max-h-[190px] min-h-[74px] overflow-y-auto px-3 py-2">
                {notes === null && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {notes && notes.length === 0 && (
                  <p className="py-3 text-center text-xs text-muted-foreground">{t("painel.tk_notes_empty")}</p>
                )}
                {notes && notes.length > 0 && (() => {
                  const groups = [];
                  for (const note of notes) {
                    const day = new Date(note.created_date || 0).toLocaleDateString("pt-BR");
                    const key = `${note.author_name || "Staff"}::${day}`;
                    const previous = groups[groups.length - 1];
                    if (previous?.key === key) previous.items.push(note);
                    else groups.push({ key, author: note.author_name || "Staff", day, items: [note] });
                  }
                  return groups.map((group) => (
                    <div key={group.key} className="mb-2 overflow-hidden rounded-lg border border-border/35 bg-secondary/35 last:mb-0">
                      <div className="flex items-center justify-between gap-2 border-b border-border/30 px-2.5 py-1.5">
                        <span className="truncate text-[10px] font-bold text-foreground">{group.author}</span>
                        <span className="shrink-0 text-[9px] text-muted-foreground">{group.day} · {group.items.length}</span>
                      </div>
                      <div className="divide-y divide-border/25">
                        {group.items.map((n) => (
                          <div key={n.id} className="px-2.5 py-1.5">
                            <div className="flex items-start gap-2">
                              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[11px] leading-4">{n.content}</p>
                              <span className="shrink-0 text-[9px] text-muted-foreground">{formatLocalDateTime(n.created_date).split(",").pop()?.trim() || ""}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>

              <div className="border-t border-border/40 bg-background/35 p-2.5">
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
                  <Textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    rows={2}
                    placeholder={t("painel.tk_note_ph")}
                    className="min-h-[64px] text-xs"
                  />
                  <Button size="sm" variant="secondary" onClick={addNote} disabled={addingNote || !noteDraft.trim()} className="h-9 shrink-0">
                    {addingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-[200px] place-items-center text-sm text-muted-foreground">
            {t("painel.tk_select")}
          </div>
        )}
      </div>

      <TicketSupportAi ticket={current} user={user} />
    </div>
  );
}