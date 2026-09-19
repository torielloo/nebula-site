import React, { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { formatLocalDateTime } from "@/lib/time";
import {
  ShieldCheck,
  User as UserIcon,
  UserCheck,
  Loader2,
  Radio,
  Tag,
  Flag,
  Clock,
  Reply,
  Pencil,
  Trash2,
  X,
  Check,
  Pin,
  PhoneCall,
  PhoneOff,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { TICKET_STATUS, TICKET_CATEGORIES } from "@/lib/ticketMeta";
import TicketComposer from "@/components/tickets/TicketComposer";
import MessageAttachments, { LinkifiedText } from "@/components/tickets/MessageAttachments";
import UserQuickCard from "@/components/users/UserQuickCard";
import ProfileAvatar from "@/components/ProfileAvatar";
import MentionMenu from "@/components/users/MentionMenu";
import useMentionComposer from "@/hooks/useMentionComposer";
import { useCall } from "@/lib/CallContext";
import { useCallPresence } from "@/lib/callPresence";
import PrivateCallPanel from "@/components/calls/PrivateCallPanel";

const sortMessagesOldestFirst = (rows = []) => [...rows].sort((a, b) => {
  // Mensagem otimista recém-enviada fica sempre no final imediatamente.
  if (a._optimistic && !b._optimistic) return 1;
  if (!a._optimistic && b._optimistic) return -1;

  // message_order é a fonte canônica da sequência do ticket.
  // Usar timestamp antes disso fazia a mensagem recém-confirmada "pular"
  // temporariamente para cima até o próximo refresh/realtime.
  const aOrder = Number(a.message_order);
  const bOrder = Number(b.message_order);
  const aHasOrder = Number.isFinite(aOrder) && aOrder > 0;
  const bHasOrder = Number.isFinite(bOrder) && bOrder > 0;
  if (aHasOrder && bHasOrder && aOrder !== bOrder) return aOrder - bOrder;
  if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;

  const aTime = new Date(a.created_date || a.created_at || 0).getTime() || 0;
  const bTime = new Date(b.created_date || b.created_at || 0).getTime() || 0;
  if (aTime !== bTime) return aTime - bTime;
  return String(a.id || "").localeCompare(String(b.id || ""));
});

export default function TicketThread({ ticket, user, staffMode, onStaffReply, onCloseTicket, onMentionSeen, readOnly = false }) {
  const { t } = useI18n();
  const { channel, setChannel, leave: leaveCall } = useCall();
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [actionBusy, setActionBusy] = useState(null);
  const [avatarMap, setAvatarMap] = useState({});
  const [mentionUsers, setMentionUsers] = useState([]);
  const [ticketCallOpen, setTicketCallOpen] = useState(false);
  const [ticketCallBusy, setTicketCallBusy] = useState(false);
  const [ticketCallError, setTicketCallError] = useState("");
  const [actionError, setActionError] = useState("");
  const deletedMessageIdsRef = useRef(new Set());
  const scrollRef = useRef(null);
  const mention = useMentionComposer({
    value: draft,
    onChange: setDraft,
    scopeUsers: mentionUsers.length ? mentionUsers : null,
    limit: 50,
    searchContextType: "ticket",
    searchContextId: ticket.id,
  });

  useEffect(() => {
    setDraft("");
    setAttachments([]);
    setSendError("");
    setReplyTo(null);
    setEditingId(null);
    setTicketCallOpen(false);
    setTicketCallError("");
    setActionError("");
    deletedMessageIdsRef.current = new Set();
    onMentionSeen?.(ticket.id);
    base44.functions.invoke("ticketOps", { action: "mark_ticket_mentions_seen", ticket_id: ticket.id }).catch(() => {});
  }, [ticket.id]);

  const load = async ({ preserveOnError = false } = {}) => {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await base44.functions.invoke("ticketOps", { action: "list_messages", ticket_id: ticket.id });
        setMessages((current) => {
          const currentRows = current || [];
          const serverRows = (res.data?.messages || []).map((row) => {
            if (deletedMessageIdsRef.current.has(row.id)) {
              return { ...row, deleted: true, message: "", attachments: [], _optimistic: false };
            }
            return { ...row, _optimistic: false };
          });
          const pending = currentRows.filter((m) => m._optimistic && !serverRows.some((row) => row.client_request_id && row.client_request_id === m.client_request_id));
          return sortMessagesOldestFirst([...serverRows, ...pending]);
        });
        return true;
      } catch (error) {
        lastError = error;
        if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    }
    if (!preserveOnError) setMessages([]);
    throw lastError || new Error("Falha ao carregar histórico");
  };

  useEffect(() => {
    setMessages(null);
    load().catch(() => setMessages([]));

    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") load({ preserveOnError: true }).catch(() => {});
    }, 4000);

    const unsubMsgs = base44.entities.TicketMessage.subscribe((event) => {
      const d = event && event.data;
      if (!d || d.ticket_id !== ticket.id) return;
      setMessages((prev) => {
        if (!prev) return prev;
        if (event.type === "create") {
          if (prev.some((m) => m.id === d.id)) return prev;
          if (d.client_request_id) {
            const optimisticIndex = prev.findIndex((m) => m._optimistic && m.client_request_id === d.client_request_id);
            if (optimisticIndex >= 0) {
              const next = [...prev];
              const optimisticRow = next[optimisticIndex];
              next[optimisticIndex] = { ...d, message_order: Number(d.message_order) || optimisticRow?.message_order, _optimistic: false };
              return sortMessagesOldestFirst(next);
            }
          }
          return sortMessagesOldestFirst([...prev, d]);
        }
        if (event.type === "update") {
          return sortMessagesOldestFirst(prev.map((m) => {
            if (m.id !== d.id) return m;
            if (deletedMessageIdsRef.current.has(d.id)) {
              return { ...m, ...d, deleted: true, message: "", attachments: [] };
            }
            return { ...m, ...d };
          }));
        }
        if (event.type === "delete") return prev.filter((m) => m.id !== d.id);
        return prev;
      });
    });

    return () => {
      window.clearInterval(poll);
      unsubMsgs();
    };
  }, [ticket.id]);

  const orderedMessages = messages ? sortMessagesOldestFirst(messages) : null;
  const msgCount = orderedMessages ? orderedMessages.length : 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgCount]);

  useEffect(() => {
    let cancelled = false;
    base44.functions.invoke("userDirectory", { action: "ticket_directory", context_id: ticket.id })
      .then((res) => {
        if (cancelled) return;
        setMentionUsers(res.data?.users || []);
      })
      .catch(() => setMentionUsers([]));
    return () => { cancelled = true; };
  }, [ticket.id]);

  useEffect(() => {
    const ids = [...new Set([ticket.requester_user_id, ...(orderedMessages || []).map((m) => m.author_id)].filter(Boolean))].filter((id) => !avatarMap[id]);
    if (!ids.length) return;
    let cancelled = false;
    Promise.all(ids.slice(0, 20).map((id) => base44.functions.invoke("userDirectory", { action: "profile", user_id: id }).then((res) => [id, res.data?.profile?.avatar_url || ""]).catch(() => [id, ""]))).then((pairs) => {
      if (cancelled) return;
      setAvatarMap((current) => ({ ...current, ...Object.fromEntries(pairs) }));
    });
    return () => { cancelled = true; };
  }, [ticket.requester_user_id, msgCount]);

  const status = ticket.status || "novo";
  const meta = TICKET_STATUS[status] || TICKET_STATUS.novo;
  const closed = status === "fechado";
  const callLocked = readOnly || closed || ticket.deleted === true;
  const composerLocked = readOnly || (closed && !staffMode);
  const categoryKey = ticket.category && TICKET_CATEGORIES[ticket.category] ? ticket.category : "conta";
  const pinnedMessage = (orderedMessages || []).find((m) => m.pinned && !m.deleted) || null;
  const inThisTicketCall = Boolean(channel?.ticketCall && channel?.ticketId === ticket.id);
  const ticketCallChannel = {
    name: `Ticket · ${ticket.subject || ticket.id}`,
    code: `TKT-${ticket.id}`,
    ticketCall: true,
    ticketId: ticket.id,
    ticketStaffMode: Boolean(staffMode),
    ticketRequesterName: ticket.requester_name || t("common.user"),
  };
  const ticketCallRoster = useCallPresence(callLocked ? null : ticketCallChannel.code);
  const ticketCallCount = ticketCallRoster.length;

  useEffect(() => {
    // Ao voltar para um ticket cuja call continua ativa, reabre a interface.
    if (inThisTicketCall) setTicketCallOpen(true);
    else setTicketCallOpen(false);
  }, [inThisTicketCall, ticket.id]);

  useEffect(() => {
    // Se o ticket fechar enquanto esta call estiver ativa, encerra a sessão
    // imediatamente. Ticket fechado nunca pode manter ou abrir canal de voz.
    if (callLocked && inThisTicketCall) {
      setTicketCallOpen(false);
      leaveCall?.();
    }
  }, [callLocked, inThisTicketCall, leaveCall]);

  useEffect(() => {
    const reopen = (event) => {
      const targetId = String(event?.detail?.ticketId || "");
      if (inThisTicketCall && (!targetId || targetId === String(ticket.id))) setTicketCallOpen(true);
    };
    window.addEventListener("nebula:open-ticket-call", reopen);
    return () => window.removeEventListener("nebula:open-ticket-call", reopen);
  }, [inThisTicketCall, ticket.id]);

  const joinTicketCall = async () => {
    if (ticketCallBusy || callLocked) return;
    setTicketCallError("");
    if (inThisTicketCall) {
      setTicketCallOpen(true);
      return;
    }
    if (channel && !window.confirm("Você já está em outra call. Entrar na call deste ticket vai encerrar a call atual. Continuar?")) return;
    setTicketCallBusy(true);
    try {
      await setChannel(ticketCallChannel);
      setTicketCallOpen(true);
    } catch (error) {
      setTicketCallError(error?.message || "Não foi possível entrar na call deste ticket.");
    } finally {
      setTicketCallBusy(false);
    }
  };

  const send = async () => {
    const content = draft.trim();
    if ((!content && attachments.length === 0) || composerLocked) return;
    const normalizedContent = content.toLocaleLowerCase("pt-BR");
    const typedMentions = mentionUsers.filter((candidate) => {
      const names = [candidate?.name, candidate?.username]
        .filter(Boolean)
        .map((value) => String(value).replace(/^@+/, "").trim().toLocaleLowerCase("pt-BR"))
        .filter(Boolean);
      return names.some((name) => normalizedContent.includes(`@${name}`));
    });
    const mentionedUsers = [...mention.mentionedUsers, ...typedMentions]
      .filter((candidate, index, rows) => candidate?.id && rows.findIndex((item) => item?.id === candidate.id) === index)
      .slice(0, 5)
      .map((candidate) => ({ id: candidate.id, name: candidate.name || candidate.username || "Usuário" }));
    const attachmentSnapshot = [...attachments];
    const replySnapshot = replyTo;
    const requestId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tempId = `optimistic-${requestId}`;
    const currentMaxOrder = (messages || []).reduce((max, row) => {
      const value = Number(row.message_order);
      return Number.isFinite(value) && value > max ? value : max;
    }, (messages || []).length);
    const optimistic = {
      id: tempId,
      ticket_id: ticket.id,
      author_id: user.id,
      author_role: user.role || "user",
      author_name: staffMode ? `${user.profile?.display_name || user.full_name || (user.email || "Staff").split("@")[0]} · Staff` : (user.profile?.display_name || user.full_name || user.email || "Usuário"),
      is_staff: !!staffMode,
      message: content || (attachmentSnapshot.length ? `${attachmentSnapshot[0]?.type === "audio" ? "Áudio" : "Anexo"} enviado` : ""),
      attachments: attachmentSnapshot,
      mentions: mentionedUsers,
      reply_to_id: replySnapshot?.id || "",
      reply_author_name: replySnapshot?.author_name || "",
      reply_preview: replySnapshot?.message || "",
      created_date: new Date().toISOString(),
      edited: false,
      deleted: false,
      client_request_id: requestId,
      message_order: currentMaxOrder + 1,
      _client_sent_at: new Date().toISOString(),
      _optimistic: true,
    };

    setSendError("");
    flushSync(() => {
      setMessages((prev) => sortMessagesOldestFirst([...(prev || []), optimistic]));
      setDraft("");
      setAttachments([]);
      setReplyTo(null);
      mention.clear();
    });
    window.requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });

    try {
      const res = await base44.functions.invoke("ticketOps", {
        action: "send_message",
        ticket_id: ticket.id,
        message: content,
        attachments: attachmentSnapshot,
        mentions: mentionedUsers,
        reply_to_id: replySnapshot?.id || undefined,
        client_request_id: requestId,
      });
      const created = res.data?.message;
      if (created) {
        setMessages((prev) => {
          const optimisticRow = (prev || []).find((m) => m.id === tempId);
          const next = (prev || []).filter((m) => m.id !== tempId && m.id !== created.id);
          return sortMessagesOldestFirst([...next, { ...created, message_order: Number(created.message_order) || optimisticRow?.message_order, _optimistic: false }]);
        });
      } else {
        setMessages((prev) => (prev || []).filter((m) => m.id !== tempId));
      }
      // As menções de ticket já são persistidas atomicamente pelo ticketOps.
      // Não dispare processMentions novamente aqui: isso evitava corridas que
      // faziam uma menção antiga reaparecer depois de o ticket já ter sido visto.
      if (staffMode) Promise.resolve(onStaffReply?.()).catch(() => {});
    } catch (err) {
      setMessages((prev) => (prev || []).filter((m) => m.id !== tempId));
      setDraft((current) => current.trim() ? current : content);
      setAttachments((current) => current.length ? current : attachmentSnapshot);
      setSendError(err?.response?.data?.error || err?.message || t("ticket.send_error"));
    }
  };

  const beginEdit = (m) => {
    setEditingId(m.id);
    setEditDraft(m.message || "");
  };

  const saveEdit = async (m) => {
    const message = editDraft.trim();
    if (!message || actionBusy) return;
    setActionBusy(`edit:${m.id}`);
    try {
      const res = await base44.functions.invoke("ticketOps", {
        action: "edit_message",
        ticket_id: ticket.id,
        message_id: m.id,
        message,
      });
      const updated = res.data?.message;
      if (updated) setMessages((prev) => (prev || []).map((row) => row.id === updated.id ? { ...row, ...updated } : row));
      setEditingId(null);
      setEditDraft("");
    } finally {
      setActionBusy(null);
    }
  };

  const removeMessage = async (m) => {
    if (actionBusy || !m || m.deleted || !window.confirm(t("ticket.delete_confirm"))) return;
    const previousRow = { ...m };
    setActionBusy(`delete:${m.id}`);
    setActionError("");
    deletedMessageIdsRef.current.add(m.id);

    // Remove visualmente na hora. Como mensagens apagadas nunca são restauradas,
    // mantemos um tombstone local para nenhum poll/realtime atrasado reviver a linha.
    setMessages((prev) => (prev || []).map((row) => {
      if (row.id === m.id) return { ...row, deleted: true, message: "", attachments: [] };
      if (row.reply_to_id === m.id || row.reply_to_message_id === m.id) return { ...row, reply_preview: "Mensagem original removida." };
      return row;
    }));
    if (replyTo?.id === m.id) setReplyTo(null);

    try {
      let response = null;
      let lastError = null;

      // A rota é idempotente, então retries são seguros. Isso evita o caso
      // em que a gravação conclui mas a resposta HTTP se perde/atrasa.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          response = await base44.functions.invoke("ticketOps", {
            action: "delete_message",
            ticket_id: ticket.id,
            message_id: m.id,
          });
          if (response?.data?.ok) break;
        } catch (error) {
          lastError = error;
          const status = Number(error?.response?.status || error?.status || 0);
          // Erro de permissão é definitivo; não adianta retry.
          if (status === 403) throw error;
          await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
        }
      }

      if (!response?.data?.ok) {
        // Antes de desfazer a UI, consulta a verdade do servidor. Se a
        // mensagem já ficou apagada, mantém o tombstone e não "ressuscita".
        try {
          const verify = await base44.functions.invoke("ticketOps", {
            action: "list_messages",
            ticket_id: ticket.id,
          });
          const serverRow = (verify?.data?.messages || []).find((row) => row.id === m.id);
          if (!serverRow || serverRow.deleted === true) {
            response = { data: { ok: true, message: serverRow || { ...m, deleted: true, message: "", attachments: [] } } };
          }
        } catch {}
      }

      if (!response?.data?.ok) {
        throw lastError || new Error("Não foi possível confirmar a exclusão da mensagem.");
      }

      const removed = response.data?.message || { ...m, deleted: true, message: "", attachments: [] };
      deletedMessageIdsRef.current.add(m.id);
      setMessages((prev) => (prev || []).map((row) => {
        if (row.id === m.id) return { ...row, ...removed, deleted: true, message: "", attachments: [] };
        if (row.reply_to_id === m.id || row.reply_to_message_id === m.id) return { ...row, reply_preview: "Mensagem original removida." };
        return row;
      }));

      // Confirma novamente em segundo plano para limpar qualquer cache/realtime
      // atrasado sem devolver a mensagem à tela.
      window.setTimeout(() => {
        load({ preserveOnError: true }).catch(() => {});
      }, 600);
    } catch (error) {
      const status = Number(error?.response?.status || error?.status || 0);
      if (status === 403) {
        deletedMessageIdsRef.current.delete(m.id);
        setMessages((prev) => (prev || []).map((row) => row.id === m.id ? previousRow : row));
      }
      setActionError(error?.response?.data?.error || error?.message || "Não foi possível apagar a mensagem.");
    } finally {
      setActionBusy(null);
    }
  };

  const togglePin = async (m) => {
    if (!m || m.deleted || actionBusy) return;
    setActionBusy(`pin:${m.id}`);
    try {
      const res = await base44.functions.invoke("ticketOps", {
        action: "pin_message",
        ticket_id: ticket.id,
        message_id: m.id,
        pinned: !m.pinned,
      });
      const updated = res.data?.message;
      const unpinnedIds = new Set(res.data?.unpinned_ids || []);
      setMessages((prev) => (prev || []).map((row) => {
        if (unpinnedIds.has(row.id)) return { ...row, pinned: false, pinned_at: null, pinned_by: "", pinned_by_name: "" };
        if (updated && row.id === updated.id) return { ...row, ...updated };
        return row;
      }));
    } finally {
      setActionBusy(null);
    }
  };

  const renderBubble = (m) => {
    const own = (m.author_id || m.created_by_id) === user?.id;
    const canEdit = own && !m.deleted;
    const canDelete = !m.deleted && (own || staffMode);
    const canReply = !m.deleted;
    const canPin = !m.deleted && (own || staffMode);
    const editing = editingId === m.id;
    const hasMention = Array.isArray(m.mentions) && m.mentions.length > 0;
    const mentionsMe = hasMention && m.mentions.some((mention) => mention?.id === user?.id);
    const replyId = m.reply_to_message_id || m.reply_to_id;
    const originalReply = replyId ? (messages || []).find((row) => row.id === replyId) : null;
    const replyRemoved = !!originalReply?.deleted || m.reply_preview === "Mensagem original removida." || m.reply_preview === t("ticket.removed_original");
    return (
      <div className={cn(
        "min-w-0 max-w-full flex-1 overflow-hidden rounded-lg rounded-tl-sm border px-2.5 py-1.5 transition-colors",
        mentionsMe
          ? "border-amber-300/35 bg-amber-400/[0.12] shadow-[inset_3px_0_0_rgba(251,191,36,0.72)]"
          : m.is_staff
            ? "border-primary/25 bg-primary/10"
            : "border-border/50 bg-card"
      )}> 
        <div className="flex items-center gap-2">
          {m.is_staff ? <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" /> : <UserIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          {m.author_id ? (
            <UserQuickCard userId={m.author_id} align="start">
              <button type="button" className="truncate text-left text-xs font-bold hover:underline">{m.author_name}</button>
            </UserQuickCard>
          ) : (
            <p className="truncate text-xs font-bold">{m.author_name}</p>
          )}
          {m.edited_at && <span className="text-[9px] text-muted-foreground">editada</span>}
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{formatLocalDateTime(m.created_date)}</span>
        </div>

        {replyId && (
          <button
            type="button"
            disabled={!originalReply || replyRemoved}
            onClick={() => {
              const el = document.getElementById(`ticket-message-${replyId}`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="mt-1.5 block w-full rounded-lg border-l-2 border-white/25 bg-white/[0.035] px-2.5 py-1.5 text-left disabled:cursor-default"
          >
            <p className="text-[10px] font-bold text-muted-foreground">{t("ticket.replying_to", { name: m.reply_author_name || t("dm.message_word") })}</p>
            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground/80">{replyRemoved ? t("ticket.removed_original") : (m.reply_preview || t("ticket.previous_message"))}</p>
          </button>
        )}

        {m.deleted ? (
          <div className="mt-1.5 rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-xs italic text-muted-foreground">{t("ticket.removed")}</div>
        ) : editing ? (
          <div className="mt-1.5 flex items-center gap-2">
            <Input value={editDraft} onChange={(e) => setEditDraft(e.target.value)} className="h-9 text-xs" autoFocus onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveEdit(m); } if (e.key === "Escape") setEditingId(null); }} />
            <Button size="icon" className="h-9 w-9" onClick={() => saveEdit(m)} disabled={!editDraft.trim() || !!actionBusy}><Check className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
          </div>
        ) : (
          <>
            {m.message && <LinkifiedText text={m.message} mentions={m.mentions || []} className="mt-1" />}
            <MessageAttachments attachments={m.attachments} ticketId={ticket.id} />
          </>
        )}

        {!editing && (
          <div className="mt-1 flex flex-wrap items-center gap-0.5 border-t border-white/[0.05] pt-0.5">
            {canReply && <button type="button" onClick={() => setReplyTo(m)} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"><Reply className="h-3 w-3" />Responder</button>}
            {canEdit && <button type="button" onClick={() => beginEdit(m)} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"><Pencil className="h-3 w-3" />Editar</button>}
            {canPin && <button type="button" onClick={() => togglePin(m)} disabled={actionBusy === `pin:${m.id}`} className={cn("flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold hover:bg-white/[0.05] disabled:opacity-50", m.pinned ? "text-primary" : "text-muted-foreground hover:text-foreground")}>{actionBusy === `pin:${m.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pin className="h-3 w-3" />}{m.pinned ? "Desfixar" : "Fixar"}</button>}
            {canDelete && <button type="button" onClick={() => removeMessage(m)} disabled={actionBusy === `delete:${m.id}`} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-foreground disabled:opacity-50">{actionBusy === `delete:${m.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}{t("ticket.delete")}</button>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="shrink-0 rounded-2xl border border-border/50 bg-gradient-to-r from-accent/50 to-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider", meta.cls)}>{t(`ticket.status_${status}`)}</span>
          <span className="flex items-center gap-1 rounded-full bg-secondary/70 px-2.5 py-1 text-[10px] font-bold text-muted-foreground"><Tag className="h-3 w-3" /> {t("ticket.category_" + categoryKey)}</span>
          <span className="flex items-center gap-1 rounded-full bg-secondary/70 px-2.5 py-1 text-[10px] font-bold text-muted-foreground"><Flag className="h-3 w-3" /> {t("ticket.priority_label", { priority: t("ticket.priority_" + (ticket.priority || "normal")) })}</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400"><Radio className="h-3 w-3" /> {t("ticket.realtime")}</span>
          {staffMode && !callLocked && (
            <>
              <Button
                type="button"
                variant={inThisTicketCall ? "secondary" : "outline"}
                size="sm"
                onClick={joinTicketCall}
                disabled={ticketCallBusy}
                className={cn("h-8 rounded-full px-3 text-[11px] font-bold", inThisTicketCall ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/20 bg-background/60")}
              >
                {ticketCallBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="mr-1.5 h-3.5 w-3.5" />}
                {inThisTicketCall ? "Abrir call do ticket" : "Entrar na call"}
              </Button>
              {ticketCallCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {ticketCallCount} na chamada
                </span>
              )}
            </>
          )}
          {staffMode && !callLocked && inThisTicketCall && (
            <Button type="button" variant="outline" size="sm" onClick={leaveCall} className="h-8 rounded-full border-destructive/30 bg-destructive/5 px-3 text-[11px] font-bold text-destructive">
              <PhoneOff className="mr-1.5 h-3.5 w-3.5" /> Sair da call
            </Button>
          )}
          {onCloseTicket && <Button variant="outline" size="sm" onClick={onCloseTicket} className="h-8 rounded-full border-white/20 bg-background/60 px-3 text-[11px] font-bold">{t("ticket.close")}</Button>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><UserIcon className="h-3 w-3" /> {ticket.requester_name || t("common.user")}</span>
          <span className="flex items-center gap-1.5"><UserCheck className="h-3 w-3" />{ticket.assigned_to_name ? t("ticket.assigned", { name: ticket.assigned_to_name }) : t("ticket.no_assignee")}</span>
          <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {formatLocalDateTime(ticket.created_date)}</span>
        </div>
      </div>

      {ticketCallError && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">{ticketCallError}</p>}
      {actionError && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">{actionError}</p>}

      {!staffMode && !callLocked && (
        <div className={cn("flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center", inThisTicketCall ? "border-emerald-500/25 bg-emerald-500/[0.07]" : "border-primary/20 bg-primary/[0.04]")}>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold">{inThisTicketCall ? "Call deste ticket ativa" : "Call com a equipe de atendimento"}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{inThisTicketCall ? "A call continua conectada. Você pode voltar para ela a qualquer momento." : "Entre na sala privada deste ticket para falar com a Staff por voz, câmera ou compartilhamento de tela."}</p>
            {ticketCallCount > 0 && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {ticketCallCount} {ticketCallCount === 1 ? "participante na chamada" : "participantes na chamada"}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" size="sm" onClick={joinTicketCall} disabled={ticketCallBusy} className="h-9 rounded-full px-4 text-xs font-bold">
              {ticketCallBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="mr-1.5 h-3.5 w-3.5" />}
              {inThisTicketCall ? "Voltar para a call" : "Entrar na call"}
            </Button>
            {inThisTicketCall && <Button type="button" size="sm" variant="outline" onClick={leaveCall} className="h-9 rounded-full border-destructive/30 px-4 text-xs font-bold text-destructive"><PhoneOff className="mr-1.5 h-3.5 w-3.5" />Sair</Button>}
          </div>
        </div>
      )}

      {inThisTicketCall && ticketCallOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[90] flex min-h-0 flex-col bg-[#050505] text-foreground">
          <div className="safe-area-top flex shrink-0 items-center gap-3 border-b border-white/[0.08] bg-black/95 px-3 pb-3 pt-2 shadow-xl backdrop-blur-xl sm:px-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300"><PhoneCall className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold">Call do ticket · {ticket.subject}</p>
              <p className="truncate text-[11px] text-muted-foreground">{staffMode ? `Com ${ticket.requester_name || "usuário do ticket"}` : "Com a equipe de atendimento"} · até 12 participantes</p>
            </div>
            <button type="button" onClick={() => setTicketCallOpen(false)} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-foreground hover:bg-white/[0.08]" title="Minimizar e voltar ao ticket">
              <Minimize2 className="h-4 w-4" />
              Ticket
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:p-3">
            <PrivateCallPanel partner={{ name: staffMode ? (ticket.requester_name || "usuário do ticket") : "Staff do atendimento" }} />
          </div>
        </div>,
        document.body
      )}

      {pinnedMessage && (
        <button
          type="button"
          onClick={() => document.getElementById(`ticket-message-${pinnedMessage.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className="flex w-full items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2 text-left hover:bg-primary/[0.09]"
        >
          <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-primary">{t("ticket.pinned")}</p>
            <p className="truncate text-[11px] text-muted-foreground">{pinnedMessage.author_name}: {pinnedMessage.message || (pinnedMessage.attachments?.length ? t("ticket.attachment") : t("ticket.message"))}</p>
          </div>
        </button>
      )}

      <div ref={scrollRef} className="scrollbar-thin min-h-[320px] flex-1 space-y-2 overflow-y-auto overscroll-contain rounded-2xl border border-border/50 bg-secondary/30 p-2.5 pr-2 md:p-3 md:pr-2.5 lg:h-[calc(100dvh-455px)] lg:max-h-[680px] lg:min-h-[400px] lg:flex-none">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex items-start gap-2">
          <ProfileAvatar name={ticket.requester_name || t("common.user")} avatar={avatarMap[ticket.requester_user_id]} size="sm" />
          <div className="min-w-0 max-w-full flex-1 overflow-hidden rounded-lg rounded-tl-sm border border-border/50 bg-card px-2.5 py-1.5">
            <div className="flex items-center gap-2">
              {ticket.requester_user_id ? (
                <UserQuickCard userId={ticket.requester_user_id} align="start">
                  <button type="button" className="truncate text-left text-xs font-bold hover:underline">{ticket.requester_name || t("common.user")}</button>
                </UserQuickCard>
              ) : (
                <p className="truncate text-xs font-bold">{ticket.requester_name || t("common.user")}</p>
              )}
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-primary">{t("ticket.original")}</span>
            </div>
            {ticket.description && <LinkifiedText text={ticket.description} className="mt-1" />}
            <MessageAttachments attachments={ticket.attachments} ticketId={ticket.id} />
            <p className="mt-1 text-[10px] text-muted-foreground">{formatLocalDateTime(ticket.created_date)}</p>
          </div>
        </motion.div>

        {messages === null && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        <AnimatePresence initial={false}>
          {orderedMessages && orderedMessages.map((m) => (
            <motion.div id={`ticket-message-${m.id}`} key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex scroll-mt-6 items-start gap-2">
              <ProfileAvatar name={m.author_name || t("common.user")} avatar={avatarMap[m.author_id]} size="sm" className={cn(m.is_staff && "ring-1 ring-primary/40 rounded-full")} />
              {renderBubble(m)}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {!composerLocked ? (
        <div className="shrink-0 space-y-2">
          {replyTo && (
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2">
              <Reply className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="min-w-0 flex-1"><p className="text-[10px] font-bold">Respondendo a {replyTo.author_name}</p><p className="truncate text-[11px] text-muted-foreground">{replyTo.message}</p></div>
              <button type="button" onClick={() => setReplyTo(null)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-white/[0.05]"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          {sendError && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">{sendError}</p>}
          {staffMode && closed && (
            <p className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
              {t("ticket.closed_reply_hint")}
            </p>
          )}
          <div className="relative">
            <MentionMenu open={mention.open} matches={mention.matches} active={mention.active} onActive={mention.setActive} onPick={mention.pick} className="left-3" userGroupLabel="Usuário do ticket" />
            <TicketComposer value={draft} onChange={mention.update} onSend={send} sending={sending} placeholder={staffMode ? t("ticket.reply_staff_ph") : t("ticket.reply_ph")} attachments={attachments} onAttachmentsChange={setAttachments} onKeyDown={(event) => mention.keyDown(event, send)} />
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-border/50 bg-secondary/40 px-3 py-2.5 text-xs text-muted-foreground">{t("ticket.closed")}</p>
      )}
    </div>
  );
}
