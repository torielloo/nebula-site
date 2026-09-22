import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useCall } from "@/lib/CallContext";
import ProfileAvatar from "@/components/ProfileAvatar";
import { Button } from "@/components/ui/button";
import { PhoneIncoming, PhoneOff, VolumeX } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { getNitroCallSoundEnabled } from "@/lib/nitroSoundPreferences";

const MUTE_KEY = "nebula:private-call-mutes";
const DURATIONS = [
  { label: "15 min", ms: 15 * 60_000 },
  { label: "1 h", ms: 60 * 60_000 },
  { label: "8 h", ms: 8 * 60 * 60_000 },
  { label: "24 h", ms: 24 * 60 * 60_000 },
];

function readMutes() {
  try { return JSON.parse(localStorage.getItem(MUTE_KEY) || "{}"); } catch { return {}; }
}
function setMute(userId, ms, name = "") {
  const current = readMutes();
  const next = { ...current, [userId]: { until: Date.now() + ms, name } };
  localStorage.setItem(MUTE_KEY, JSON.stringify(next));
}
function muteUntil(entry) {
  return typeof entry === "number" ? entry : Number(entry?.until || 0);
}
function isMuted(userId) {
  return muteUntil(readMutes()?.[userId]) > Date.now();
}
function clearMute(userId) {
  const next = { ...readMutes() };
  delete next[userId];
  localStorage.setItem(MUTE_KEY, JSON.stringify(next));
}

let ringtoneCtx = null;
function ping() {
  if (!getNitroCallSoundEnabled()) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!ringtoneCtx) ringtoneCtx = new Ctx();
    if (ringtoneCtx.state === "suspended") void ringtoneCtx.resume();
    const now = ringtoneCtx.currentTime;
    [660, 880].forEach((freq, index) => {
      const osc = ringtoneCtx.createOscillator();
      const gain = ringtoneCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.025, now + index * 0.12 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.18);
      osc.connect(gain); gain.connect(ringtoneCtx.destination);
      osc.start(now + index * 0.12); osc.stop(now + index * 0.12 + 0.2);
    });
  } catch {}
}

export default function IncomingPrivateCallOverlay() {
  const { user } = useAuth();
  const { setChannel, channel } = useCall();
  const { t, locale } = useI18n();
  const [invites, setInvites] = useState([]);
  const [busy, setBusy] = useState("");
  const [mutePanelOpen, setMutePanelOpen] = useState(false);
  const [muteVersion, setMuteVersion] = useState(0);
  const [callError, setCallError] = useState("");
  const timerRef = useRef(null);

  const load = async () => {
    if (!user?.id) return;
    try {
      const res = await base44.functions.invoke("privateCallInvite", { action: "incoming" });
      const serverInvites = (res.data?.invites || []).filter((invite) => !isMuted(invite.caller_id));
      const now = Date.now();
      setInvites((current) => {
        const preserved = (current || []).filter((invite) => {
          const expiresAt = new Date(invite?.expires_at || 0).getTime();
          const sameActiveCall = channel?.privateDm && channel?.conversationId === invite?.conversation_id;
          return invite?.status === "ringing" && !sameActiveCall && !isMuted(invite.caller_id) && (!expiresAt || expiresAt > now);
        });
        return Array.from(new Map([...serverInvites, ...preserved].map((invite) => [invite.id, invite])).values())
          .sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime());
      });
    } catch {
      // Não derruba visualmente uma ligação já recebida por uma falha transitória de polling.
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    load();
    const unsub = base44.entities.PrivateCallInvite.subscribe((event) => {
      const invite = event?.data;
      if (!invite || invite.callee_id !== user.id) return;
      if (invite.status === "ringing" && !isMuted(invite.caller_id)) {
        setInvites((current) => [invite, ...current.filter((item) => item.id !== invite.id)]);
      } else {
        setInvites((current) => current.filter((item) => item.id !== invite.id));
      }
      // Confirma com o backend em seguida, mas não espera a rede para começar a tocar.
      window.setTimeout(load, 150);
    });
    const interval = window.setInterval(load, 3500);
    return () => { unsub?.(); window.clearInterval(interval); };
  }, [user?.id]);

  const current = useMemo(() => {
    const active = invites.find((invite) => !(channel?.privateDm && channel?.conversationId === invite?.conversation_id));
    return active || null;
  }, [invites, channel?.privateDm, channel?.conversationId]);

  useEffect(() => {
    window.clearInterval(timerRef.current);
    if (!current || busy) return undefined;
    ping();
    timerRef.current = window.setInterval(ping, 1900);
    return () => window.clearInterval(timerRef.current);
  }, [current?.id, busy]);

  const respond = async (status) => {
    if (!current || busy) return;
    const selected = current;
    setBusy(status);
    setCallError("");
    window.clearInterval(timerRef.current);

    if (status === "accepted") {
      // Some com o toque imediatamente. Mesmo se a atualização do convite
      // oscilar, a entrada na sala usa a DM autenticada e canônica.
      const canonicalChannel = {
        name: selected.caller_name || "Ligação privada",
        code: `DM-${selected.conversation_id}`,
        privateDm: true,
        conversationId: selected.conversation_id,
        peerUserId: selected.caller_id,
      };
      let response = null;
      let respondError = null;
      try {
        response = await base44.functions.invoke("privateCallInvite", {
          action: "respond",
          invite_id: selected.id,
          status: "accepted",
        });
      } catch (error) {
        respondError = error;
      }

      const code = respondError?.response?.data?.code || respondError?.code;
      if (code === "muted") {
        setCallError(t("mute.call_blocked"));
        setBusy("");
        return;
      }

      try {
        const accepted = response?.data?.invite || selected;
        await setChannel({
          ...canonicalChannel,
          name: accepted.caller_name || canonicalChannel.name,
          code: accepted.channel_code || canonicalChannel.code,
          conversationId: accepted.conversation_id || canonicalChannel.conversationId,
          peerUserId: response?.data?.peer_user_id || accepted.caller_id || canonicalChannel.peerUserId,
        });
        setInvites((items) => items.filter((item) => item.conversation_id !== selected.conversation_id));
        // Se o backend falhou antes mas a sala entrou, tenta marcar o convite
        // como aceito sem bloquear a UI nem reativar o toque.
        if (respondError) {
          void base44.functions.invoke("privateCallInvite", {
            action: "respond",
            invite_id: selected.id,
            status: "accepted",
          }).catch(() => {});
        }
      } catch (joinError) {
        const joinCode = joinError?.response?.data?.code || joinError?.code;
        const joinMessage = joinError?.response?.data?.error || joinError?.message;
        setCallError(joinCode === "muted" ? t("mute.call_blocked") : (joinMessage || t("dm.call_error")));
      } finally {
        setBusy("");
      }
      return;
    }

    try {
      await base44.functions.invoke("privateCallInvite", { action: "respond", invite_id: selected.id, status });
      setInvites((items) => items.filter((item) => item.id !== selected.id));
    } catch (error) {
      // Recusar deve parar o toque local mesmo se a persistência oscilar.
      setInvites((items) => items.filter((item) => item.id !== selected.id));
      const code = error?.response?.data?.code || error?.code;
      const message = error?.response?.data?.error || error?.message;
      if (code !== "invite_not_found" && code !== "invite_not_ringing") {
        setCallError(code === "muted" ? t("mute.call_blocked") : (message || t("dm.call_error")));
      }
    } finally {
      setBusy("");
    }
  };

  const muteCaller = async (ms) => {
    if (!current) return;
    setMute(current.caller_id, ms, current.caller_name || "Usuário");
    setMuteVersion((value) => value + 1);
    await respond("declined");
  };

  const activeMutes = Object.entries(readMutes()).filter(([, entry]) => muteUntil(entry) > Date.now());

  if (!current && activeMutes.length === 0) return null;

  return (
    <>
    {activeMutes.length > 0 && (
      <div className="fixed bottom-20 right-4 z-[79] md:bottom-5">
        <button type="button" onClick={() => setMutePanelOpen((value) => !value)} className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs font-bold shadow-xl backdrop-blur-xl">
          <VolumeX className="h-3.5 w-3.5" /> {t("dm.muted_calls")} · {activeMutes.length}
        </button>
        {mutePanelOpen && (
          <div className="absolute bottom-12 right-0 w-[min(90vw,340px)] rounded-2xl border border-white/10 bg-zinc-950/98 p-3 shadow-2xl">
            <p className="mb-2 text-xs font-extrabold">{t("dm.muted_people")}</p>
            <div className="space-y-2">
              {activeMutes.map(([userId, entry]) => (
                <div key={userId} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2">
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{entry?.name || userId}</p><p className="text-[10px] text-muted-foreground">{t("dm.until_time", { date: new Date(muteUntil(entry)).toLocaleString(locale) })}</p></div>
                  <Button size="sm" variant="outline" className="h-8 rounded-full px-2.5 text-[10px]" onClick={() => { clearMute(userId); setMuteVersion((value) => value + 1); }}>{t("common.remove")}</Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )}
    {current && <div className="fixed left-1/2 top-20 z-[80] w-[min(94vw,460px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <ProfileAvatar name={current.caller_name || "Usuário"} avatar={current.caller_avatar} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{current.caller_name || "Usuário"}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><PhoneIncoming className="h-3.5 w-3.5 animate-pulse" />{t("dm.incoming_private_call")}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={() => respond("accepted")} disabled={!!busy} className="rounded-full"><PhoneIncoming className="mr-2 h-4 w-4" />{t("dm.accept_call")}</Button>
        <Button onClick={() => respond("declined")} disabled={!!busy} variant="destructive" className="rounded-full"><PhoneOff className="mr-2 h-4 w-4" />{t("dm.decline_call")}</Button>
      </div>
      {callError && <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">{callError}</p>}
      <div className="mt-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><VolumeX className="h-3.5 w-3.5" />{t("dm.mute_caller")}</p>
        <div className="grid grid-cols-4 gap-1.5">
          {DURATIONS.map((item) => <Button key={item.label} size="sm" variant="outline" className="h-8 rounded-full px-2 text-[10px]" onClick={() => muteCaller(item.ms)}>{item.label}</Button>)}
        </div>
      </div>
    </div>}
    </>
  );
}
