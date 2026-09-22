import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import ProfileAvatar from "@/components/ProfileAvatar";
import UserQuickCard from "@/components/users/UserQuickCard";
import MessageAttachments from "@/components/tickets/MessageAttachments";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, LockKeyhole, MessageSquareText, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLocalTime } from "@/lib/time";

const ownerAuditMediaCache = new Map();
const OWNER_AUDIT_MEDIA_CACHE_MS = 13 * 60 * 1000;
const isPublicMediaUrl = (url) => /^https?:\/\//i.test(String(url || ""));

function partnerLabel(conversation) {
  const metas = Array.isArray(conversation?.participant_meta) ? conversation.participant_meta : [];
  return metas.map((m) => m?.name || "Usuário").filter(Boolean).join(" ↔ ") || "Conversa privada";
}

function groupMessages(messages = []) {
  const groups = [];
  for (const message of messages) {
    const previous = groups[groups.length - 1];
    const prevMessage = previous?.items?.[previous.items.length - 1];
    const currentTime = new Date(message.created_date || 0).getTime();
    const previousTime = new Date(prevMessage?.created_date || 0).getTime();
    const sameSender = previous && previous.sender_id === message.sender_id;
    const closeEnough = sameSender && Number.isFinite(currentTime) && Number.isFinite(previousTime) && currentTime - previousTime < 4 * 60_000;
    if (closeEnough) {
      previous.items.push(message);
    } else {
      groups.push({
        sender_id: message.sender_id,
        sender_name: message.sender_name || "Usuário",
        sender_avatar: message.sender_avatar || "",
        items: [message],
      });
    }
  }
  return groups;
}

export default function OwnerDmAudit() {
  const [conversations, setConversations] = useState(null);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState(null);
  const [query, setQuery] = useState("");
  const [messageQuery, setMessageQuery] = useState("");
  const [messageFilter, setMessageFilter] = useState("all");
  const [error, setError] = useState("");
  const [signedAttachmentUrls, setSignedAttachmentUrls] = useState({});
  const [batchAttachmentSigningFailed, setBatchAttachmentSigningFailed] = useState(false);

  const loadConversations = async () => {
    setError("");
    try {
      let res;
      try {
        res = await base44.functions.invoke("ownerDmAudit", { action: "list_conversations" });
      } catch (firstError) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        res = await base44.functions.invoke("ownerDmAudit", { action: "list_conversations" });
      }
      const list = res.data?.conversations || [];
      setConversations(list);
      if (selected) {
        const refreshed = list.find((item) => item.id === selected.id);
        if (refreshed) setSelected(refreshed);
      }
    } catch (e) {
      setConversations((current) => Array.isArray(current) ? current : []);
      setError(e?.response?.data?.error || "Não foi possível atualizar a auditoria agora. A lista anterior foi preservada.");
    }
  };

  useEffect(() => { loadConversations(); }, []);

  const openConversation = async (conversation) => {
    setSelected(conversation);
    setMessages(null);
    const cachedMedia = ownerAuditMediaCache.get(conversation.id);
    setSignedAttachmentUrls(cachedMedia && cachedMedia.expiresAt > Date.now() ? cachedMedia.urls : {});
    setBatchAttachmentSigningFailed(false);
    setError("");
    try {
      let res;
      try {
        res = await base44.functions.invoke("ownerDmAudit", {
          action: "list_messages",
          conversation_id: conversation.id,
        });
      } catch (firstError) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        res = await base44.functions.invoke("ownerDmAudit", {
          action: "list_messages",
          conversation_id: conversation.id,
        });
      }
      setSelected(res.data?.conversation || conversation);
      setMessages(res.data?.messages || []);
    } catch (e) {
      setMessages([]);
      setError(e?.response?.data?.error || "Não foi possível abrir esta conversa.");
    }
  };

  useEffect(() => {
    if (!selected?.id || !Array.isArray(messages) || !messages.length) return undefined;

    const typeByUri = new Map();
    const privateUris = [];
    for (const message of messages) {
      for (const attachment of message?.attachments || []) {
        const uri = String(attachment?.url || "");
        if (!uri || isPublicMediaUrl(uri) || signedAttachmentUrls[uri]) continue;
        typeByUri.set(uri, attachment?.type || "file");
        privateUris.push(uri);
      }
    }

    const uniqueUris = [...new Set(privateUris)];
    if (!uniqueUris.length) return undefined;

    let active = true;
    (async () => {
      const resolved = {};
      try {
        for (let start = 0; start < uniqueUris.length; start += 50) {
          const chunk = uniqueUris.slice(start, start + 50);
          const res = await base44.functions.invoke("signAttachmentUrl", {
            conversation_id: selected.id,
            file_uris: chunk,
          });
          Object.assign(resolved, res.data?.signed_urls || {});
        }
        if (!active) return;

        if (Object.keys(resolved).length) {
          setSignedAttachmentUrls((prev) => {
            const next = { ...prev, ...resolved };
            ownerAuditMediaCache.set(selected.id, {
              urls: next,
              expiresAt: Date.now() + OWNER_AUDIT_MEDIA_CACHE_MS,
            });
            return next;
          });

          for (const [uri, url] of Object.entries(resolved)) {
            const type = typeByUri.get(uri);
            if (type === "image") {
              const image = new window.Image();
              image.decoding = "async";
              image.src = url;
            } else if (type === "audio") {
              const audio = new Audio();
              audio.preload = "metadata";
              audio.src = url;
              audio.load();
            } else if (type === "video") {
              const video = document.createElement("video");
              video.preload = "metadata";
              video.src = url;
              video.load();
            }
          }
        }

        const unresolved = uniqueUris.some((uri) => !resolved[uri] && !signedAttachmentUrls[uri]);
        setBatchAttachmentSigningFailed(unresolved);
      } catch {
        if (active) setBatchAttachmentSigningFailed(true);
      }
    })();

    return () => { active = false; };
  }, [messages, selected?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations || [];
    return (conversations || []).filter((conversation) => {
      const metas = Array.isArray(conversation.participant_meta) ? conversation.participant_meta : [];
      return `${metas.map((m) => m?.name || "").join(" ")} ${conversation.last_message || ""}`.toLowerCase().includes(q);
    });
  }, [conversations, query]);

  const filteredMessages = useMemo(() => {
    const q = messageQuery.trim().toLowerCase();
    return (messages || []).filter((message) => {
      const hasAttachment = Array.isArray(message.attachments) && message.attachments.length > 0;
      const isCall = /^📞\s+/u.test(String(message.content || ""));
      if (messageFilter === "attachments" && !hasAttachment) return false;
      if (messageFilter === "calls" && !isCall) return false;
      if (q && !`${message.sender_name || ""} ${message.content || ""} ${message.reply_preview || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [messages, messageQuery, messageFilter]);
  const grouped = useMemo(() => groupMessages(filteredMessages), [filteredMessages]);
  const participants = Array.isArray(selected?.participant_meta) ? selected.participant_meta : [];
  const attachmentCount = (messages || []).reduce((sum, message) => sum + ((message.attachments || []).length || 0), 0);
  const callEventCount = (messages || []).filter((message) => /^📞\s+/u.test(String(message.content || ""))).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-400"><LockKeyhole className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h2 className="truncate font-heading text-sm font-bold">Auditoria de mensagens privadas</h2>
            <p className="truncate text-[11px] text-muted-foreground">Exclusivo para Owner · somente leitura · acessos registrados em log.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadConversations} className="h-8 rounded-full px-3 text-xs">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}

      <div className="grid h-[calc(100dvh-14rem)] min-h-[420px] overflow-hidden rounded-2xl border border-border/40 bg-card/50 sm:min-h-[540px] lg:grid-cols-[300px,1fr]">
        <aside className={cn("min-h-0 flex-col border-b border-border/40 lg:flex lg:border-b-0 lg:border-r", selected ? "hidden sm:flex" : "flex")}>
          <div className="sticky top-0 z-10 border-b border-border/40 bg-card/95 p-3 backdrop-blur">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar conversa..." className="h-9 pl-9 text-xs" />
            </div>
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
            {conversations === null ? (
              <div className="grid h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-xs text-muted-foreground">Nenhuma conversa encontrada.</p>
            ) : filtered.map((conversation) => {
              const metas = Array.isArray(conversation.participant_meta) ? conversation.participant_meta : [];
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => openConversation(conversation)}
                  className={cn(
                    "mb-1 flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
                    selected?.id === conversation.id ? "border-primary/30 bg-primary/10" : "border-transparent hover:bg-white/[0.04]"
                  )}
                >
                  <div className="flex -space-x-2">
                    {metas.slice(0, 2).map((meta) => (
                      <ProfileAvatar key={meta.id} name={meta.name || "Usuário"} avatar={meta.avatar} size="sm" className="ring-2 ring-card" />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold">{partnerLabel(conversation)}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{conversation.last_message || "Sem prévia"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={cn("min-h-0", !selected && "hidden sm:block")}>
          {!selected ? (
            <div className="grid h-full place-items-center p-6 text-center">
              <div>
                <MessageSquareText className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold">Selecione uma conversa</p>
                <p className="mt-1 text-xs text-muted-foreground">As mensagens aparecem aqui sem permitir edição.</p>
              </div>
            </div>
          ) : messages === null ? (
            <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <header className="sticky top-0 z-10 border-b border-border/40 bg-card/95 px-3 py-3 backdrop-blur sm:px-4">
                <button type="button" onClick={() => setSelected(null)} className="mb-2 w-fit rounded-full border border-border/50 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground sm:hidden">Voltar às conversas</button>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{partnerLabel(selected)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {participants.map((person) => (
                        <UserQuickCard key={person.id} userId={person.id} align="start">
                          <button
                            type="button"
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] py-1 pl-1 pr-3 text-[10px] font-semibold transition hover:bg-white/[0.07]"
                          >
                            <ProfileAvatar name={person.name || "Usuário"} avatar={person.avatar} size="sm" />
                            <span className="max-w-[160px] truncate leading-none">{person.name || "Usuário"}</span>
                          </button>
                        </UserQuickCard>
                      ))}
                    </div>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400">
                    <ShieldCheck className="h-3 w-3" /> SOMENTE LEITURA
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="relative min-w-0 flex-1 basis-full sm:min-w-[180px] sm:basis-auto">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={messageQuery} onChange={(e) => setMessageQuery(e.target.value)} placeholder="Buscar nas mensagens..." className="h-8 pl-8 text-[11px]" />
                  </div>
                  {[["all","Todas"],["attachments","Com anexos"],["calls","Chamadas"]].map(([value,label]) => (
                    <button key={value} type="button" onClick={() => setMessageFilter(value)} className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold", messageFilter === value ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground")}>{label}</button>
                  ))}
                  <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] text-muted-foreground">{messages.length} msgs</span>
                  <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] text-muted-foreground">{attachmentCount} anexos</span>
                  <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] text-muted-foreground">{callEventCount} eventos de call</span>
                </div>
              </header>

              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-4">
                {grouped.length === 0 ? (
                  <p className="py-12 text-center text-xs text-muted-foreground">Nenhuma mensagem nesta conversa.</p>
                ) : (
                  <div className="space-y-2.5">
                    {grouped.map((group, groupIndex) => (
                      <div key={`${group.sender_id}:${groupIndex}`} className="grid grid-cols-[32px,minmax(0,1fr)] items-start gap-2.5">
                        <UserQuickCard userId={group.sender_id} align="start">
                          <button type="button" className="mt-0.5 shrink-0">
                            <ProfileAvatar name={group.sender_name} avatar={group.sender_avatar} size="sm" />
                          </button>
                        </UserQuickCard>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <UserQuickCard userId={group.sender_id} align="start">
                              <button type="button" className="truncate text-left text-[11px] font-bold hover:underline">{group.sender_name}</button>
                            </UserQuickCard>
                            <span className="text-[9px] text-muted-foreground">
                              {group.items[0]?.created_date ? formatLocalTime(group.items[0].created_date) : ""}
                            </span>
                          </div>
                          <div className="overflow-hidden rounded-xl border border-border/40 bg-background/25">
                            {group.items.map((message, index) => (
                              <div key={message.id} className={cn("px-3 py-2", index > 0 && "border-t border-white/[0.05]")}>
                                {message.reply_preview && (
                                  <div className="mb-1.5 rounded-lg border-l-2 border-primary/50 bg-white/[0.025] px-2 py-1 text-[10px] text-muted-foreground">
                                    ↪ {message.reply_author_name || "Usuário"}: {message.reply_preview}
                                  </div>
                                )}
                                {message.content && <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed">{message.content}</p>}
                                {!!message.attachments?.length && (
                                  <MessageAttachments
                                    attachments={message.attachments}
                                    conversationId={selected.id}
                                    resolvedUrls={signedAttachmentUrls}
                                    deferSigning={!batchAttachmentSigningFailed}
                                  />
                                )}
                                <div className="mt-1 flex justify-end gap-1 text-[9px] text-muted-foreground/70">
                                  {message.edited && <span>editada ·</span>}
                                  <span>{message.created_date ? formatLocalTime(message.created_date) : ""}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
