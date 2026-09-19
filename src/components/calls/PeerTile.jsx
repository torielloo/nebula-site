import React, { useEffect, useRef } from "react";
import { Maximize2, Volume2, VolumeX } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import ProfileCard from "@/components/calls/ProfileCard";
import { callEngine } from "@/lib/callEngine";
import CallMuteIndicators from "@/components/calls/CallMuteIndicators";

/** Tile de um participante remoto: vídeo, avatar, nome, estado do mic e tela cheia. */
export default function PeerTile({ peer, muted, compact = false, className }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const audioRef = useRef(null);
  const tileRef = useRef(null);
  const hasStream = !!peer.stream;
  const trackCount = hasStream ? peer.stream.getTracks().length : 0;
  const hasVideo = hasStream && (peer.camOn || peer.sharing);

  useEffect(() => {
    const video = ref.current;
    const audio = audioRef.current;
    if (video) {
      if (peer.stream && video.srcObject !== peer.stream) video.srcObject = peer.stream;
      if (!peer.stream) video.srcObject = null;
      if (peer.stream && hasVideo) video.play().catch(() => {});
    }
    if (!audio) return undefined;

    if (peer.stream && audio.srcObject !== peer.stream) audio.srcObject = peer.stream;
    if (!peer.stream) audio.srcObject = null;
    audio.muted = Boolean(muted);
    audio.volume = Math.max(0, Math.min(1, Number(peer.volume ?? 1)));

    let cleanupUnlock = null;
    const tryPlay = async () => {
      if (!peer.stream?.getAudioTracks?.().length || muted) return true;
      try {
        await audio.play();
        return true;
      } catch {
        return false;
      }
    };
    const armUnlock = () => {
      const retry = async () => {
        if (await tryPlay()) cleanupUnlock?.();
      };
      const cleanup = () => {
        document.removeEventListener("pointerdown", retry, true);
        document.removeEventListener("keydown", retry, true);
      };
      cleanupUnlock = cleanup;
      document.addEventListener("pointerdown", retry, true);
      document.addEventListener("keydown", retry, true);
    };

    tryPlay().then((ok) => { if (!ok) armUnlock(); });
    return () => cleanupUnlock?.();
  }, [peer.stream, trackCount, hasVideo, muted, peer.volume]);

  // O <audio> dedicado é a saída principal do participante remoto. O vídeo fica
  // sempre mudo para nunca duplicar o som. Desligamos a saída Web Audio antiga
  // para evitar eco/fase e para corrigir o caso em que um dos lados não ouvia.
  useEffect(() => {
    callEngine.setPeerMuted(peer.seat, true);
    const audio = audioRef.current;
    if (audio) {
      audio.muted = Boolean(muted);
      if (!muted && peer.stream?.getAudioTracks?.().length) audio.play().catch(() => {});
    }
    return () => callEngine.setPeerMuted(peer.seat, false);
  }, [peer.seat, muted, peer.stream]);

  // Tela cheia no próprio <video>: fullscreen nativo, sem artefatos/piscadas
  const toggleFullscreen = () => {
    const el = tileRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  return (
    <div
      ref={tileRef}
      className={cn(
        "call-media-tile relative grid place-items-center overflow-hidden rounded-2xl border border-border/50 bg-[#0a0a0a]",
        compact ? "h-full min-h-[110px] aspect-auto" : "aspect-video",
        peer.sharing && (compact ? "min-h-0 sm:col-span-2" : "h-[min(56vh,620px)] min-h-[280px] w-full aspect-auto sm:col-span-2 xl:col-span-3"),
        className
      )}
    >
      <audio ref={audioRef} autoPlay className="hidden" />
      {/* object-contain na transmissão de tela: sem cortes nem distorções */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className={cn(
          "call-media-video h-full w-full bg-black",
          peer.sharing ? "object-contain" : "object-cover",
          !hasVideo && "hidden"
        )}
      />
      {!hasVideo && (
        <ProfileCard
          profile={{
            name: peer.name,
            avatar: peer.avatar,
            frame: peer.frame,
            banner: peer.banner,
            micOn: peer.micOn,
            camOn: peer.camOn,
            sharing: peer.sharing,
            user_id: peer.user_id,
          }}
        >
          <button type="button" className="px-4 text-center transition-opacity hover:opacity-80" title={t("call.view_profile")}>
            <ProfileAvatar
              name={peer.name}
              avatar={peer.avatar}
              size={compact ? "lg" : "xl"}
              frame={peer.frame}
              className="mx-auto"
            />
            <p className="mt-3 text-xs font-semibold">{peer.name}</p>
          </button>
        </ProfileCard>
      )}
      <span className="absolute left-3 top-3">
        <ProfileCard
          profile={{
            name: peer.name,
            avatar: peer.avatar,
            frame: peer.frame,
            banner: peer.banner,
            micOn: peer.micOn,
            camOn: peer.camOn,
            sharing: peer.sharing,
            user_id: peer.user_id,
          }}
        >
          <button
            type="button"
            title={t("call.view_profile")}
            className="rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur transition-colors hover:bg-black/80"
          >
            {peer.name}
          </button>
        </ProfileCard>
      </span>
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/65 px-2.5 py-1.5 text-white backdrop-blur">
        {muted || Number(peer.volume ?? 1) <= 0 ? <VolumeX className="h-3.5 w-3.5 shrink-0 text-amber-300" /> : <Volume2 className="h-3.5 w-3.5 shrink-0" />}
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={peer.volume ?? 1}
          onChange={(e) => callEngine.setPeerVolume(peer.seat, Number(e.target.value))}
          className="w-20 accent-white"
          aria-label={`Volume de ${peer.name}`}
        />
      </div>
      <CallMuteIndicators
        micMuted={!peer.micOn}
        deafened={Boolean(peer.deafened)}
        className="absolute right-3 top-3"
      />
      {hasVideo && (
        <button
          onClick={toggleFullscreen}
          title={t("call.fullscreen")}
          className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}