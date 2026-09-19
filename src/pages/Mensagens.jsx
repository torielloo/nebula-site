import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ProfileAvatar from "@/components/ProfileAvatar";
import ChatWindow from "@/components/chat/ChatWindow";
import NewChatDialog from "@/components/chat/NewChatDialog";
import { MessageCircle, MessageSquarePlus, Lock, ShieldCheck, Cpu, Loader2, Search, Pin, PinOff } from "lucide-react";
import { parseDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { displayName } from "@/lib/displayName";
import { isStaffUser } from "@/lib/roles";

export default function Mensagens() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const canUseCore = isStaffUser(user);
  const me = user ? { id: user.id, name: displayName(user), role: user.role || 'user' } : null;
  const [conversations, setConversations] = useState(null);
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [coreBusy, setCoreBusy] = useState(false);
  const [coreError, setCoreError] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [pinnedIds, setPinnedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`nebula:pinned-dms:${user?.id || "anon"}`) || "[]"); } catch { return []; }
  });

  const load = async () => {
    try {
      const list = await base44.entities.Conversation.list("-updated_date", 100);
      const valid = (list || []).filter((conv) => {
        const participants = Array.isArray(conv.participants) ? conv.participants : [];
        if (participants.includes("core-os")) return canUseCore && participants.length === 2;
        return participants.length === 2 && participants.includes(me?.id);
      });

      // Uma conversa por dupla. Registros duplicados antigos não aparecem duas
      // vezes na sidebar enquanto o backend os consolida definitivamente.
      const grouped = new Map();
      for (const conv of valid) {
        const key = [...(conv.participants || [])].sort().join(":");
        const existing = grouped.get(key);
        if (!existing) {
          grouped.set(key, conv);
          continue;
        }
        const existingCreated = new Date(existing.created_date || 0).getTime() || 0;
        const currentCreated = new Date(conv.created_date || 0).getTime() || 0;
        const canonical = currentCreated < existingCreated ? conv : existing;
        const latest = new Date(conv.updated_date || 0).getTime() > new Date(existing.updated_date || 0).getTime() ? conv : existing;
        grouped.set(key, {
          ...canonical,
          last_message: latest.last_message || canonical.last_message,
          last_sender_id: latest.last_sender_id || canonical.last_sender_id,
          updated_date: latest.updated_date || canonical.updated_date,
          participant_meta: latest.participant_meta?.length ? latest.participant_meta : canonical.participant_meta,
        });
      }

      const visible = [...grouped.values()];
      setConversations(visible);
      if (!canUseCore && selected && (selected.participants || []).includes("core-os")) setSelected(null);
      setListError("");
    } catch {
      setListError("Não foi possível carregar as conversas. Verifique a conexão e tente novamente.");
    }
  };

  useEffect(() => {
    load();
    const unsubscribe = base44.entities.Conversation.subscribe(() => { load(); });
    return unsubscribe;
  }, []);

  const partnerOf = (conv) =>
    (conv.participant_meta || []).find((p) => p.id !== (me && me.id)) || { name: t("common.user") };

  useEffect(() => {
    if (!user?.id) return;
    localStorage.setItem(`nebula:pinned-dms:${user.id}`, JSON.stringify(pinnedIds));
  }, [pinnedIds, user?.id]);

  const togglePinned = (conversationId) => {
    setPinnedIds((current) => current.includes(conversationId) ? current.filter((id) => id !== conversationId) : [conversationId, ...current]);
  };

  const visibleConversations = (conversations || [])
    .filter((conv) => {
      const q = conversationSearch.trim().toLowerCase();
      if (!q) return true;
      const partner = partnerOf(conv);
      return `${partner.name || ""} ${conv.last_message || ""}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const ap = pinnedIds.includes(a.id) ? 1 : 0;
      const bp = pinnedIds.includes(b.id) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return new Date(b.updated_date || b.created_date || 0).getTime() - new Date(a.updated_date || a.created_date || 0).getTime();
    });

  const startChat = async (contact) => {
    if (!contact || contact.id === "core-os" || !me?.id) return;
    try {
      // Sempre resolve a conversa pelo backend para que os dois usuários caiam
      // no mesmo conversation.id, inclusive se houver uma conversa antiga.
      const res = await base44.functions.invoke("openDirectConversation", { user_id: contact.id });
      const conv = res.data?.conversation;
      if (!conv?.id) throw new Error("Conversa indisponível");
      setSelected(conv);
      await load();
    } catch {
      setListError("Não foi possível abrir a conversa privada. Tente novamente.");
    }
  };

  useEffect(() => {
    const conversationId = searchParams.get("conversation");
    if (!conversationId || conversations === null || !me) return;
    let cancelled = false;
    const openDeepLink = async () => {
      let found = (conversations || []).find((conv) => conv.id === conversationId);
      if (!found) {
        const rows = await base44.entities.Conversation.filter({ id: conversationId }, "-updated_date", 1).catch(() => []);
        const candidate = rows?.[0];
        if (candidate && (candidate.participants || []).includes(me.id) && (canUseCore || !(candidate.participants || []).includes("core-os"))) found = candidate;
      }
      if (!cancelled && found) setSelected(found);
      if (!cancelled) {
        const next = new URLSearchParams(searchParams);
        next.delete("conversation");
        setSearchParams(next, { replace: true });
      }
    };
    openDeepLink();
    return () => { cancelled = true; };
  }, [searchParams.get("conversation"), conversations === null, me?.id, canUseCore]);

  useEffect(() => {
    const targetId = searchParams.get("user");
    if (!targetId || !me || conversations === null) return;
    let cancelled = false;
    base44.functions.invoke("userDirectory", { action: "profile", user_id: targetId }).then(async (res) => {
      if (cancelled) return;
      const profile = res.data?.profile;
      if (profile?.id) await startChat({ id: profile.id, name: profile.name || "Usuário" });
      const next = new URLSearchParams(searchParams);
      next.delete("user");
      setSearchParams(next, { replace: true });
    }).catch(() => {
      const next = new URLSearchParams(searchParams);
      next.delete("user");
      setSearchParams(next, { replace: true });
    });
    return () => { cancelled = true; };
  }, [searchParams.get("user"), conversations === null, me?.id]);

  const openCoreChat = async () => {
    if (coreBusy) return;
    setCoreBusy(true);
    setCoreError("");
    try {
      const res = await base44.functions.invoke("coreOsDm", { action: "open" });
      setSelected(res.data.conversation);
      await load();
    } catch {
      setCoreError("Não foi possível abrir a conversa com a Core OS. Tente novamente.");
    } finally {
      setCoreBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">{t("dm.label")}</p>
          <h1 className="font-heading text-2xl font-extrabold md:text-3xl">{t("dm.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("dm.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUseCore && <Button variant="outline" onClick={openCoreChat} disabled={coreBusy} className="gap-2 rounded-full">
            {coreBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
            Falar com Core OS
          </Button>}
          <Button onClick={() => setDialogOpen(true)} className="nebula-glow-sm gap-2 rounded-full">
            <MessageSquarePlus className="h-4 w-4" />
            {t("dm.new")}
          </Button>
        </div>
      </div>
      {coreError && <p role="alert" className="text-sm text-destructive">{coreError}</p>}

      <div className="grid h-[calc(100vh-13rem)] min-h-[440px] overflow-hidden rounded-3xl border border-border/40 bg-card/60 shadow-[0_24px_70px_-30px_rgba(0,0,0,0.95)] lg:grid-cols-[320px,1fr]">
        {/* Lista de conversas */}
        <div
          className={cn(
            "scrollbar-thin relative overflow-y-auto border-border/40 bg-secondary/20 p-2 lg:border-r",
            selected && "hidden lg:block"
          )}
        >
          <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />

          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={conversationSearch} onChange={(e) => setConversationSearch(e.target.value)} placeholder="Pesquisar conversas" className="h-10 pl-9 text-xs" />
          </div>
          {listError && <div role="alert" className="p-3 text-sm text-destructive">{listError}<Button variant="outline" size="sm" className="mt-2" onClick={load}>Tentar novamente</Button></div>}
          {conversations === null && !listError ? (
            <div className="flex justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" />
            </div>
          ) : listError && !conversations ? null : visibleConversations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <MessageCircle className="h-7 w-7" />
              </span>
              <p className="text-sm font-semibold">{t("dm.empty")}</p>
              <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">{t("dm.empty_hint")}</p>
            </div>
          ) : (
            visibleConversations.map((conv) => {
              const partner = partnerOf(conv);
              const active = selected && selected.id === conv.id;
              const pinned = pinnedIds.includes(conv.id);
              return (
                <div
                  key={conv.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setListError("");
                    setSelected(conv);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setListError("");
                      setSelected(conv);
                    }
                  }}
                  className={cn(
                    "mb-1.5 flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-3 text-left transition-all duration-200",
                    active
                      ? "nebula-glow-sm border-primary/40 bg-primary/10"
                      : "border-transparent hover:-translate-y-0.5 hover:border-border/40 hover:bg-accent/60"
                  )}
                >
                  <ProfileAvatar name={partner.name} avatar={partner.avatar} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{partner.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {conv.last_message || t("dm.new_conversation")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePinned(conv.id); }} className={cn("grid h-7 w-7 place-items-center rounded-lg transition-colors", pinned ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground")} aria-label={pinned ? "Desfixar conversa" : "Fixar conversa"}>
                      {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </button>
                    <small className="rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {conv.updated_date ? parseDate(conv.updated_date).format("DD/MM") : ""}
                    </small>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Conversa ou estado vazio */}
        <div className={cn("min-h-0", !selected && "hidden lg:block")}>
          {selected && me ? (
            <ChatWindow conversation={selected} me={me} canUseCore={canUseCore} onBack={() => setSelected(null)} />
          ) : (
            <div className="relative flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
              <span className="grid h-16 w-16 place-items-center rounded-3xl bg-primary/10 text-primary">
                <MessageCircle className="h-8 w-8" />
              </span>
              <p className="text-sm font-semibold">{t("dm.select")}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" /> {t("dm.private_hint")}
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                <ShieldCheck className="h-3 w-3 text-emerald-500" /> {t("dm.encrypted_hint")}
              </p>
            </div>
          )}
        </div>
      </div>

      <NewChatDialog open={dialogOpen} onOpenChange={setDialogOpen} onStart={startChat} />
    </div>
  );
}