import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Headphones, Music2, Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { useCall } from "@/lib/CallContext";
import { getNebulaOfficialTrackUrl, NEBULA_DEFAULT_QUEUE, NEBULA_DEFAULT_TRACKS, NEBULA_OFFICIAL_TRACK } from "@/lib/nebulaOfficialTrack";
import { AMBIENT_BEAT_EVENT, getAmbientBeatPreferences } from "@/lib/ambientMusicPreferences";
import { EVENT_SELECT, STORAGE_QUEUE, STORAGE_TRACK, readMusicQueue, selectNebulaTrack } from "@/lib/nebulaMusicQueue";

const DEFAULT_VOLUME = 0.12;
const MAX_VOLUME = 0.7;
const STORAGE_VOLUME = "nebula:ambient-volume";
const STORAGE_PAUSED = "nebula:ambient-paused";
const STORAGE_BUBBLE = "nebula:music-bubble-position";
const STORAGE_PLAYBACK = "nebula:ambient-playback-position";
const AMBIENT_CHANNEL = "nebula-ambient-music";
const STORAGE_OWNER = "nebula:ambient-owner";
const GLOBAL_ENGINE_KEY = "__nebulaAmbientEngineV3";

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

function readStoredPaused() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_PAUSED) === "1";
}

function readStoredVolume() {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  const value = Number(window.localStorage.getItem(STORAGE_VOLUME));
  return Number.isFinite(value) ? clamp(value, 0, MAX_VOLUME) : DEFAULT_VOLUME;
}

function readTrack() {
  if (typeof window === "undefined") return NEBULA_OFFICIAL_TRACK;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_TRACK) || "null");
    // Migra automaticamente a faixa única antiga para as 5 faixas oficiais.
    if (saved?.id === "nebula-official-mxrked" || saved?.track_url === "nebula://official-track") {
      window.localStorage.setItem(STORAGE_TRACK, JSON.stringify(NEBULA_DEFAULT_TRACKS[0]));
      window.localStorage.setItem(STORAGE_QUEUE, JSON.stringify(NEBULA_DEFAULT_QUEUE));
      return NEBULA_DEFAULT_TRACKS[0];
    }
    if (saved?.id && saved?.track_url && saved?.title) return saved;
  } catch { /* preferência antiga inválida */ }
  try {
    window.localStorage.setItem(STORAGE_TRACK, JSON.stringify(NEBULA_DEFAULT_TRACKS[0]));
    window.localStorage.setItem(STORAGE_QUEUE, JSON.stringify(NEBULA_DEFAULT_QUEUE));
  } catch {}
  return NEBULA_DEFAULT_TRACKS[0];
}

function readStoredPlaybackPosition(trackId) {
  if (typeof window === "undefined" || !trackId) return 0;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_PLAYBACK) || "null");
    if (saved?.trackId === trackId && Number.isFinite(saved.time) && saved.time > 0) return saved.time;
  } catch {}
  return 0;
}

function storePlaybackPosition(trackId, time) {
  if (typeof window === "undefined" || !trackId || !Number.isFinite(time) || time < 0) return;
  try {
    window.localStorage.setItem(STORAGE_PLAYBACK, JSON.stringify({ trackId, time, savedAt: Date.now() }));
  } catch {}
}

function readBubblePosition() {
  if (typeof window === "undefined") return { side: "right", y: 0.74 };
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_BUBBLE) || "null");
    if (saved && ["left", "right"].includes(saved.side) && Number.isFinite(saved.y)) {
      return { side: saved.side, y: clamp(saved.y, 0.14, 0.84) };
    }
  } catch { /* posição antiga inválida */ }
  return { side: "right", y: 0.74 };
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function pickRandomTrack(items, currentTrackId) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return null;
  const candidates = list.length > 1 ? list.filter((item) => item.id !== currentTrackId) : list;
  const pool = candidates.length ? candidates : list;
  return pool[Math.floor(Math.random() * pool.length)] || pool[0] || null;
}

function getAmbientEngine() {
  if (typeof window === "undefined") return null;
  if (!window[GLOBAL_ENGINE_KEY]) {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.dataset.nebulaAmbientPlayer = "1";
    window[GLOBAL_ENGINE_KEY] = {
      audio,
      context: null,
      analyser: null,
      source: null,
      bass: null,
      mids: null,
      highs: null,
      compressor: null,
      gain: null,
      owner: null,
    };
  }
  return window[GLOBAL_ENGINE_KEY];
}

export default function AmbientMusicPlayer() {
  const engine = getAmbientEngine();
  const audioRef = useRef(engine?.audio || null);
  const audioContextRef = useRef(engine?.context || null);
  const analyserRef = useRef(engine?.analyser || null);
  const sourceRef = useRef(engine?.source || null);
  const bassFilterRef = useRef(engine?.bass || null);
  const midFilterRef = useRef(engine?.mids || null);
  const highFilterRef = useRef(engine?.highs || null);
  const compressorRef = useRef(engine?.compressor || null);
  const outputGainRef = useRef(engine?.gain || null);
  const effectiveVolumeRef = useRef(DEFAULT_VOLUME);
  const lastAudibleVolumeRef = useRef(readStoredVolume() || DEFAULT_VOLUME);
  const resumeAfterTrackChangeRef = useRef(false);
  const entryAutoplayAttemptedRef = useRef(false);
  const playbackWantedRef = useRef(!readStoredPaused());
  const instanceIdRef = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `music-${Date.now()}-${Math.random()}`);
  const broadcastRef = useRef(null);
  const autoplayUnlockingRef = useRef(false);
  const playbackVersionRef = useRef(0);
  const playPromiseRef = useRef(null);
  const rafRef = useRef(0);
  const releaseRef = useRef(0);
  const energyRef = useRef(0.08);
  const lastBeatRef = useRef(0);
  const beatPhaseRef = useRef(false);
  const queueRef = useRef(readMusicQueue() || NEBULA_DEFAULT_QUEUE);
  const dragRef = useRef(null);
  const skipRestoreRef = useRef(false);
  const lastPositionSaveRef = useRef(0);
  const { connected } = useCall() || {};

  const [track, setTrack] = useState(readTrack);
  const [src, setSrc] = useState("");
  const [volume, setVolume] = useState(readStoredVolume);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [open, setOpen] = useState(false);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [bubblePosition, setBubblePosition] = useState(readBubblePosition);
  const [beatStrength, setBeatStrength] = useState(0);
  const [beatPrefs, setBeatPrefs] = useState(getAmbientBeatPreferences);
  const [queueTracks, setQueueTracks] = useState(() => readMusicQueue()?.tracks || NEBULA_DEFAULT_TRACKS);

  const effectiveVolume = useMemo(() => clamp(volume * (connected ? 0.22 : 1), 0, MAX_VOLUME), [volume, connected]);
  const currentQueueIndex = useMemo(() => queueTracks.findIndex((item) => item.id === track?.id), [queueTracks, track?.id]);

  useEffect(() => {
    playbackWantedRef.current = !readStoredPaused();

    // Limpa qualquer <audio> legado que tenha sobrado de uma versão anterior
    // do player durante atualização/HMR. O player atual usa somente o singleton
    // global criado por getAmbientEngine().
    document.querySelectorAll("audio[data-nebula-ambient-player]").forEach((node) => {
      try { node.pause(); } catch { /* ignore */ }
      try { node.removeAttribute("src"); node.load(); } catch { /* ignore */ }
      try { node.remove(); } catch { /* ignore */ }
    });

    const shared = getAmbientEngine();
    if (shared) {
      audioRef.current = shared.audio;
      audioContextRef.current = shared.context;
      analyserRef.current = shared.analyser;
      sourceRef.current = shared.source;
      bassFilterRef.current = shared.bass;
      midFilterRef.current = shared.mids;
      highFilterRef.current = shared.highs;
      compressorRef.current = shared.compressor;
      outputGainRef.current = shared.gain;
      shared.owner = instanceIdRef.current;
    }

    const hardPause = ({ preservePreference = true } = {}) => {
      playbackVersionRef.current += 1;
      resumeAfterTrackChangeRef.current = false;
      if (!preservePreference) playbackWantedRef.current = false;
      const audio = audioRef.current;
      if (audio) {
        try { audio.pause(); } catch { /* ignore */ }
      }
      const gain = outputGainRef.current || getAmbientEngine()?.gain;
      const context = audioContextRef.current || getAmbientEngine()?.context;
      if (gain && context) {
        try {
          gain.gain.cancelScheduledValues(context.currentTime);
          gain.gain.setValueAtTime(0, context.currentTime);
        } catch { gain.gain.value = 0; }
      }
      setPlaying(false);
      setNeedsInteraction(false);
    };

    const onPreference = (event) => setBeatPrefs(event?.detail || getAmbientBeatPreferences());
    const onStorage = (event) => {
      if (event.key === STORAGE_PAUSED && event.newValue === "1") {
        playbackWantedRef.current = false;
        hardPause({ preservePreference: false });
        return;
      }
      if (event.key === STORAGE_OWNER && event.newValue) {
        try {
          const owner = JSON.parse(event.newValue);
          if (owner?.id && owner.id !== instanceIdRef.current) hardPause({ preservePreference: true });
        } catch { /* valor inválido */ }
      }
    };
    window.addEventListener(AMBIENT_BEAT_EVENT, onPreference);
    window.addEventListener("storage", onStorage);

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(AMBIENT_CHANNEL);
      broadcastRef.current = channel;
      channel.onmessage = (event) => {
        const data = event?.data || {};
        if (data.type === "playing" && data.id !== instanceIdRef.current) {
          hardPause({ preservePreference: true });
        } else if (data.type === "paused") {
          playbackWantedRef.current = false;
          hardPause({ preservePreference: false });
        }
      };
    }

    return () => {
      window.removeEventListener(AMBIENT_BEAT_EVENT, onPreference);
      window.removeEventListener("storage", onStorage);
      if (broadcastRef.current) {
        try { broadcastRef.current.close(); } catch { /* ignore */ }
        broadcastRef.current = null;
      }
      const currentEngine = getAmbientEngine();
      if (currentEngine?.owner === instanceIdRef.current) {
        hardPause({ preservePreference: true });
        currentEngine.owner = null;
      }
    };
  }, []);

  useEffect(() => {
    effectiveVolumeRef.current = effectiveVolume;
    const audio = audioRef.current;
    const gain = outputGainRef.current;
    if (gain && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      const target = playbackWantedRef.current ? effectiveVolume : 0;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(target, now, 0.025);
      if (audio) audio.volume = 1;
    } else if (audio) {
      audio.volume = playbackWantedRef.current ? effectiveVolume : 0;
    }
  }, [effectiveVolume]);

  useEffect(() => {
    let alive = true;
    setLoadFailed(false);
    const resolve = async () => {
      try {
        const next = track?.track_url === "nebula://official-track"
          ? await getNebulaOfficialTrackUrl()
          : String(track?.track_url || "");
        if (alive) setSrc(next);
      } catch {
        if (alive) { setSrc(""); setLoadFailed(true); }
      }
    };
    resolve();
    return () => { alive = false; };
  }, [track]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("musicLibrary", { action: "official_list" });
        const tracks = Array.isArray(res.data?.tracks) ? res.data.tracks : [];
        const queue = res.data?.queue || (tracks.length ? { id: "nebula-defaults", name: "Padrões Nébula", source: "official-defaults", tracks } : null);
        if (!alive || !queue?.tracks?.length) return;

        const storedQueue = readMusicQueue();
        const personalAllowed = res.data?.nitro_active === true;
        const personalSelection = track?.id && !track?.is_official && track?.track_url !== "nebula://official-track";
        if (!personalAllowed || !personalSelection || !storedQueue?.tracks?.length || storedQueue.source === "official-defaults") {
          queueRef.current = queue;
          setQueueTracks(queue.tracks);
          localStorage.setItem(STORAGE_QUEUE, JSON.stringify(queue));
          const same = queue.tracks.find((item) => item.id === track?.id);
          const nextTrack = same || queue.tracks[0];
          if (!same || track?.track_url === "nebula://official-track") {
            selectNebulaTrack(nextTrack, queue, { autoplay: false });
          }
        }
      } catch {
        const fallback = readMusicQueue();
        const safeQueue = fallback?.tracks?.length && fallback.source === "official-defaults"
          ? fallback
          : NEBULA_DEFAULT_QUEUE;
        queueRef.current = safeQueue;
        setQueueTracks(safeQueue.tracks);
        try {
          localStorage.setItem(STORAGE_QUEUE, JSON.stringify(safeQueue));
          const currentIsOfficial = safeQueue.tracks.some((item) => item.id === track?.id);
          if (!currentIsOfficial) selectNebulaTrack(safeQueue.tracks[0], safeQueue, { autoplay: false });
        } catch {}
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const receive = (event) => {
      const detail = event.detail || {};
      const next = detail.track || detail;
      if (!next?.id || !next?.track_url) return;
      if (detail.queue) {
        queueRef.current = detail.queue;
        setQueueTracks(Array.isArray(detail.queue.tracks) ? detail.queue.tracks : []);
      }
      const audio = audioRef.current;
      const pausedByUser = readStoredPaused();
      if (detail.autoplay === true && (detail.userInitiated === true || !pausedByUser)) {
        playbackWantedRef.current = true;
        playbackVersionRef.current += 1;
        localStorage.setItem(STORAGE_PAUSED, "0");
      } else if (pausedByUser) {
        playbackWantedRef.current = false;
        resumeAfterTrackChangeRef.current = false;
      }
      resumeAfterTrackChangeRef.current =
        playbackWantedRef.current &&
        (detail.autoplay === true ||
          resumeAfterTrackChangeRef.current ||
          Boolean(audio && !audio.paused && !audio.ended));
      skipRestoreRef.current = true;
      storePlaybackPosition(next.id, 0);
      setTrack(next);
      setCurrentTime(0);
      setLoadFailed(false);
    };
    window.addEventListener(EVENT_SELECT, receive);
    return () => window.removeEventListener(EVENT_SELECT, receive);
  }, []);

  const ensureAudioGraph = useCallback(async () => {
    const shared = getAmbientEngine();
    const audio = shared?.audio || audioRef.current;
    if (!shared || !audio) return null;
    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return null;
      if (!shared.context || shared.context.state === "closed") shared.context = new AudioContextCtor();
      const context = shared.context;
      if (context.state === "suspended") await context.resume();

      if (!shared.source) {
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.4;
        analyser.minDecibels = -92;
        analyser.maxDecibels = -12;

        const source = context.createMediaElementSource(audio);
        const bass = context.createBiquadFilter();
        const mids = context.createBiquadFilter();
        const highs = context.createBiquadFilter();
        const compressor = context.createDynamicsCompressor();
        const gain = context.createGain();

        bass.type = "lowshelf";
        bass.frequency.value = 115;
        bass.gain.value = 5.5;
        mids.type = "peaking";
        mids.frequency.value = 720;
        mids.Q.value = 0.8;
        mids.gain.value = 2.2;
        highs.type = "highshelf";
        highs.frequency.value = 6500;
        highs.gain.value = -1.4;
        compressor.threshold.value = -18;
        compressor.knee.value = 20;
        compressor.ratio.value = 2.25;
        compressor.attack.value = 0.012;
        compressor.release.value = 0.24;
        gain.gain.value = effectiveVolumeRef.current;

        // Uma única cadeia de saída. O analyser fica em série, nunca como
        // segunda rota de áudio, então play/pause não pode acumular cópias.
        source.connect(bass);
        bass.connect(mids);
        mids.connect(highs);
        highs.connect(compressor);
        compressor.connect(gain);
        gain.connect(analyser);
        analyser.connect(context.destination);

        shared.source = source;
        shared.bass = bass;
        shared.mids = mids;
        shared.highs = highs;
        shared.compressor = compressor;
        shared.gain = gain;
        shared.analyser = analyser;
        audio.volume = 1;
      }

      audioRef.current = shared.audio;
      audioContextRef.current = shared.context;
      analyserRef.current = shared.analyser;
      sourceRef.current = shared.source;
      bassFilterRef.current = shared.bass;
      midFilterRef.current = shared.mids;
      highFilterRef.current = shared.highs;
      compressorRef.current = shared.compressor;
      outputGainRef.current = shared.gain;
      return shared.analyser;
    } catch {
      return null;
    }
  }, []);

  const startPlayback = useCallback(async ({ explicit = false } = {}) => {
    const audio = audioRef.current;
    if (!audio || !src || loadFailed) return false;

    if (explicit) {
      playbackWantedRef.current = true;
      playbackVersionRef.current += 1;
      localStorage.setItem(STORAGE_PAUSED, "0");
    } else if (readStoredPaused()) {
      playbackWantedRef.current = false;
    }

    if (!playbackWantedRef.current) {
      audio.pause();
      setPlaying(false);
      setNeedsInteraction(false);
      return false;
    }

    const requestVersion = playbackVersionRef.current;
    const shared = getAmbientEngine();
    if (shared) shared.owner = instanceIdRef.current;
    try {
      localStorage.setItem(STORAGE_OWNER, JSON.stringify({ id: instanceIdRef.current, at: Date.now() }));
    } catch { /* storage indisponível */ }
    try {
      const analyser = await ensureAudioGraph();
      if (!playbackWantedRef.current || requestVersion !== playbackVersionRef.current) {
        audio.pause();
        return false;
      }
      if (outputGainRef.current && audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        outputGainRef.current.gain.cancelScheduledValues(now);
        outputGainRef.current.gain.setValueAtTime(effectiveVolumeRef.current, now);
        audio.volume = 1;
      } else {
        audio.volume = effectiveVolumeRef.current;
      }
      if (playPromiseRef.current) {
        try { await playPromiseRef.current; } catch { /* tentativa anterior falhou */ }
        if (!playbackWantedRef.current || requestVersion !== playbackVersionRef.current) {
          audio.pause();
          return false;
        }
      }
      const pendingPlay = audio.play();
      playPromiseRef.current = pendingPlay;
      try {
        await pendingPlay;
      } finally {
        if (playPromiseRef.current === pendingPlay) playPromiseRef.current = null;
      }
      if (!playbackWantedRef.current || requestVersion !== playbackVersionRef.current || readStoredPaused()) {
        audio.pause();
        setPlaying(false);
        return false;
      }
      setPlaying(true);
      setNeedsInteraction(false);
      try { broadcastRef.current?.postMessage({ type: "playing", id: instanceIdRef.current }); } catch { /* ignore */ }
      return true;
    } catch {
      setPlaying(false);
      setNeedsInteraction(playbackWantedRef.current);
      return false;
    }
  }, [ensureAudioGraph, loadFailed, src]);

  const pausePlayback = useCallback(() => {
    const audio = audioRef.current;
    playbackWantedRef.current = false;
    playbackVersionRef.current += 1;
    resumeAfterTrackChangeRef.current = false;
    localStorage.setItem(STORAGE_PAUSED, "1");
    try {
      const owner = JSON.parse(localStorage.getItem(STORAGE_OWNER) || "null");
      if (owner?.id === instanceIdRef.current) localStorage.removeItem(STORAGE_OWNER);
    } catch { /* ignore */ }
    if (audio) audio.pause();
    const gain = outputGainRef.current || getAmbientEngine()?.gain;
    const context = audioContextRef.current || getAmbientEngine()?.context;
    if (gain && context) {
      try {
        gain.gain.cancelScheduledValues(context.currentTime);
        gain.gain.setValueAtTime(0, context.currentTime);
      } catch { gain.gain.value = 0; }
    }
    try { broadcastRef.current?.postMessage({ type: "paused", id: instanceIdRef.current }); } catch { /* ignore */ }
    setNeedsInteraction(false);
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!needsInteraction || !playbackWantedRef.current) return undefined;

    const tryUnlock = async () => {
      if (autoplayUnlockingRef.current || !playbackWantedRef.current) return;
      autoplayUnlockingRef.current = true;
      try {
        const started = await startPlayback();
        if (started) cleanup();
      } finally {
        autoplayUnlockingRef.current = false;
      }
    };
    const cleanup = () => {
      window.removeEventListener("pointerdown", tryUnlock, true);
      window.removeEventListener("touchstart", tryUnlock, true);
      window.removeEventListener("keydown", tryUnlock, true);
    };

    window.addEventListener("pointerdown", tryUnlock, true);
    window.addEventListener("touchstart", tryUnlock, true);
    window.addEventListener("keydown", tryUnlock, true);
    return cleanup;
  }, [needsInteraction, startPlayback]);

  const moveQueue = useCallback((direction, { fromEnded = false } = {}) => {
    const audio = audioRef.current;
    const queue = queueRef.current || readMusicQueue();
    const items = Array.isArray(queue?.tracks) ? queue.tracks : [];

    if (!items.length) {
      if (fromEnded && playbackWantedRef.current && audio) {
        audio.currentTime = 0;
        startPlayback();
      }
      return;
    }

    const currentIndex = items.findIndex((item) => item.id === track?.id);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextTrack = direction > 0
      ? pickRandomTrack(items, track?.id)
      : items[(baseIndex + direction + items.length) % items.length];

    if (items.length === 1 && nextTrack?.id === track?.id) {
      if (audio) {
        audio.currentTime = 0;
        if (playbackWantedRef.current) startPlayback();
      }
      return;
    }

    queueRef.current = queue;
    setQueueTracks(items);
    resumeAfterTrackChangeRef.current = playbackWantedRef.current;
    selectNebulaTrack(nextTrack, queue, { autoplay: playbackWantedRef.current });
  }, [track?.id, startPlayback]);

  const advanceQueue = useCallback(() => {
    if (!playbackWantedRef.current) {
      const audio = audioRef.current;
      if (audio) audio.pause();
      return;
    }
    moveQueue(1, { fromEnded: true });
  }, [moveQueue]);

  const previousQueue = useCallback(() => {
    moveQueue(-1);
  }, [moveQueue]);

  const nextQueue = useCallback(() => {
    moveQueue(1);
  }, [moveQueue]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || outputGainRef.current) return;
    audio.volume = effectiveVolume;
  }, [effectiveVolume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return undefined;
    if (audio.getAttribute("src") !== src) {
      audio.src = src;
      audio.currentTime = 0;
    }
    audio.load();
    const update = () => {
      const nextTime = audio.currentTime || 0;
      setCurrentTime(nextTime);
      const now = performance.now();
      if (now - lastPositionSaveRef.current > 1500) {
        lastPositionSaveRef.current = now;
        storePlaybackPosition(track?.id, nextTime);
      }
    };
    const loaded = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : Number(track?.duration) || 0);
      setLoadFailed(false);
      if (skipRestoreRef.current) {
        skipRestoreRef.current = false;
      } else if ((audio.currentTime || 0) < 0.2) {
        const savedTime = readStoredPlaybackPosition(track?.id);
        const maxTime = Number.isFinite(audio.duration) && audio.duration > 1 ? Math.max(0, audio.duration - 1) : savedTime;
        if (savedTime > 0.5) {
          audio.currentTime = Math.min(savedTime, maxTime);
          setCurrentTime(audio.currentTime);
        }
      }

      if (resumeAfterTrackChangeRef.current && playbackWantedRef.current) {
        resumeAfterTrackChangeRef.current = false;
        startPlayback();
        return;
      }

      // Tenta autoplay uma única vez apenas quando o estado persistido está como tocando.
      // Se o usuário pausou antes de sair/recarregar, a faixa permanece pausada.
      if (!entryAutoplayAttemptedRef.current) {
        entryAutoplayAttemptedRef.current = true;
        if (playbackWantedRef.current) startPlayback();
        else audio.pause();
      }
    };
    const failed = () => { setLoadFailed(true); setPlaying(false); };
    const onPlay = () => {
      if (!playbackWantedRef.current) {
        audio.pause();
        setPlaying(false);
        return;
      }
      setPlaying(true);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      if (playbackWantedRef.current) advanceQueue();
      else setPlaying(false);
    };
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("loadedmetadata", loaded);
    audio.addEventListener("durationchange", loaded);
    audio.addEventListener("error", failed);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", update);
      audio.removeEventListener("loadedmetadata", loaded);
      audio.removeEventListener("durationchange", loaded);
      audio.removeEventListener("error", failed);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [src, startPlayback, track?.duration, advanceQueue]);

  useEffect(() => {
    const root = document.documentElement;
    if (!playing || effectiveVolume <= 0 || loadFailed || !beatPrefs.enabled) {
      cancelAnimationFrame(rafRef.current);
      delete root.dataset.nebulaMusicBeat;
      delete root.dataset.nebulaMusicMotion;
      delete root.dataset.nebulaBeatButtons;
      delete root.dataset.nebulaBeatLinks;
      delete root.dataset.nebulaBeatInputs;
      root.style.removeProperty("--nebula-music-beat-scale");
      root.style.removeProperty("--nebula-music-beat-brightness");
      setBeatStrength(0);
      return undefined;
    }

    let disposed = false;
    const data = new Uint8Array(1024);
    root.dataset.nebulaMusicMotion = "1";
    root.dataset.nebulaBeatButtons = beatPrefs.targets?.buttons !== false ? "1" : "0";
    root.dataset.nebulaBeatLinks = beatPrefs.targets?.links !== false ? "1" : "0";
    root.dataset.nebulaBeatInputs = beatPrefs.targets?.inputs !== false ? "1" : "0";

    const frame = async (now) => {
      if (disposed) return;
      const analyser = analyserRef.current || await ensureAudioGraph();
      if (analyser) {
        analyser.getByteFrequencyData(data);
        const context = audioContextRef.current;
        const binHz = (context?.sampleRate || 48000) / analyser.fftSize;
        const band = (fromHz, toHz) => {
          const lo = Math.max(1, Math.floor(fromHz / binHz));
          const hi = Math.min(data.length - 1, Math.ceil(toHz / binHz));
          let total = 0;
          let peak = 0;
          for (let i = lo; i <= hi; i += 1) {
            const value = data[i] / 255;
            total += value * value;
            peak = Math.max(peak, value);
          }
          return { energy: Math.sqrt(total / Math.max(1, hi - lo + 1)), peak };
        };

        const profile = track?.bass_profile || {};
        const bassLowHz = clamp(profile.low_hz || 35, 20, 120);
        const bassHighHz = clamp(profile.high_hz || 190, Math.max(100, bassLowHz + 40), 350);
        const bassSensitivity = clamp(profile.sensitivity || 1, 0.5, 2);
        const bass = band(bassLowHz, bassHighHz);
        const mids = band(bassHighHz, 2200);
        const highs = band(2200, 7600);
        const energy = bass.energy * 0.48 + mids.energy * 0.44 + highs.energy * 0.08;
        const presence = bass.peak * 0.5 + mids.peak * 0.42 + highs.peak * 0.08;
        const baseline = energyRef.current = energyRef.current * 0.94 + energy * 0.06;
        const ratio = energy / Math.max(0.04, baseline);
        const rawVolumeFactor = clamp(effectiveVolume / MAX_VOLUME, 0, 1);
        const volumeFactor = rawVolumeFactor <= 0 ? 0 : 0.28 + rawVolumeFactor * 0.72;
        const transient = clamp((ratio - 1.045) / 0.58, 0, 1);
        const strength = clamp((transient * 0.8 + presence * 0.2) * volumeFactor * (beatPrefs.intensity || 1) * bassSensitivity, 0, 1);

        // Pulso curto por batida, como na versão anterior. O perfil de grave
        // continua valendo para qualquer música adicionada, mas a animação
        // dispara só nos transientes fortes e solta rapidamente.
        if (energy > 0.055 && ratio > 1.09 && now - lastBeatRef.current > 92 && strength > 0.04) {
          lastBeatRef.current = now;
          beatPhaseRef.current = !beatPhaseRef.current;
          root.dataset.nebulaMusicBeat = beatPhaseRef.current ? "a" : "b";
          const scale = 1 + 0.004 + strength * 0.02;
          const brightness = 1 + 0.018 + strength * 0.09;
          root.style.setProperty("--nebula-music-beat-scale", scale.toFixed(4));
          root.style.setProperty("--nebula-music-beat-brightness", brightness.toFixed(3));
          setBeatStrength(strength);
          clearTimeout(releaseRef.current);
          releaseRef.current = window.setTimeout(() => {
            delete document.documentElement.dataset.nebulaMusicBeat;
            setBeatStrength(0);
          }, 105);
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      clearTimeout(releaseRef.current);
      delete root.dataset.nebulaMusicBeat;
      delete root.dataset.nebulaMusicMotion;
      delete root.dataset.nebulaBeatButtons;
      delete root.dataset.nebulaBeatLinks;
      delete root.dataset.nebulaBeatInputs;
      setBeatStrength(0);
    };
  }, [playing, effectiveVolume, loadFailed, ensureAudioGraph, beatPrefs]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    clearTimeout(releaseRef.current);
    delete document.documentElement.dataset.nebulaMusicBeat;
    delete document.documentElement.dataset.nebulaMusicMotion;
    delete document.documentElement.dataset.nebulaBeatButtons;
    delete document.documentElement.dataset.nebulaBeatLinks;
    delete document.documentElement.dataset.nebulaBeatInputs;
  }, []);

  useEffect(() => {
    const persist = () => {
      const audio = audioRef.current;
      if (audio) storePlaybackPosition(track?.id, audio.currentTime || 0);
    };
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", persist);
    return () => {
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", persist);
    };
  }, [track?.id]);

  const updateVolume = (next) => {
    const safe = clamp(next, 0, MAX_VOLUME);
    if (safe > 0) lastAudibleVolumeRef.current = safe;
    setVolume(safe);
    localStorage.setItem(STORAGE_VOLUME, String(safe));
  };

  const seek = (next) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = clamp(next, 0, audio.duration);
    setCurrentTime(audio.currentTime);
  };

  const pointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };
  const pointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 7) drag.moved = true;
    if (!drag.moved) return;
    setBubblePosition({ side: event.clientX < innerWidth / 2 ? "left" : "right", y: clamp(event.clientY / innerHeight, 0.14, 0.84) });
  };
  const pointerUp = (event, openOnTap = true) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.moved) {
      if (openOnTap) setOpen(true);
      return;
    }
    const next = { side: event.clientX < innerWidth / 2 ? "left" : "right", y: clamp(event.clientY / innerHeight, 0.14, 0.84) };
    setBubblePosition(next);
    localStorage.setItem(STORAGE_BUBBLE, JSON.stringify(next));
  };

  const bubbleStyle = {
    top: `calc(${bubblePosition.y * 100}dvh - 18px)`,
    transform: beatStrength ? `scale(${1 + beatStrength * 0.06})` : "scale(1)",
    boxShadow: beatStrength ? `0 0 ${10 + beatStrength * 14}px rgba(161,161,170,${0.12 + beatStrength * 0.16})` : undefined,
  };
  const panelStyle = {
    top: `clamp(10px, calc(${bubblePosition.y * 100}dvh - 82px), calc(100dvh - 188px))`,
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          data-no-beat
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => { dragRef.current = null; }}
          onClick={(event) => { if (event.detail === 0) setOpen(true); }}
          aria-label="Abrir Nébula Music. Arraste para mover."
          className={cn(
            "fixed z-[39] grid h-9 w-9 touch-none place-items-center rounded-full border border-white/10 bg-zinc-800/92 text-zinc-200 shadow-[0_10px_28px_-16px_rgba(0,0,0,.9)] backdrop-blur-xl transition-[transform,box-shadow,background-color] duration-150 hover:bg-zinc-700/95",
            bubblePosition.side === "left" ? "left-2.5 md:left-3" : "right-2.5 md:right-3"
          )}
          style={bubbleStyle}
        >
          <Music2 className={cn("h-3.5 w-3.5", playing && volume > 0 && "text-zinc-100")} />
          {playing && volume > 0 && <span className="absolute inset-1 rounded-full border border-white/10" />}
          {playing && volume > 0 && <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-zinc-300 shadow-[0_0_7px_rgba(212,212,216,.5)]" />}
        </button>
      )}

      {open && (
        <aside data-no-beat style={panelStyle} className={cn("fixed z-[39] w-[min(248px,calc(100vw-16px))] overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 text-zinc-100 shadow-[0_18px_48px_-24px_rgba(0,0,0,.95)] backdrop-blur-2xl", bubblePosition.side === "left" ? "left-2 md:left-3" : "right-2 md:right-3")}>
          <div className="flex touch-none cursor-grab items-center gap-2 border-b border-white/8 px-2.5 py-2 active:cursor-grabbing" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={(event) => pointerUp(event, false)} onPointerCancel={() => { dragRef.current = null; }}>
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.05]">
              <Headphones className={cn("h-3.5 w-3.5", playing && "text-zinc-200")} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-extrabold">{track?.title || NEBULA_OFFICIAL_TRACK.title}</p>
              <p className="truncate text-[8px] uppercase tracking-[0.14em] text-white/35">{track?.artist || "Nébula"} · Nébula Music{queueTracks.length > 1 && currentQueueIndex >= 0 ? ` · ${currentQueueIndex + 1}/${queueTracks.length}` : ""}</p>
            </div>
            <button type="button" data-no-beat onPointerDown={(event) => event.stopPropagation()} onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-full text-white/45 hover:bg-white/[0.06] hover:text-white" aria-label="Minimizar player">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="px-3 pb-3 pt-2.5">
            <div className="flex items-center gap-1.5">
              <button type="button" data-no-beat onClick={previousQueue} disabled={queueTracks.length < 2} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/55 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-25" aria-label="Música anterior">
                <SkipBack className="h-3.5 w-3.5 fill-current" />
              </button>
              <button type="button" data-no-beat onClick={playing ? pausePlayback : () => startPlayback({ explicit: true })} disabled={!src || loadFailed} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-900 shadow-[0_8px_22px_-12px_rgba(0,0,0,.9)] transition active:scale-95 disabled:opacity-40" aria-label={playing ? "Pausar" : "Tocar"}>
                {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
              </button>
              <button type="button" data-no-beat onClick={nextQueue} disabled={queueTracks.length < 2} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/55 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-25" aria-label="Próxima música">
                <SkipForward className="h-3.5 w-3.5 fill-current" />
              </button>
              <div className="min-w-0 flex-1">
                <input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} onChange={(e) => seek(Number(e.target.value))} className="h-1 w-full cursor-pointer accent-zinc-300" aria-label="Progresso da música" />
                <div className="mt-1 flex justify-between text-[8px] tabular-nums text-white/30"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
              </div>
            </div>

            <div className="mt-2.5 flex items-center gap-1.5">
              <button type="button" data-no-beat onClick={() => updateVolume(volume > 0 ? 0 : lastAudibleVolumeRef.current)} className="grid h-7 w-7 place-items-center rounded-full text-white/45 hover:text-zinc-100" aria-label={volume > 0 ? "Silenciar" : "Ativar volume"}>
                {volume <= 0 ? <VolumeX className="h-3.5 w-3.5" /> : volume < 0.12 ? <Volume1 className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
              <input type="range" min="0" max={MAX_VOLUME} step="0.01" value={volume} onChange={(e) => updateVolume(Number(e.target.value))} className="h-1 min-w-0 flex-1 cursor-pointer accent-zinc-300" aria-label="Volume" />
              <span className="w-8 text-right text-[8px] tabular-nums text-white/30">{Math.round((volume / MAX_VOLUME) * 100)}%</span>
            </div>

            <div className="mt-2.5 flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-1.5 text-[9px] text-white/40">
              <span>Batida sincronizada</span>
              <span className="font-bold text-zinc-300/85">{volume <= 0 ? "OFF" : `${Math.round(beatStrength * 100)}%`}</span>
            </div>

            {connected && <p className="mt-1.5 text-center text-[8px] text-white/25">Volume reduzido durante calls.</p>}
            {needsInteraction && !loadFailed && <button type="button" data-no-beat onClick={() => startPlayback({ explicit: true })} className="mt-2.5 w-full rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-[10px] font-bold text-zinc-200 hover:bg-white/[0.08]">Toque para ativar a música</button>}
            {loadFailed && <p className="mt-2.5 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-1.5 text-center text-[9px] text-red-200">Não foi possível carregar a faixa. Recarregue a página.</p>}
          </div>
        </aside>
      )}
    </>
  );
}