import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSiteConfig } from "@/lib/SiteConfigContext";
import { SITE_INTRO_AUDIO_SRC } from "@/lib/siteIntroAudio";
import { NEBULA_LOGO_URL, NEBULA_WALLPAPER_URL } from "@/lib/brandAssets";
const INTRO_VOLUME = 0.5;
const FADE_SECONDS = 1.8;
const REVERB_TAIL_MS = 1050;

function createImpulse(context, seconds = 2.25, decay = 3.3) {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const envelope = Math.pow(1 - i / length, decay);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }
  return buffer;
}

export default function SiteIntro({ onComplete }) {
  const { config: siteConfig } = useSiteConfig();
  const [fading, setFading] = useState(false);
  const [waitingForInteraction, setWaitingForInteraction] = useState(false);
  const audioRef = useRef(null);
  const graphRef = useRef(null);
  const doneRef = useRef(false);
  const fadeStartedRef = useRef(false);
  const retryCleanupRef = useRef(() => {});

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    retryCleanupRef.current?.();

    const audio = audioRef.current;
    if (audio) {
      try { audio.pause(); } catch {}
      try {
        audio.removeAttribute("src");
        audio.load();
      } catch {}
    }

    const graph = graphRef.current;
    if (graph?.context && graph.context.state !== "closed") {
      window.setTimeout(() => {
        try { graph.context.close(); } catch {}
      }, 80);
    }

    onComplete?.();
  }, [onComplete]);

  const beginFade = useCallback(() => {
    if (fadeStartedRef.current) return;
    fadeStartedRef.current = true;
    setFading(true);

    const graph = graphRef.current;
    if (graph?.context && graph?.dryGain && graph?.wetGain) {
      const now = graph.context.currentTime;
      try {
        graph.dryGain.gain.cancelScheduledValues(now);
        graph.wetGain.gain.cancelScheduledValues(now);
        graph.dryGain.gain.setValueAtTime(Math.max(0.001, graph.dryGain.gain.value), now);
        graph.wetGain.gain.setValueAtTime(Math.max(0.001, graph.wetGain.gain.value), now);
        graph.dryGain.gain.linearRampToValueAtTime(0.0001, now + 1.55);
        graph.wetGain.gain.linearRampToValueAtTime(0.18, now + 0.22);
        graph.wetGain.gain.exponentialRampToValueAtTime(0.001, now + 2.1);
      } catch {}
    } else if (audioRef.current) {
      const audio = audioRef.current;
      const started = performance.now();
      const initial = Number.isFinite(audio.volume) ? audio.volume : INTRO_VOLUME;
      const fade = () => {
        const progress = Math.min(1, (performance.now() - started) / 1550);
        audio.volume = Math.max(0, initial * (1 - progress));
        if (progress < 1 && !doneRef.current) requestAnimationFrame(fade);
      };
      requestAnimationFrame(fade);
    }
  }, []);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const audio = new Audio(SITE_INTRO_AUDIO_SRC);
    audioRef.current = audio;
    audio.preload = "auto";
    audio.playsInline = true;
    audio.volume = INTRO_VOLUME;

    const setupGraph = async () => {
      if (graphRef.current) return graphRef.current;
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return null;

      try {
        const context = new AudioContextCtor();
        const source = context.createMediaElementSource(audio);
        const dryGain = context.createGain();
        const wetGain = context.createGain();
        const convolver = context.createConvolver();

        convolver.buffer = createImpulse(context);
        dryGain.gain.value = INTRO_VOLUME;
        wetGain.gain.value = 0.105;
        audio.volume = 1;

        source.connect(dryGain);
        dryGain.connect(context.destination);
        source.connect(convolver);
        convolver.connect(wetGain);
        wetGain.connect(context.destination);

        graphRef.current = { context, source, dryGain, wetGain, convolver };
        return graphRef.current;
      } catch {
        audio.volume = INTRO_VOLUME;
        return null;
      }
    };

    const play = async () => {
      if (doneRef.current) return;
      if (window.localStorage.getItem("nebula:ambient-paused") === "1") {
        try { audio.pause(); } catch {}
        setWaitingForInteraction(false);
        return;
      }
      try {
        const graph = await setupGraph();
        if (graph?.context?.state === "suspended") await graph.context.resume();
        await audio.play();
        setWaitingForInteraction(false);
        retryCleanupRef.current?.();
      } catch {
        setWaitingForInteraction(true);
      }
    };

    const retry = () => play();
    const cleanupRetry = () => {
      window.removeEventListener("pointerdown", retry, true);
      window.removeEventListener("touchstart", retry, true);
      window.removeEventListener("keydown", retry, true);
    };
    retryCleanupRef.current = cleanupRetry;

    const onTimeUpdate = () => {
      const duration = Number(audio.duration);
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (duration - audio.currentTime <= FADE_SECONDS) beginFade();
    };
    const onEnded = () => {
      beginFade();
      window.setTimeout(finish, REVERB_TAIL_MS);
    };
    const onError = () => {
      setFading(true);
      window.setTimeout(finish, 500);
    };

    const onGlobalPause = () => {
      try { audio.pause(); } catch {}
      try { audio.muted = true; } catch {}
      setWaitingForInteraction(false);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    window.addEventListener("nebula:ambient-pause-all", onGlobalPause);

    const ambientPaused = window.localStorage.getItem("nebula:ambient-paused") === "1";
    if (!ambientPaused) {
      window.addEventListener("pointerdown", retry, true);
      window.addEventListener("touchstart", retry, true);
      window.addEventListener("keydown", retry, true);
      play();
    } else {
      try { audio.pause(); } catch {}
      setWaitingForInteraction(false);
    }

    const safetyTimer = window.setTimeout(() => {
      beginFade();
      window.setTimeout(finish, 900);
    }, 15000);

    return () => {
      window.clearTimeout(safetyTimer);
      cleanupRetry();
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      window.removeEventListener("nebula:ambient-pause-all", onGlobalPause);
      try { audio.pause(); } catch {}
      const graph = graphRef.current;
      if (graph?.context && graph.context.state !== "closed") {
        try { graph.context.close(); } catch {}
      }
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [beginFade, finish]);

  const logoUrl = NEBULA_LOGO_URL;
  const brandName = siteConfig.brand?.name || "NÉBULA OS";

  return (
    <div
      className={
        "fixed inset-0 z-[250] grid place-items-center overflow-hidden bg-black transition-all ease-out " +
        (fading ? "pointer-events-none scale-[1.025] opacity-0 blur-[2px]" : "opacity-100")
      }
      style={{
        transitionDuration: "1600ms",
        background:
          "radial-gradient(circle at 50% 44%, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 28%, #000 66%)",
      }}
      aria-label="Intro do Nébula OS"
    >
      <img src={NEBULA_WALLPAPER_URL} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.28]" />
      <div className="pointer-events-none absolute inset-0 bg-black/45" />
      <div className="relative flex -translate-y-2 flex-col items-center px-6 text-center">
        <div className="absolute h-44 w-72 rounded-full bg-white/[0.018] blur-3xl sm:h-56 sm:w-96" />
        <img
          src={logoUrl}
          alt={brandName}
          className="relative h-28 w-48 object-contain sm:h-36 sm:w-60"
          draggable={false}
        />
        <p className="relative mt-5 text-[13px] font-extrabold tracking-[0.32em] text-red-500 drop-shadow-[0_0_12px_rgba(239,35,60,0.35)] sm:text-sm">
          TNs Tecnollogy
        </p>
        {waitingForInteraction ? (
          <p className="relative mt-5 animate-pulse text-[10px] font-medium tracking-[0.16em] text-white/45">
            Toque para iniciar
          </p>
        ) : null}
      </div>
    </div>
  );
}
