import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Volume2,
  VolumeX,
  PhoneOff,
  Maximize2,
  Activity,
} from "lucide-react";
import { useCall } from "@/lib/CallContext";
import ProfileAvatar from "@/components/ProfileAvatar";
import PeerTile from "@/components/calls/PeerTile";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import CallMuteIndicators from "@/components/calls/CallMuteIndicators";

let privateControlAudioContext = null;

function getPrivateControlAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!privateControlAudioContext || privateControlAudioContext.state === "closed") {
    privateControlAudioContext = new AudioCtx();
  }
  return privateControlAudioContext;
}

function playPrivateControlTone(action, enabled) {
  const ctx = getPrivateControlAudioContext();
  if (!ctx) return;

  const patterns = {
    mic: enabled ? [520, 700] : [700, 420],
    audio: enabled ? [430, 610] : [610, 330],
    camera: enabled ? [560, 760] : [760, 460],
    share: enabled ? [390, 540, 720] : [720, 520, 360],
  };
  const notes = patterns[action] || (enabled ? [500, 680] : [680, 420]);

  const play = () => {
    try {
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      master.connect(ctx.destination);

      notes.forEach((frequency, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + index * 0.07;
        osc.type = "sine";
        osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.48, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(start + 0.1);
      });
    } catch {
      /* feedback sonoro opcional */
    }
  };

  if (ctx.state === "suspended") ctx.resume().then(play).catch(() => {});
  else play();
}

/**
 * Call privada dentro da conversa direta: tiles compactos + controles,
 * estilo Discord — sem sair do privado.
 */
export default function PrivateCallPanel({ partner }) {
  const { t } = useI18n();
  const {
    channel,
    connected,
    micOn,
    deafened,
    camOn,
    sharing,
    localStream,
    shareOptions,
    me,
    peers,
    toggleMic,
    toggleDeafened,
    toggleCam,
    toggleShare,
    setShareOptions,
    leave,
  } = useCall();
  const videoRef = useRef(null);
  const localTileRef = useRef(null);
  const panelRef = useRef(null);
  const showVideo = camOn || sharing;
  const screenSharing = sharing || peers.some((peer) => peer.sharing);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = showVideo ? localStream : null;
    if (showVideo && localStream) video.play().catch(() => {});
  }, [showVideo, localStream]);

  const ctrl = "grid h-10 w-10 place-items-center rounded-full transition-colors";
  const toggleLocalFullscreen = () => {
    const el = localTileRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch?.(() => {});
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  const togglePanelFullscreen = () => {
    const el = panelRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch?.(() => {});
      return;
    }
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  return (
    <div ref={panelRef} className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain bg-background sm:gap-2.5 sm:overflow-hidden">
      <div className={cn(
        "min-h-[250px] gap-2 sm:min-h-0 sm:flex-1 sm:gap-2.5",
        screenSharing
          ? "flex min-h-0 flex-1 flex-col overflow-hidden"
          : "grid flex-none auto-rows-fr overflow-visible sm:grid-cols-2 sm:overflow-hidden"
      )}> 
        {/* Seu tile */}
        <div ref={localTileRef} className={cn(
          "call-media-tile relative grid min-h-[110px] place-items-center overflow-hidden rounded-2xl border border-border/50 bg-[#0a0a0a]",
          sharing
            ? "order-1 min-h-0 w-full flex-1 sm:min-h-[280px]"
            : screenSharing
              ? "order-2 h-24 min-h-24 shrink-0 sm:h-28 sm:min-h-28"
              : "h-full"
        )}>
          {showVideo ? (
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className={cn("call-media-video h-full w-full bg-black", sharing ? "object-contain" : "object-cover")}
            />
          ) : (
            <div className="px-4 text-center">
              <ProfileAvatar name={me.name} avatar={me.avatar} size="lg" frame={me.frame} className="mx-auto" />
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-bold text-black">
            {t("common.you")}
          </span>
          <CallMuteIndicators micMuted={!micOn} deafened={deafened} className="absolute right-3 top-3" />
          {showVideo && !sharing && (
            <button
              type="button"
              onClick={toggleLocalFullscreen}
              title={t("call.fullscreen")}
              className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/85"
              aria-label="Colocar vídeo em tela cheia"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {peers.length > 0 ? (
          peers.map((peer) => (
            <PeerTile
              key={peer.seat}
              peer={peer}
              muted={deafened}
              compact
              className={peer.sharing
                ? "order-1 min-h-0 w-full flex-1 sm:min-h-[280px]"
                : screenSharing
                  ? "order-2 h-24 min-h-24 shrink-0 sm:h-28 sm:min-h-28"
                  : undefined}
            />
          ))
        ) : (
          <div className={cn("grid place-items-center overflow-hidden rounded-2xl border border-border/50 bg-[#0a0a0a] text-center", screenSharing ? "order-2 h-24 min-h-24 shrink-0 sm:h-28 sm:min-h-28" : "h-full min-h-[110px]")}>
            <div className="px-4">
              <ProfileAvatar
                name={partner.name}
                avatar={partner.avatar}
                size="lg"
                className="mx-auto opacity-70"
              />
              <p className="mt-2 text-xs font-semibold">{partner.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {t("dm.call_waiting")}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-20 flex shrink-0 flex-wrap items-center justify-center gap-2 rounded-2xl border border-border/40 bg-background/95 px-2 py-2 shadow-lg backdrop-blur sm:relative">
        <span className="mr-1 flex items-center gap-1 text-[11px] font-bold text-emerald-400">
          <Activity className="h-3.5 w-3.5" />
          {connected ? t("call.connected") : t("call.connecting")}
        </span>
        <button
          onClick={() => {
            playPrivateControlTone("mic", !micOn);
            toggleMic();
          }}
          title={micOn ? t("call.mic_disable") : t("call.mic_enable")}
          className={cn(
            ctrl,
            micOn ? "bg-secondary text-foreground hover:bg-accent" : "bg-destructive text-destructive-foreground"
          )}
        >
          {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </button>
        <button
          onClick={() => {
            playPrivateControlTone("camera", !camOn);
            toggleCam();
          }}
          title={camOn ? t("call.cam_disable") : t("call.cam_enable")}
          className={cn(
            ctrl,
            camOn ? "bg-secondary text-foreground hover:bg-accent" : "bg-destructive text-destructive-foreground"
          )}
        >
          {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </button>
        <div className="grid w-full grid-cols-3 items-center gap-1 rounded-xl border border-border/40 bg-secondary/30 p-1 sm:flex sm:w-auto">
          <select
            value={shareOptions?.quality || "1080p"}
            onChange={(e) => setShareOptions({ quality: e.target.value })}
            disabled={sharing}
            className="h-8 min-w-0 rounded-lg border border-border/50 bg-background px-1.5 text-[10px] font-semibold outline-none disabled:opacity-50"
            aria-label="Qualidade da transmissão"
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="1440p">1440p</option>
          </select>
          <select
            value={shareOptions?.fps || 30}
            onChange={(e) => setShareOptions({ fps: Number(e.target.value) })}
            disabled={sharing}
            className="h-8 min-w-0 rounded-lg border border-border/50 bg-background px-1.5 text-[10px] font-semibold outline-none disabled:opacity-50"
            aria-label="FPS da transmissão"
          >
            <option value={15}>15</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
          <button
            onClick={() => {
              playPrivateControlTone("share", !sharing);
              toggleShare();
            }}
            title={t("call.share_screen")}
            className={cn(ctrl, sharing ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-accent")}
          >
            <MonitorUp className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={() => {
            playPrivateControlTone("audio", deafened);
            toggleDeafened();
          }}
          title={deafened ? t("call.audio_enable") : t("call.audio_disable")}
          className={cn(
            ctrl,
            !deafened ? "bg-secondary text-foreground hover:bg-accent" : "bg-destructive text-destructive-foreground"
          )}
        >
          {!deafened ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
        {channel?.ticketCall ? (
          <button type="button" onClick={togglePanelFullscreen} title={t("call.fullscreen")} className={cn(ctrl, "hidden bg-secondary text-foreground hover:bg-accent sm:grid")}>
            <Maximize2 className="h-4 w-4" />
          </button>
        ) : (
          <Link to="/calls" title={t("dm.open_full_room")} className={cn(ctrl, "hidden bg-secondary text-foreground hover:bg-accent sm:grid")}>
            <Maximize2 className="h-4 w-4" />
          </Link>
        )}
        <button
          onClick={leave}
          className="flex items-center gap-1.5 rounded-full bg-destructive px-4 py-2.5 text-xs font-bold text-destructive-foreground transition-colors hover:bg-destructive/90"
        >
          <PhoneOff className="h-4 w-4" /> {t("call.leave")}
        </button>
      </div>
    </div>
  );
}