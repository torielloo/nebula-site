import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, LifeBuoy, ShieldAlert, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { getAiVoiceConfig, playAiVoice, stopCoreOsVoice, unlockAiVoice } from "@/lib/coreOsVoice";

const SUGGESTION_KEYS = ["ia.s1", "ia.s2", "ia.s3"];

export default function NebulaticosIA() {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState([{ role: "assistant", content: "" }]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [voiceConfig, setVoiceConfig] = useState(null);
  const [assistantName, setAssistantName] = useState("Nebulaticos IA");
  const [activeModel, setActiveModel] = useState("");
  const [modelFallback, setModelFallback] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const bottomRef = useRef(null);
  const conversationIdRef = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `support-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  // Saudação inicial sempre no idioma atual
  useEffect(() => {
    setMessages((m) =>
      m.length === 1 && m[0].role === "assistant" && !m[0].content
        ? [{ role: "assistant", content: t("ia.greeting") }]
        : m
    );
  }, []);

  useEffect(() => {
    getAiVoiceConfig("nebulaticos", { force: true }).then(setVoiceConfig).catch(() => {});
    return () => stopCoreOsVoice();
  }, []);

  useEffect(() => {
    bottomRef.current && bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const speakReply = (content, source = "nebulaticos", index = -1, force = false) => {
    if (!content || (!force && (voiceConfig?.enabled === false || voiceConfig?.autoSpeak === false))) {
      return Promise.resolve({ provider: "disabled" });
    }
    const assistant = source === "core_os_security" ? "core_security" : "nebulaticos";
    setSpeakingIndex(index);
    return playAiVoice(content, { assistant }).finally(() => {
      setSpeakingIndex((current) => current === index ? null : current);
    });
  };

  const toggleVoice = (message, index) => {
    unlockAiVoice();
    if (speakingIndex === index) {
      stopCoreOsVoice();
      setSpeakingIndex(null);
      return;
    }
    stopCoreOsVoice();
    speakReply(message.content, message.source, index, true);
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
      const res = await base44.functions.invoke("nebulaticosChat", {
        history: next.slice(-10),
        locale: lang,
        conversation_id: conversationIdRef.current,
      });
      const source = res.data.source || "nebulaticos";
      if (res.data?.agent_profile?.label) setAssistantName(String(res.data.agent_profile.label).slice(0, 80));
      if (res.data?.model || res.data?.ai_engine) setActiveModel(String(res.data.model || res.data.ai_engine).slice(0, 60));
      setModelFallback(res.data?.ai_fallback === true);
      const reply = res.data.reply;

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: reply,
          source,
          securityMode: Boolean(res.data.security_mode),
        },
      ]);

      if (res.data.reset_after_security) {
        await Promise.all([
          speakReply(reply, source, next.length, true),
          new Promise((resolve) => window.setTimeout(resolve, 3500)),
        ]);
        stopCoreOsVoice();
        conversationIdRef.current = typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `support-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setMessages([{ role: "assistant", content: t("ia.greeting") }]);
      } else {
        speakReply(reply, source, next.length);
      }
    } catch (error) {
      const errorData = error?.response?.data || error?.data || {};
      if (errorData?.model) setActiveModel(String(errorData.model).slice(0, 60));
      const serverMessage = errorData?.error || "";
      setMessages((m) => [...m, { role: "assistant", content: serverMessage || t("ia.error") }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-11rem)] max-w-3xl flex-col">
      <header className="flex items-center gap-3 rounded-2xl border border-border/60 bg-gradient-to-b from-accent/50 via-card to-card p-4 shadow-[0_0_60px_-30px_hsl(var(--primary)/0.4)]">
        <div className="nebula-glow-sm grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-heading text-base font-bold">{assistantName}</h1>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {activeModel
              ? activeModel.startsWith("local_")
                ? `IA otimizada · ${modelFallback ? "fallback local" : "resposta instantânea"}`
                : `IA real · ${activeModel}${modelFallback ? " · fallback econômico" : ""}`
              : t("ia.subtitle")}
          </p>
        </div>
        <Link
          to="/tickets"
          className="ml-auto flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-border/40 hover:text-foreground"
        >
          <LifeBuoy className="h-3.5 w-3.5" />
          {t("ia.staff")}
        </Link>
      </header>

      <div className="scrollbar-thin mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((m, i) => {
          const coreSecurity = m.role === "assistant" && m.source === "core_os_security";
          const supportSecurity = m.role === "assistant" && m.source === "nebulaticos_security";
          return (
            <div key={i} className={cn("flex gap-2.5", m.role === "user" && "justify-end")}>
              {m.role === "assistant" && (
                <div
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                    coreSecurity
                      ? "border border-red-500/35 bg-red-500/10 text-red-400"
                      : supportSecurity
                        ? "border border-amber-500/35 bg-amber-500/10 text-amber-300"
                        : "bg-primary/15 text-primary"
                  )}
                  title={coreSecurity ? "Core OS Security" : supportSecurity ? `${assistantName} · Segurança` : assistantName}
                >
                  {(coreSecurity || supportSecurity) ? <ShieldAlert className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
              )}
              <div
                className={cn(
                  "max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  m.role === "user"
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : coreSecurity
                      ? "rounded-tl-sm border border-red-500/25 bg-red-500/[0.045]"
                      : supportSecurity
                        ? "rounded-tl-sm border border-amber-500/25 bg-amber-500/[0.04]"
                        : "rounded-tl-sm border border-border/50 bg-card"
                )}
              >
                {(coreSecurity || supportSecurity) && (
                  <div className={cn(
                    "mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em]",
                    coreSecurity ? "text-red-400" : "text-amber-300"
                  )}>
                    <ShieldAlert className="h-3 w-3" />
                    {coreSecurity ? "Core OS Security" : `${assistantName} · Segurança`}
                  </div>
                )}
                {m.content}
                {m.role === "assistant" && m.content && (
                  <button
                    type="button"
                    onClick={() => toggleVoice(m, i)}
                    className="ml-2 inline-grid h-7 w-7 translate-y-1 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    aria-label={speakingIndex === i ? t("coreui.stop_voice") : t("coreui.listen")}
                    title={speakingIndex === i ? t("coreui.stop_voice") : t("coreui.listen")}
                  >
                    {speakingIndex === i ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {thinking && (
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-[190px] rounded-2xl rounded-tl-sm border border-border/50 bg-card px-4 py-3">
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0.3s]" />
                <span className="ml-2 text-[10px] text-muted-foreground">
                  Analisando contexto e raciocinando{activeModel ? ` · ${activeModel}` : ""}...
                </span>
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
            placeholder={t("ia.placeholder")}
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