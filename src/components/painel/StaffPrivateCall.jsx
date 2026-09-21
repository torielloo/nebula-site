import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCall } from "@/lib/CallContext";
import CallRoom from "@/components/calls/CallRoom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Headphones, Loader2, LockKeyhole, PhoneCall, Send, ShieldCheck, Sparkles, Volume2, VolumeX, Pause, Play, Square } from "lucide-react";
import { getCoreOsVoiceConfig, getCoreOsVoiceVolume, pauseCoreOsVoice, playCoreOsVoice, resumeCoreOsVoice, setCoreOsVoiceVolume, stopCoreOsVoice, unlockAiVoice } from "@/lib/coreOsVoice";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { runCoreAiTurn } from "@/lib/coreAiRuntime";

function cleanCoreReply(value) {
  const raw = String(value || "").trim();
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (unfenced.startsWith("{") && unfenced.endsWith("}")) {
    try {
      const parsed = JSON.parse(unfenced);
      return String(parsed?.reply || parsed?.response || parsed?.text || "").trim() || unfenced;
    } catch { /* segue como texto */ }
  }
  return unfenced;
}

export default function StaffPrivateCall() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const { user } = useAuth();
  const {
    channel,
    setChannel,
    coreOsJoined,
    coreOsMessages,
    setCoreOsJoined,
    sendCoreOsMessage,
    joinError,
  } = useCall();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [asking, setAsking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceConfig, setVoiceConfig] = useState(null);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [coreModel, setCoreModel] = useState("");
  const [coreModelFallback, setCoreModelFallback] = useState(false);
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const [voicePaused, setVoicePaused] = useState(false);
  const [voiceVolume, setVoiceVolume] = useState(() => Math.round(getCoreOsVoiceVolume() * 100));
  const spokenIdsRef = useRef(new Set());
  // Histórico conversacional local da Staff com a Core OS. As mensagens
  // sincronizadas da sala guardam apenas as respostas da Core OS, então este
  // histórico preserva também as perguntas para manter contexto de verdade.
  const conversationRef = useRef([]);

  const inPrivateRoom = Boolean(channel?.staffPrivate);

  const loadRoom = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("staffCallSession", { action: "join" });
      const nextRoom = res?.data?.room || res?.room;
      if (!nextRoom?.code) throw new Error(t("staffcall.room_unavailable"));
      setRoom(nextRoom);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || t("staffcall.prepare_error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoom();
    getCoreOsVoiceConfig({ force: true }).then(setVoiceConfig).catch(() => {});
    return () => { stopCoreOsVoice(); };
  }, []);

  useEffect(() => {
    if (!voiceEnabled || !coreOsJoined || voiceConfig?.enabled === false || voiceConfig?.autoSpeak === false) return undefined;
    const latest = coreOsMessages?.[coreOsMessages.length - 1];
    if (!latest?.id || spokenIdsRef.current.has(latest.id)) return undefined;
    spokenIdsRef.current.add(latest.id);
    let cancelled = false;
    setVoiceSpeaking(true);
    setVoicePaused(false);
    const spokenText = String(latest.text || "").slice(0, 2200);
    (async () => {
      let result = await playCoreOsVoice(spokenText);
      if (!cancelled && result?.provider === "browser_unavailable") {
        // Safari/iOS às vezes libera a síntese alguns instantes depois do gesto.
        unlockAiVoice();
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        if (!cancelled) result = await playCoreOsVoice(spokenText);
      }
      if (cancelled) return;
      if (result?.provider === "gpt") setVoiceNotice(t("staffcall.voice_gpt", { voice: result?.config?.voice || voiceConfig?.voice || t("staffcall.voice_configured") }));
      else if (result?.provider === "browser") setVoiceNotice(t("staffcall.voice_browser"));
      else if (result?.provider === "browser_unavailable") setVoiceNotice("A voz automática foi bloqueada pelo navegador. Toque no botão de voz e tente novamente.");
    })().catch(() => {}).finally(() => {
      if (!cancelled) {
        setVoiceSpeaking(false);
        setVoicePaused(false);
      }
    });
    return () => { cancelled = true; };
  }, [coreOsMessages, coreOsJoined, voiceEnabled, voiceConfig]);

  const enterRoom = async () => {
    if (!room) return;
    unlockAiVoice();
    setError("");
    await setChannel(room);
  };

  const inviteCore = () => {
    unlockAiVoice();
    setError("");
    conversationRef.current = [];
    const joined = setCoreOsJoined(true);
    if (joined === false) {
      setError(t("staffcall.enter_first"));
      return;
    }
    window.setTimeout(() => sendCoreOsMessage(t("staffcall.greeting")), 450);
  };

  const removeCore = () => {
    stopCoreOsVoice();
    setVoiceSpeaking(false);
    setVoicePaused(false);
    conversationRef.current = [];
    setCoreOsJoined(false);
  };

  const runClientActions = async (actions = [], history = []) => {
    const confirmation = actions.find((action) => (
      action?.action && ["confirm_owner_action", "confirm_action"].includes(action.type)
    ));
    if (confirmation && window.confirm(`${confirmation.label}\n\n${JSON.stringify(confirmation.action.params || {}, null, 2)}`)) {
      const confirmed = await base44.functions.invoke("coreOsChatV2", {
        history,
        mode: user?.role === "owner" ? "owner" : "staff",
        context: "staff_call",
        page_context: { pathname: location.pathname, search: location.search },
        confirmed_action: confirmation.action,
      });
      const confirmedReply = cleanCoreReply(confirmed?.data?.reply || t("coreui.action_confirmed"));
      if (confirmedReply) {
        sendCoreOsMessage(confirmedReply);
        conversationRef.current = [
          ...conversationRef.current,
          { role: "assistant", content: confirmedReply },
        ].slice(-16);
      }
    }
    const navigation = actions.find((action) => (
      action?.type === "navigate"
      && typeof action.path === "string"
      && action.path.startsWith("/")
      && !action.path.startsWith("//")
    ));
    if (navigation) window.setTimeout(() => navigate(navigation.path), 250);
  };

  const askCore = async (rawText) => {
    const text = String(rawText ?? prompt).trim();
    if (!text || asking || !coreOsJoined) return;
    unlockAiVoice();
    setPrompt("");
    setAsking(true);
    setVoiceNotice("");
    try {
      const history = [
        ...conversationRef.current.slice(-14),
        { role: "user", content: text },
      ];

      const turn = await runCoreAiTurn({
        history,
        mode: user?.role === "owner" ? "owner" : "staff",
        context: "staff_call",
        pathname: location.pathname,
        search: location.search,
        userMessage: text,
      });
      const reply = cleanCoreReply(turn?.reply || t("staffcall.reply_error"));
      if (turn?.model || turn?.ai_engine) setCoreModel(String(turn.model || turn.ai_engine).slice(0, 60));
      setCoreModelFallback(turn?.ai_fallback === true);
      const actions = Array.isArray(turn?.actions) ? turn.actions : [];
      const historyActions = Array.isArray(turn?.history_actions) ? turn.history_actions : [];
      const assistantHistory = [reply, ...historyActions].filter(Boolean).join("\n");
      conversationRef.current = [
        ...history,
        { role: "assistant", content: assistantHistory || reply },
      ].slice(-16);
      const actionLines = actions.filter(Boolean).map((action) => `• ${String(action)}`);
      sendCoreOsMessage(actionLines.length ? `${reply}\n${actionLines.join("\n")}` : reply);
      await runClientActions(Array.isArray(turn?.client_actions) ? turn.client_actions : [], history);
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || t("staffcall.query_error");
      const failureReply = t("staffcall.request_error", { message });
      conversationRef.current = [
        ...conversationRef.current,
        { role: "user", content: text },
        { role: "assistant", content: failureReply },
      ].slice(-16);
      sendCoreOsMessage(failureReply);
    } finally {
      setAsking(false);
    }
  };

  if (loading) {
    return <div className="grid min-h-56 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!room) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
        <p className="font-bold">{t("staffcall.open_error")}</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
        <Button className="mt-4" variant="outline" onClick={loadRoom}>{t("staffcall.retry")}</Button>
      </div>
    );
  }

  if (!inPrivateRoom) {
    return (
      <div className="space-y-5">
        <div className="rounded-3xl border border-border/60 bg-card/70 p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><LockKeyhole className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-xl font-extrabold">{t("staffcall.title")}</h2>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.15em] text-emerald-400">{t("staffcall.team_only")}</span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("staffcall.desc")}</p>
            </div>
            <Button onClick={enterRoom} className="w-full shrink-0 rounded-full px-6 sm:w-auto"><PhoneCall className="mr-2 h-4 w-4" />{t("staffcall.enter")}</Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border/50 bg-secondary/30 p-4"><ShieldCheck className="h-4 w-4 text-primary" /><p className="mt-2 text-sm font-bold">{t("staffcall.private_access")}</p><p className="mt-1 text-xs text-muted-foreground">{t("staffcall.private_access_desc")}</p></div>
          <div className="rounded-2xl border border-border/50 bg-secondary/30 p-4"><Headphones className="h-4 w-4 text-primary" /><p className="mt-2 text-sm font-bold">{t("staffcall.full_system")}</p><p className="mt-1 text-xs text-muted-foreground">{t("staffcall.full_system_desc")}</p></div>
          <div className="rounded-2xl border border-border/50 bg-secondary/30 p-4"><Bot className="h-4 w-4 text-primary" /><p className="mt-2 text-sm font-bold">{t("staffcall.core_in_call")}</p><p className="mt-1 text-xs text-muted-foreground">{t("staffcall.core_in_call_desc")}</p></div>
        </div>
        {channel && !channel.staffPrivate && <p className="text-xs text-amber-300">{t("staffcall.other_call")}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold">{t("staffcall.participant")}</h3>{coreOsJoined && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">{t("staffcall.in_call")}</span>}{coreModel && <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-muted-foreground">IA real · {coreModel}{coreModelFallback ? " · fallback" : ""}</span>}{voiceConfig?.enabled !== false && <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-bold text-primary">{t("staffcall.voice", { voice: String(voiceConfig?.voice || "GPT").toUpperCase() })}</span>}</div>
            <p className="text-xs text-muted-foreground">{t("staffcall.sync_desc")}</p>
          </div>
          {!coreOsJoined ? (
            <Button onClick={inviteCore} className="w-full rounded-full sm:w-auto"><Sparkles className="mr-2 h-4 w-4" />{t("staffcall.invite")}</Button>
          ) : (
            <Button onClick={removeCore} variant="outline" className="w-full rounded-full sm:w-auto">{t("staffcall.remove")}</Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              if (!voiceEnabled) unlockAiVoice();
              setVoiceEnabled((value) => !value);
              if (voiceEnabled) {
                stopCoreOsVoice();
                setVoiceSpeaking(false);
                setVoicePaused(false);
              }
            }}
            title={voiceEnabled ? t("staffcall.mute_voice") : t("staffcall.enable_voice")}
          >
            {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <div className="flex w-full min-w-0 items-center gap-2 rounded-full border border-border/50 bg-background/40 px-3 py-2 sm:w-auto sm:min-w-[170px]" title={t("staffcall.voice_volume")}>
            <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={voiceVolume}
              onChange={(event) => {
                const next = Number(event.target.value);
                setVoiceVolume(next);
                setCoreOsVoiceVolume(next / 100);
              }}
              className="min-w-0 flex-1 accent-primary sm:w-24 sm:flex-none"
              aria-label={t("staffcall.voice_volume")}
            />
            <span className="w-8 text-right text-[10px] font-bold text-muted-foreground">{voiceVolume}%</span>
          </div>
          {coreOsJoined && voiceSpeaking && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-full"
                onClick={() => {
                  if (voicePaused) {
                    resumeCoreOsVoice();
                    setVoicePaused(false);
                  } else {
                    pauseCoreOsVoice();
                    setVoicePaused(true);
                  }
                }}
              >
                {voicePaused ? <Play className="mr-1.5 h-3.5 w-3.5 fill-current" /> : <Pause className="mr-1.5 h-3.5 w-3.5 fill-current" />}
                {voicePaused ? t("staffcall.resume") : t("staffcall.pause")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-full"
                onClick={() => {
                  stopCoreOsVoice();
                  setVoiceSpeaking(false);
                  setVoicePaused(false);
                  setVoiceNotice(t("staffcall.stopped"));
                }}
                title={t("staffcall.stop_title")}
              >
                <Square className="mr-1.5 h-3.5 w-3.5 fill-current" />
                {t("staffcall.stop")}
              </Button>
            </>
          )}
        </div>

        {coreOsJoined && (
          <div className="mt-4">
            <div className="flex flex-col items-stretch gap-2 rounded-xl border border-border/50 bg-background/40 p-2 sm:flex-row sm:items-center">
              <Input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    askCore();
                  }
                }}
                placeholder={t("staffcall.placeholder")}
                disabled={asking}
                className="border-0 bg-transparent focus-visible:ring-0"
              />
              <Button size="icon" onClick={() => askCore()} disabled={asking || !prompt.trim()}>{asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
            </div>
          </div>
        )}

        {voiceNotice && <p className="mt-2 text-[11px] text-muted-foreground">{voiceNotice}</p>}
        {joinError && <p className="mt-2 text-xs text-destructive">{joinError}</p>}
        {(coreOsMessages || []).length > 0 && (
          <div className="mt-3 max-h-36 space-y-2 overflow-y-auto rounded-xl border border-border/40 bg-background/30 p-3 scrollbar-thin">
            {(coreOsMessages || []).slice(-6).map((message) => (
              <div key={message.id} className="text-xs"><span className="font-bold text-primary">Core OS:</span> <span className="text-muted-foreground">{cleanCoreReply(message.text)}</span></div>
            ))}
          </div>
        )}
      </section>

      <CallRoom channel={channel} />
    </div>
  );
}
