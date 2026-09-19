import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { callEngine } from "@/lib/callEngine";
import { displayName } from "@/lib/displayName";
import { fetchMyMute } from "@/lib/moderation";
import { base44 } from "@/api/base44Client";

const CallContext = createContext(null);

/**
 * Estado global da Nébula Call: permite que a call continue ativa
 * enquanto o usuário navega pelo site (mini janela flutuante).
 * O motor (callEngine) mantém a sala no servidor e a malha WebRTC —
 * todos que entram no mesmo canal caem na mesma call.
 */
export function CallProvider({ children }) {
  const { user } = useAuth();
  const [snap, setSnap] = useState(() => callEngine.snapshot());

  useEffect(() => callEngine.subscribe(setSnap), []);

  useEffect(() => {
    if (!snap.channel) return undefined;
    let active = true;
    const checkMute = async () => {
      const mute = await fetchMyMute();
      if (active && mute) callEngine.leave();
    };
    checkMute();
    const timer = window.setInterval(checkMute, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [snap.channel?.code]);

  useEffect(() => {
    if (!snap.channel?.ticketCall || !snap.channel?.ticketId) return undefined;
    let active = true;

    const validateOpenTicketCall = async () => {
      try {
        const res = await base44.functions.invoke("ticketOps", {
          action: "validate_ticket_call",
          ticket_id: snap.channel.ticketId,
        });
        if (active && res?.data?.allowed !== true) callEngine.leave();
      } catch (error) {
        const status = Number(error?.response?.status || error?.status || 0);
        if (active && [403, 404, 409].includes(status)) callEngine.leave();
      }
    };

    validateOpenTicketCall();
    const timer = window.setInterval(validateOpenTicketCall, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [snap.channel?.code, snap.channel?.ticketCall, snap.channel?.ticketId]);

  const join = async (channel) => {
    const mute = await fetchMyMute();
    if (mute) {
      const error = new Error("muted");
      error.code = "muted";
      error.mute = mute;
      throw error;
    }

    // Ticket call nunca confia apenas no estado visual. Antes de tocar no
    // microfone/WebRTC, confirma no servidor que o ticket continua aberto.
    if (channel?.ticketCall && channel?.ticketId) {
      try {
        const validation = await base44.functions.invoke("ticketOps", {
          action: "validate_ticket_call",
          ticket_id: channel.ticketId,
        });
        if (validation?.data?.allowed !== true) {
          throw new Error(validation?.data?.error || "A call deste ticket está indisponível.");
        }
      } catch (cause) {
        const error = new Error(cause?.response?.data?.error || cause?.message || "A call deste ticket está indisponível.");
        error.code = "ticket_call_locked";
        throw error;
      }
    }

    const profile = {
      name: displayName(user),
      avatar: (user && user.profile && user.profile.avatar_url) || null,
      frame: (user && user.profile && user.profile.frame) || null,
      banner: (user && user.profile && user.profile.banner_url) || null,
      user_id: user?.id || null,
    };
    return callEngine.join(channel, profile);
  };

  return (
    <CallContext.Provider
      value={{
        channel: snap.channel,
        connected: snap.connected,
        micOn: snap.micOn,
        deafened: snap.deafened,
        camOn: snap.camOn,
        sharing: snap.sharing,
        micStream: snap.micStream,
        localStream: snap.localStream,
        shareOptions: snap.shareOptions,
        coreOsJoined: snap.coreOsJoined,
        coreOsMessages: snap.coreOsMessages,
        joinError: snap.joinError,
        me: snap.me,
        peers: snap.peers,
        setChannel: join,
        toggleMic: () => callEngine.toggleMic(),
        toggleDeafened: () => callEngine.toggleDeafened(),
        toggleCam: () => callEngine.toggleCam(),
        toggleShare: (options) => callEngine.toggleShare(options),
        setShareOptions: (options) => callEngine.setShareOptions(options),
        setPeerVolume: (seat, volume) => callEngine.setPeerVolume(seat, volume),
        setCoreOsJoined: (joined) => callEngine.setCoreOsJoined(joined),
        sendCoreOsMessage: (text) => callEngine.sendCoreOsMessage(text),
        leave: () => callEngine.leave(),
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export const useCall = () => useContext(CallContext);