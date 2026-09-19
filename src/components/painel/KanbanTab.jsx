import React, { useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Loader2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { logStaffAction } from "@/lib/ticketMeta";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const COLUMNS = [
  { id: "novo", label: "painel.kb_new" },
  { id: "em_atendimento", label: "ticket.status_atendimento" },
  { id: "aguardando_usuario", label: "ticket.status_aguardando" },
  { id: "resolvido", label: "painel.kb_resolved" },
  { id: "fechado", label: "painel.kb_closed" },
];

const STATUS_CLS = {
  novo: "bg-amber-500/15 text-amber-400",
  em_atendimento: "bg-sky-500/15 text-sky-400",
  aguardando_usuario: "bg-violet-500/15 text-violet-400",
  resolvido: "bg-emerald-500/15 text-emerald-400",
  fechado: "bg-slate-500/15 text-slate-400",
};

function sortTickets(list) {
  return [...list].sort((a, b) => {
    const aOrder = Number(a.kanban_order);
    const bOrder = Number(b.kanban_order);
    const aHasOrder = Number.isFinite(aOrder) && aOrder > 0;
    const bHasOrder = Number.isFinite(bOrder) && bOrder > 0;

    if (aHasOrder && bHasOrder && aOrder !== bOrder) return aOrder - bOrder;
    if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;

    const aTime = new Date(a.created_date || 0).getTime() || 0;
    const bTime = new Date(b.created_date || 0).getTime() || 0;
    return bTime - aTime;
  });
}

export default function KanbanTab({ tickets = [], user, onChanged, onOpenTicket }) {
  const { t } = useI18n();
  const [items, setItems] = useState(tickets);
  const [draggingId, setDraggingId] = useState("");
  const [dropTarget, setDropTarget] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [closedSearch, setClosedSearch] = useState("");
  const draggedRef = useRef(false);

  useEffect(() => {
    setItems(tickets || []);
  }, [tickets]);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(COLUMNS.map((column) => [column.id, []]));
    for (const ticket of items) {
      const status = ticket.status || "novo";
      if (!map[status]) map[status] = [];
      map[status].push(ticket);
    }
    for (const column of COLUMNS) map[column.id] = sortTickets(map[column.id] || []);
    return map;
  }, [items]);

  const startDrag = (event, ticket) => {
    if (busyId) {
      event.preventDefault();
      return;
    }

    draggedRef.current = true;
    setDraggingId(ticket.id);
    setError("");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", ticket.id);

    try {
      const rect = event.currentTarget.getBoundingClientRect();
      event.dataTransfer.setDragImage(event.currentTarget, rect.width / 2, 22);
    } catch {}
  };

  const finishDrag = () => {
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
    setDraggingId("");
    setDropTarget(null);
  };

  const moveTicket = async (ticketId, newStatus, targetId = "", after = false) => {
    if (!ticketId || busyId) return;

    const ticket = items.find((item) => item.id === ticketId);
    if (!ticket) return;

    let reason = "";
    if (newStatus === "fechado" && (ticket.status || "novo") !== "fechado") {
      reason = (window.prompt("Informe o motivo do fechamento do ticket:", "") || "").trim();
      if (!reason) return;
    }

    const oldItems = items;
    const destination = sortTickets(
      items.filter((item) => (item.status || "novo") === newStatus && item.id !== ticketId)
    );

    let insertAt = destination.length;
    if (targetId) {
      const targetIndex = destination.findIndex((item) => item.id === targetId);
      if (targetIndex >= 0) insertAt = targetIndex + (after ? 1 : 0);
    }

    const moved = { ...ticket, status: newStatus };
    destination.splice(Math.max(0, Math.min(insertAt, destination.length)), 0, moved);

    const orderMap = new Map(destination.map((item, index) => [item.id, index + 1]));
    const optimistic = items.map((item) => {
      if (item.id === ticketId) {
        return { ...item, status: newStatus, kanban_order: orderMap.get(item.id) || 1 };
      }
      if ((item.status || "novo") === newStatus && orderMap.has(item.id)) {
        return { ...item, kanban_order: orderMap.get(item.id) };
      }
      return item;
    });

    setItems(optimistic);
    setBusyId(ticketId);
    setError("");

    try {
      await base44.functions.invoke("ticketOps", {
        action: "reorder_ticket",
        ticket_id: ticketId,
        status: newStatus,
        ordered_ids: destination.map((item) => item.id),
        ...(reason ? { reason } : {}),
      });

      await logStaffAction(
        user,
        "ticket_reordenado",
        `Ticket #${ticketId.slice(-4).toUpperCase()} reposicionado no Kanban`,
        ticketId
      ).catch(() => {});

      // A movimentação já foi persistida no backend. Uma falha transitória ao
      // recarregar a lista não pode desfazer visualmente nem reportar a ação como falha.
      window.setTimeout(() => { Promise.resolve(onChanged?.()).catch(() => {}); }, 450);
    } catch (err) {
      setItems(oldItems);
      setError(err?.response?.data?.error || "Não foi possível salvar a posição do ticket.");
    } finally {
      setBusyId("");
    }
  };

  const dropTicket = async (event, columnId, targetId = "", after = false) => {
    event.preventDefault();
    event.stopPropagation();
    const ticketId = event.dataTransfer.getData("text/plain") || draggingId;
    await moveTicket(ticketId, columnId, targetId, after);
    finishDrag();
  };

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const allColumnTickets = grouped[col.id] || [];
          const q = closedSearch.trim().toLocaleLowerCase("pt-BR");
          const columnTickets = col.id === "fechado" && q
            ? allColumnTickets.filter((tk) => String(tk.subject || tk.title || "").toLocaleLowerCase("pt-BR").includes(q))
            : allColumnTickets;
          const columnActive = dropTarget?.column === col.id;

          return (
            <section
              key={col.id}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (!dropTarget || dropTarget.column !== col.id || dropTarget.targetId) {
                  setDropTarget({ column: col.id, targetId: "", after: false });
                }
              }}
              onDrop={(event) => dropTicket(event, col.id)}
              className={cn(
                "flex h-[min(68dvh,640px)] min-h-[320px] flex-col overflow-hidden rounded-xl border bg-secondary/40 p-2 transition-[border-color,background-color,box-shadow]",
                columnActive
                  ? "border-primary/45 bg-primary/[0.035]"
                  : "border-white/10"
              )}
            >
              <div className="shrink-0 px-1 pb-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {t(col.label)}
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-foreground">
                    {col.id === "fechado" ? allColumnTickets.length : columnTickets.length}
                  </span>
                </div>
                {col.id === "fechado" && (
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={closedSearch}
                      onChange={(event) => setClosedSearch(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      placeholder="Pesquisar ticket fechado..."
                      className="h-9 w-full rounded-lg border border-border/50 bg-background/70 pl-8 pr-2 text-[11px] outline-none placeholder:text-muted-foreground focus:border-primary/40"
                    />
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
                {columnTickets.map((tk) => {
                  const isDragging = draggingId === tk.id;
                  const isBusy = busyId === tk.id;
                  const before = dropTarget?.column === col.id && dropTarget?.targetId === tk.id && !dropTarget?.after;
                  const after = dropTarget?.column === col.id && dropTarget?.targetId === tk.id && dropTarget?.after;

                  return (
                    <React.Fragment key={tk.id}>
                      {before && draggingId !== tk.id && (
                        <div className="mb-2 h-1 rounded-full bg-primary/70 shadow-[0_0_10px_hsl(var(--primary)/.35)]" />
                      )}

                      <div
                        draggable={!busyId}
                        onDragStart={(event) => {
                          startDrag(event, tk);
                        }}
                        onDragEnd={finishDrag}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (!draggingId || draggingId === tk.id) return;
                          const rect = event.currentTarget.getBoundingClientRect();
                          const isAfter = event.clientY > rect.top + rect.height / 2;
                          setDropTarget({ column: col.id, targetId: tk.id, after: isAfter });
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(event) => dropTicket(event, col.id, tk.id, dropTarget?.after === true)}
                        onClick={() => {
                          if (!draggedRef.current && !isDragging) onOpenTicket?.(tk.id);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if ((event.key === "Enter" || event.key === " ") && !busyId) {
                            event.preventDefault();
                            onOpenTicket?.(tk.id);
                          }
                        }}
                        className={cn(
                          "group relative mb-2 w-full select-none rounded-lg border border-white/10 bg-card p-3 text-left text-xs transition-[opacity,transform,border-color,background-color,box-shadow] hover:border-white/25 hover:bg-accent/60",
                          busyId ? "cursor-wait" : "cursor-grab active:cursor-grabbing",
                          isDragging && "scale-[.98] opacity-40 ring-1 ring-ring",
                          isBusy && "opacity-70"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/55 transition-colors group-hover:text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold", STATUS_CLS[col.id])}>
                                #{tk.id.slice(-4).toUpperCase()}
                              </span>
                              {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                            </div>
                            <p className="mt-1.5 line-clamp-2 font-semibold">{tk.subject}</p>
                            <p className="mt-1 truncate text-muted-foreground">{tk.requester_name || t("common.user")}</p>
                            {tk.deleted === true ? (
                              <p className="mt-1 text-[10px] font-bold text-red-300">ARQUIVADO</p>
                            ) : (
                              <p className={cn("mt-1 text-[10px] font-bold uppercase", col.id === "fechado" ? "text-slate-300" : "text-muted-foreground")}>{col.id === "fechado" ? "FECHADO" : t(col.label)}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {after && draggingId !== tk.id && (
                        <div className="-mt-1 mb-2 h-1 rounded-full bg-primary/70 shadow-[0_0_10px_hsl(var(--primary)/.35)]" />
                      )}
                    </React.Fragment>
                  );
                })}

                {draggingId && columnActive && !dropTarget?.targetId && (
                  <div className="grid min-h-14 place-items-center rounded-lg border border-dashed border-primary/35 bg-primary/[0.035] text-[10px] font-bold uppercase tracking-wide text-primary">
                    Solte para colocar no final
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Arraste entre colunas ou para cima e para baixo para definir a ordem dos tickets.
      </p>
    </div>
  );
}
