import React, { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Pause, Play, Volume2, VolumeX } from "lucide-react";

function fmt(value) {
  const total = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const min = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

export default function VoiceMessagePlayer({ src, name = "Mensagem de voz", onError }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setLoadError(false);
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const onTime = () => setCurrent(audio.currentTime || 0);
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => { setPlaying(false); setCurrent(0); };
    const onErrorEvent = () => {
      setPlaying(false);
      setLoadError(true);
      onError?.();
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onErrorEvent);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onErrorEvent);
    };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  const progress = useMemo(() => duration > 0 ? Math.min(100, (current / duration) * 100) : 0, [current, duration]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      setLoadError(false);
      await audio.play().catch(() => {
        setLoadError(true);
        onError?.();
      });
    } else audio.pause();
  };

  const seek = (event) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const next = (Number(event.target.value) / 100) * duration;
    audio.currentTime = next;
    setCurrent(next);
  };

  return (
    <div className="w-full max-w-[460px] rounded-2xl border border-white/[0.08] bg-[#0d0d0d] px-3 py-2.5 shadow-sm">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={togglePlay} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-black transition-transform hover:scale-[1.03]" aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}>
          {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <AudioLines className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-[11px] font-semibold text-foreground">{name || "Mensagem de voz"}</span>
            <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">{fmt(current)} / {fmt(duration)}</span>
          </div>
          <input type="range" min="0" max="100" step="0.1" value={progress} onChange={seek} className="h-1.5 w-full cursor-pointer accent-white" aria-label="Progresso do áudio" />
        </div>
      </div>
      {loadError && (
        <div className="mt-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2">
          <p className="mb-1.5 text-[10px] font-semibold text-muted-foreground">Recarregando áudio privado. Se não tocar, use o controle abaixo.</p>
          <audio src={src} controls preload="metadata" className="h-9 w-full" />
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 pl-[46px]">
        <button type="button" onClick={() => setMuted((v) => !v)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/[0.05] hover:text-foreground" aria-label={muted ? "Ativar som" : "Silenciar áudio"}>
          {muted || volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
        <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => { const v = Number(e.target.value); setVolume(v); if (v > 0) setMuted(false); }} className="h-1.5 min-w-0 flex-1 cursor-pointer accent-white" aria-label="Volume do áudio" />
      </div>
    </div>
  );
}
