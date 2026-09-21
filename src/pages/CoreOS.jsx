import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Cpu, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { getCoreOsVoiceConfig, playCoreOsVoice, stopCoreOsVoice, unlockAiVoice } from "@/lib/coreOsVoice";
import { useAuth } from "@/lib/AuthContext";
import { runCoreAiTurn } from "@/lib/coreAiRuntime";

const SUGGESTION_KEYS = ["core.s1", "core.s2", "core.s3"];
const OPEN_TICKET_STATUSES = new Set(["novo", "em_atendimento", "aguardando_usuario"]);

function wantsTicketNavigation(text) {
  const s = String(text || "").toLocaleLowerCase("pt-BR");
  if (!s.includes("ticket")) return false;
  return /(me\s+(joga|jogue|taca|taque|envia|envie|manda|mande|leva|leve|coloca)|abr(e|ir)|redireciona|redirecione|vai\s+pro|vai\s+pra|ir\s+pro|ir\s+pra|open|show|take\s+me|go\s+to|abre|abrir|mu[eé]strame|lleva(?:me)?|ir\s+a)/i.test(s);
}

function wantsDirectOperationalSummary(text) {
  const s = String(text || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /(relatorio|resumo|panorama|visao geral|status geral|situacao geral|como esta o site|como ta o site|como esta tudo|como ta tudo|analisa o site|analise o site|o que precisa de atencao|o que ta acontecendo|o que esta acontecendo|me atualiza|overview|quick report)/.test(s);
}

function extractTicketId(text) {
  const value = String(text || "");
  const explicit = value.match(/(?:ticket\s*(?:do\s*)?(?:id|#)?\s*|id\s*)([a-f0-9]{20,40})/i);
  if (explicit?.[1]) return explicit[1];
  return value.match(/\b([a-f0-9]{24,40})\b/i)?.[1] || "";
}

function ticketStatusWanted(text) {
  const s = String(text || "").toLocaleLowerCase("pt-BR");
  if (/resolvid|resolved|resuelt/.test(s)) return "resolvido";
  if (/fechad|arquivad|closed|archived|cerrad|archivad/.test(s)) return "fechado";
  if (/abert|pendente|recente|algum|qualquer|novo|atendimento|open|pending|recent|new|in progress|abiert|pendient|recient|nuevo|atenci[oó]n/.test(s)) return "open_or_recent";
  return "any";
}

async function resolveLocalTicketNavigation(content, ownerMode, previousMessages, t) {
  if (!wantsTicketNavigation(content)) return null;
  const view = ownerMode ? "owner" : "staff";
  const requestedId = extractTicketId(content);
  if (requestedId) {
    return {
      path: `/painel?view=${view}&tab=tickets&ticket=${encodeURIComponent(requestedId)}`,
      reply: t("coreui.opening_ticket", { id: requestedId }),
    };
  }

  const rows = await base44.entities.Ticket.list("-created_date", 200);
  const visible = (rows || []).filter((ticket) => ticket && ticket.deleted !== true);
  const wanted = ticketStatusWanted(content);
  let pool = visible;
  if (wanted === "resolvido") pool = visible.filter((ticket) => (ticket.status || "novo") === "resolvido");
  else if (wanted === "fechado") pool = visible.filter((ticket) => (ticket.status || "novo") === "fechado");
  else if (wanted === "open_or_recent") pool = visible.filter((ticket) => OPEN_TICKET_STATUSES.has(ticket.status || "novo"));
  if (!pool.length && wanted === "open_or_recent") pool = visible;
  if (!pool.length) return { path: "", reply: t("coreui.no_ticket") };

  const transcript = previousMessages.map((message) => message.content || "").join("\n");
  const mentioned = new Set([...transcript.matchAll(/\b([a-f0-9]{24,40})\b/gi)].map((match) => match[1]));
  const chosen = pool.find((ticket) => !mentioned.has(ticket.id)) || pool[0];
  return {
    path: `/painel?view=${view}&tab=tickets&ticket=${encodeURIComponent(chosen.id)}`,
    reply: wanted === "resolvido" ? t("coreui.opening_resolved", { name: chosen.subject || chosen.id }) : t("coreui.opening", { name: chosen.subject || chosen.id }),
  };
}

export default function CoreOS({ mode = "staff", context = "general", compact = false, persistent = false }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const ownerMode = mode === "owner" || (mode === "auto" && user?.role === "owner");
  const securityMode = ownerMode && context === "security";
  const storageKey = `nebula-coreos:v2:${securityMode ? "security" : ownerMode ? "owner" : "staff"}:messages`;
  const [messages, setMessages] = useState(() => {
    if (persistent) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
        if (Array.isArray(saved) && saved.length) return saved.slice(-30);
      } catch {}
    }
    return [{ role: "assistant", content: "" }];
  });
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [voiceConfig, setVoiceConfig] = useState(null);
  const [activeModel, setActiveModel] = useState("");
  const [modelFallback, setModelFallback] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const bottomRef = useRef(null);

  // Saudação inicial sempre no idioma atual
  useEffect(() => {
    setMessages((m) =>
      m.length === 1 && m[0].role === "assistant" && !m[0].content
        ? [{ role: "assistant", content: securityMode ? "Core OS Segurança ativa. Posso investigar riscos e usar as ações de segurança autorizadas para proteger o Nébula OS." : t("core.greeting") }]
        : m
    );
  }, []);

  useEffect(() => {
    getCoreOsVoiceConfig({ force: true }).then(setVoiceConfig).catch(() => {});
    return () => stopCoreOsVoice();
  }, []);

  useEffect(() => {
    bottomRef.current && bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (!persistent) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-30))); } catch {}
  }, [messages, persistent, storageKey]);

  const speakAutomatically = (text, index = -1) => {
    if (!text || voiceConfig?.enabled === false || voiceConfig?.autoSpeak === false) return;
    setSpeakingIndex(index);
    playCoreOsVoice(text).finally(() => {
      setSpeakingIndex((current) => current === index ? null : current);
    });
  };

  const toggleMessageVoice = async (message, index) => {
    unlockAiVoice();
    if (speakingIndex === index) {
      stopCoreOsVoice();
      setSpeakingIndex(null);
      return;
    }
    stopCoreOsVoice();
    setSpeakingIndex(index);
    try {
      await playCoreOsVoice(message.content);
    } finally {
      setSpeakingIndex((current) => current === index ? null : current);
    }
  };

  const send = async (text) => {
    const content = (text !== undefined ? text : input).trim();
    if (!content || thinking) return;
    unlockAiVoice();
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");

    setThinking(true);
    try {
      const safeHistory = next.slice(-20).map((message) => ({ role: message.role, content: message.historyContent || message.content }));
      const turn = await runCoreAiTurn({
        history: safeHistory,
        mode: ownerMode ? "owner" : "staff",
        context,
        pathname: location.pathname,
        search: location.search,
        userMessage: content,
      });
      const reviewedServerReply = turn.reply || "";
      if (turn.model || turn.ai_engine) setActiveModel(String(turn.model || turn.ai_engine).slice(0, 60));
      setModelFallback(turn.ai_fallback === true);
      const acts = Array.isArray(turn.actions) ? turn.actions : [];
      const historyActs = Array.isArray(turn.history_actions) ? turn.history_actions : [];
      const clientActions = Array.isArray(turn.client_actions) ? turn.client_actions : [];

      let assistantContent = reviewedServerReply;
      if (acts.length) assistantContent += "\n\n" + acts.map((a) => `⚙️ ${a}`).join("\n");
      const historyContent = [reviewedServerReply, ...historyActs].filter(Boolean).join("\n");
      setMessages((m) => [...m, { role: "assistant", content: assistantContent, historyContent }]);
      speakAutomatically(assistantContent, next.length);
      const confirmation = clientActions.find((a) => a && ["confirm_owner_action", "confirm_action"].includes(a.type) && a.action);
      if (confirmation && window.confirm(`${confirmation.label}\n\n${JSON.stringify(confirmation.action.params, null, 2)}`)) {
        const confirmed = await base44.functions.invoke("coreOsChatV2", { history: safeHistory, mode: ownerMode ? "owner" : "staff", context, page_context: { pathname: location.pathname, search: location.search }, confirmed_action: confirmation.action });
        const confirmedReply = (confirmed.data && confirmed.data.reply) || t("coreui.action_confirmed");
        setMessages((m) => [...m, { role: "assistant", content: confirmedReply, historyContent: confirmedReply }]);
        speakAutomatically(confirmedReply, -2);
        if (["site_editor_patch", "site_page_upsert", "site_page_delete", "update_site_structure"].includes(confirmation.action.type)) {
          window.setTimeout(() => window.location.reload(), 500);
        }
      }
      const navigation = clientActions.find((a) => a && a.type === "navigate" && typeof a.path === "string" && a.path.startsWith("/") && !a.path.startsWith("//"));
      if (navigation) {
        window.setTimeout(() => navigate(navigation.path), 350);
      }
    } catch (error) {
      const fallbackTicketPath = wantsTicketNavigation(content) ? `/painel?view=${ownerMode ? "owner" : "staff"}&tab=tickets` : "";
      const errorData = error?.response?.data || error?.data || {};
      if (errorData?.model) setActiveModel(String(errorData.model).slice(0, 60));
      const serverMessage = errorData?.error || "";
      const reply = serverMessage || (fallbackTicketPath
        ? t("coreui.ticket_fallback")
        : t("core.error"));
      setMessages((m) => [...m, { role: "assistant", content: reply, historyContent: reply }]);
      speakAutomatically(reply, next.length);
      if (fallbackTicketPath) window.setTimeout(() => navigate(fallbackTicketPath), 250);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className={cn(compact ? "flex h-full min-h-0 w-full flex-col" : "mx-auto flex h-[calc(100vh-13rem)] max-w-3xl flex-col md:h-[calc(100vh-11rem)]")}>
      <header className={cn("flex items-center gap-3 rounded-2xl border border-border/60 bg-card", compact ? "p-3" : "p-4")}>
        <div className="nebula-glow-sm grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground">
          <Cpu className="h-5 w-5" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-base font-bold">{securityMode ? "Core OS Segurança" : ownerMode ? t("panel.core_owner") : t("panel.core_staff")}</h1>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{securityMode ? "PERFIL SEGURANÇA" : ownerMode ? t("coreui.global") : t("coreui.limited")}</span>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {activeModel
              ? activeModel.startsWith("local_")
                ? `IA otimizada · ${modelFallback ? "fallback local" : "resposta instantânea"}`
                : `IA real · ${activeModel}${modelFallback ? " · fallback econômico" : ""}`
              : securityMode ? "Proteção e investigação com permissões próprias de segurança" : ownerMode ? t("coreui.owner_desc") : t("coreui.staff_desc")}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {voiceConfig?.enabled !== false && (
            <span className="hidden rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary sm:inline-flex">
              {t("coreui.voice", { voice: voiceConfig?.voice || "GPT" })}
            </span>
          )}
          <Sparkles className="h-4 w-4 text-primary/60" />
        </div>
      </header>

      <div className="scrollbar-thin mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-2.5", m.role === "user" && "justify-end")}>
            {m.role === "assistant" && (
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                <Cpu className="h-4 w-4" />
              </div>
            )}
            <div
              className={cn(
                "group/message relative max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-relaxed",
                m.role === "user"
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-tl-sm border border-border/50 bg-card"
              )}
            >
              {m.content}
              {m.role === "assistant" && voiceConfig?.enabled !== false && m.content && (
                <button
                  type="button"
                  onClick={() => toggleMessageVoice(m, i)}
                  className="ml-2 inline-grid h-7 w-7 translate-y-1 place-items-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-primary/10 hover:text-primary"
                  aria-label={speakingIndex === i ? t("coreui.stop_voice") : t("coreui.listen")}
                  title={speakingIndex === i ? t("coreui.stop") : t("coreui.listen_with", { voice: voiceConfig?.voice || t("coreui.gpt_voice") })}
                >
                  {speakingIndex === i ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <Cpu className="h-4 w-4" />
            </div>
            <div className="min-w-[220px] rounded-2xl rounded-tl-sm border border-border/50 bg-card px-4 py-3">
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0.3s]" />
                <span className="ml-2 text-[10px] text-muted-foreground">Analisando contexto e raciocinando{activeModel ? ` · ${activeModel.startsWith("local_") ? "modo otimizado" : activeModel}` : ""}...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length === 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTION_KEYS.map((s) => (
            <button
              key={s}
              onClick={() => send(t(s))}
              className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border/40 hover:text-foreground"
            >
              {t(s)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 rounded-2xl border border-border/60 bg-card p-2.5">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t("core.placeholder")}
            rows={1}
            className="max-h-32 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button size="sm" onClick={() => send()} disabled={thinking || !input.trim()} className="nebula-glow-sm h-9 shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}