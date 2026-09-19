import { base44 } from "@/api/base44Client";

let activeAudio = null;
let activeObjectUrl = "";
let activeWebAudioSource = null;
let activeWebAudioGain = null;
let activePlaybackResolve = null;
let activeUtterance = null;
const cachedConfigs = new Map();
const configLoadedAt = new Map();
let audioContext = null;
let pauseRequested = false;
let playbackGeneration = 0;
let speechSynthesisUnlocked = false;
let voiceVolume = (() => {
  if (typeof window === "undefined") return 1;
  try {
    const volumeKey = "nebula_core_os_voice_volume";
    const migrationKey = "nebula_ai_voice_volume_v2";
    const raw = window.localStorage.getItem(volumeKey);
    const migrated = window.localStorage.getItem(migrationKey) === "1";
    if (!migrated && (raw === null || raw === "" || raw === "0")) {
      window.localStorage.setItem(volumeKey, "1");
      window.localStorage.setItem(migrationKey, "1");
      return 1;
    }
    if (!migrated) window.localStorage.setItem(migrationKey, "1");
    if (raw === null || raw === "") return 1;
    const saved = Number(raw);
    return Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 1;
  } catch {
    return 1;
  }
})();

function releaseAudio() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    activeUtterance = null;
  }
  if (activePlaybackResolve) {
    const resolve = activePlaybackResolve;
    activePlaybackResolve = null;
    try { resolve({ provider: "cancelled" }); } catch { /* ignore */ }
  }
  if (activeAudio) {
    try { activeAudio.pause(); } catch { /* já encerrado */ }
    activeAudio = null;
  }
  if (activeWebAudioSource) {
    try { activeWebAudioSource.onended = null; activeWebAudioSource.stop(0); } catch { /* já encerrado */ }
    try { activeWebAudioSource.disconnect(); } catch { /* ignore */ }
    activeWebAudioSource = null;
  }
  if (activeWebAudioGain) {
    try { activeWebAudioGain.disconnect(); } catch { /* ignore */ }
    activeWebAudioGain = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = "";
  }
}

function cleanVoiceText(text) {
  const raw = String(text || "").trim();
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (unfenced.startsWith("{") && unfenced.endsWith("}")) {
    try {
      const parsed = JSON.parse(unfenced);
      return String(parsed?.reply || parsed?.response || parsed?.text || "").trim();
    } catch { /* keep plain text */ }
  }
  return unfenced;
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64ToBlob(base64, mimeType = "audio/mpeg") {
  return new Blob([base64ToBytes(base64)], { type: mimeType });
}

function getOrCreateAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext || audioContext.state === "closed") audioContext = new AudioContextCtor();
  return audioContext;
}

async function playWithWebAudio(base64, generation) {
  const ctx = getOrCreateAudioContext();
  if (!ctx) throw new Error("webaudio_unavailable");
  if (ctx.state === "suspended") await ctx.resume();
  if (generation !== playbackGeneration) return { provider: "cancelled" };

  const bytes = base64ToBytes(base64);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  if (generation !== playbackGeneration) return { provider: "cancelled" };

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, voiceVolume));
  source.buffer = decoded;
  source.connect(gain);
  gain.connect(ctx.destination);
  activeWebAudioSource = source;
  activeWebAudioGain = gain;

  return new Promise((resolve) => {
    activePlaybackResolve = resolve;
    source.onended = () => {
      if (activeWebAudioSource === source) activeWebAudioSource = null;
      if (activeWebAudioGain === gain) activeWebAudioGain = null;
      if (activePlaybackResolve === resolve) activePlaybackResolve = null;
      try { source.disconnect(); } catch { /* ignore */ }
      try { gain.disconnect(); } catch { /* ignore */ }
      resolve({ provider: "gpt" });
    };
    source.start(0);
    if (pauseRequested && ctx.state === "running") ctx.suspend().catch(() => {});
  });
}

export async function getAiVoiceConfig(assistant = "core_os", { force = false } = {}) {
  const key = assistant === "nebulaticos"
    ? "nebulaticos"
    : assistant === "core_security"
      ? "core_security"
      : "core_os";
  const cached = cachedConfigs.get(key) || null;
  const loadedAt = configLoadedAt.get(key) || 0;
  const fresh = cached && Date.now() - loadedAt < 60_000;
  if (!force && fresh) return cached;
  try {
    const res = await base44.functions.invoke("coreOsVoice", { action: "config", assistant: key });
    const config = res?.data?.config || res?.config || null;
    cachedConfigs.set(key, config);
    configLoadedAt.set(key, Date.now());
    return config;
  } catch {
    cachedConfigs.delete(key);
    configLoadedAt.delete(key);
    return null;
  }
}

export async function getCoreOsVoiceConfig(options = {}) {
  return getAiVoiceConfig("core_os", options);
}

export function invalidateCoreOsVoiceConfig() {
  cachedConfigs.clear();
  configLoadedAt.clear();
}

export function unlockAiVoice() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getOrCreateAudioContext();
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      source.buffer = ctx.createBuffer(1, 1, 22050);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
    }
  } catch { /* desbloqueio WebAudio é best-effort */ }

  // Safari/iOS também exige que speechSynthesis seja iniciado por um gesto real.
  // Fazemos uma fala silenciosa no clique de entrar/convidar/enviar para liberar
  // as respostas automáticas da Core OS que chegam alguns segundos depois.
  try {
    if (!speechSynthesisUnlocked && window.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined") {
      window.speechSynthesis.getVoices?.();
      const warmup = new SpeechSynthesisUtterance(" ");
      warmup.volume = 0;
      warmup.rate = 2;
      window.speechSynthesis.speak(warmup);
      speechSynthesisUnlocked = true;
    }
  } catch { /* desbloqueio de voz é best-effort */ }
}

export async function synthesizeAiVoice(text, overrides = {}) {
  const content = cleanVoiceText(text).slice(0, 2200);
  if (!content) return { ok: false, provider: "gpt", error: "empty_text" };
  const assistant = overrides.assistant === "nebulaticos"
    ? "nebulaticos"
    : overrides.assistant === "core_security"
      ? "core_security"
      : "core_os";
  try {
    const res = await base44.functions.invoke("coreOsVoice", {
      action: "synthesize",
      assistant,
      text: content,
      ...(overrides.voice ? { voice: overrides.voice } : {}),
      ...(overrides.preview ? {
        preview: true,
        instructions: overrides.instructions,
      } : {}),
    });
    return res?.data || res || { ok: false, provider: "gpt", error: "gpt_tts_unavailable" };
  } catch {
    return { ok: false, provider: "gpt", error: "gpt_tts_unavailable" };
  }
}

export async function synthesizeCoreOsVoice(text, overrides = {}) {
  return synthesizeAiVoice(text, { ...overrides, assistant: "core_os" });
}

export async function playAiVoice(text, overrides = {}) {
  stopCoreOsVoice();
  pauseRequested = false;
  const generation = ++playbackGeneration;
  const spokenText = cleanVoiceText(text);
  const result = await synthesizeAiVoice(spokenText, overrides);
  if (generation !== playbackGeneration) return { provider: "cancelled", config: result?.config };
  if (result?.disabled && !overrides.preview) return { provider: "disabled", config: result.config };

  if (result?.ok && result?.audio_base64) {
    try {
      const webAudioResult = await playWithWebAudio(result.audio_base64, generation);
      if (webAudioResult?.provider === "cancelled") return { provider: "cancelled", config: result.config };
      return { provider: "gpt", config: result.config };
    } catch {
      releaseAudio();
      try {
        const blob = base64ToBlob(result.audio_base64, result.mime_type || "audio/mpeg");
        activeObjectUrl = URL.createObjectURL(blob);
        const audio = new Audio(activeObjectUrl);
        audio.volume = voiceVolume;
        activeAudio = audio;
        if (generation !== playbackGeneration) {
          releaseAudio();
          return { provider: "cancelled", config: result.config };
        }
        if (!pauseRequested) await audio.play();
        await new Promise((resolve) => {
          activePlaybackResolve = resolve;
          const finish = () => {
            if (activePlaybackResolve === resolve) activePlaybackResolve = null;
            resolve({ provider: "gpt" });
          };
          audio.onended = finish;
          audio.onerror = finish;
        });
        releaseAudio();
        return { provider: "gpt", config: result.config };
      } catch {
        releaseAudio();
      }
    }
  }

  if (result?.provider === "browser" && typeof window !== "undefined" && window.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined") {
    let voices = window.speechSynthesis.getVoices?.() || [];
    if (!voices.length && typeof window.speechSynthesis.addEventListener === "function") {
      await new Promise((resolve) => {
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          window.speechSynthesis.removeEventListener?.("voiceschanged", done);
          resolve();
        };
        window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
        window.setTimeout(done, 300);
      });
      voices = window.speechSynthesis.getVoices?.() || [];
    }
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.volume = Math.max(0, Math.min(1, voiceVolume));
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.lang = /[áéíóúãõç]/i.test(spokenText) ? "pt-BR" : "pt-BR";
      const preferred = voices.find((voice) => /pt[-_]?BR/i.test(voice.lang || "")) || voices.find((voice) => /^pt/i.test(voice.lang || ""));
      if (preferred) utterance.voice = preferred;
      activeUtterance = utterance;
      utterance.onend = () => {
        if (activeUtterance === utterance) activeUtterance = null;
        resolve({ provider: "browser", config: result.config });
      };
      utterance.onerror = () => {
        if (activeUtterance === utterance) activeUtterance = null;
        resolve({ provider: "browser_unavailable", config: result.config });
      };
      if (generation !== playbackGeneration) {
        resolve({ provider: "cancelled", config: result.config });
        return;
      }
      window.speechSynthesis.speak(utterance);
      if (pauseRequested) window.speechSynthesis.pause();
    });
  }

  if (generation !== playbackGeneration) return { provider: "cancelled", config: result?.config };
  return { provider: "browser_unavailable", error: result?.error || "browser_tts_unavailable", config: result?.config };
}

export async function playCoreOsVoice(text, overrides = {}) {
  return playAiVoice(text, { ...overrides, assistant: "core_os" });
}

export function pauseCoreOsVoice() {
  pauseRequested = true;
  if (activeAudio && !activeAudio.paused) {
    try { activeAudio.pause(); } catch { /* ignore */ }
  }
  if (activeWebAudioSource && audioContext?.state === "running") {
    try { audioContext.suspend().catch(() => {}); } catch { /* ignore */ }
  }
  if (typeof window !== "undefined" && window.speechSynthesis?.speaking) {
    try { window.speechSynthesis.pause(); } catch { /* ignore */ }
  }
}

export function resumeCoreOsVoice() {
  pauseRequested = false;
  if (activeAudio && activeAudio.paused) {
    try { activeAudio.play().catch(() => {}); } catch { /* ignore */ }
  }
  if (activeWebAudioSource && audioContext?.state === "suspended") {
    try { audioContext.resume().catch(() => {}); } catch { /* ignore */ }
  }
  if (typeof window !== "undefined" && window.speechSynthesis?.paused) {
    try { window.speechSynthesis.resume(); } catch { /* ignore */ }
  }
}

export function getCoreOsVoiceVolume() {
  return voiceVolume;
}

export function setCoreOsVoiceVolume(value) {
  const next = Math.max(0, Math.min(1, Number(value) || 0));
  voiceVolume = next;
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem("nebula_core_os_voice_volume", String(next)); } catch { /* storage opcional */ }
  }
  if (activeAudio) activeAudio.volume = next;
  if (activeWebAudioGain && audioContext) {
    try { activeWebAudioGain.gain.setValueAtTime(next, audioContext.currentTime); } catch { activeWebAudioGain.gain.value = next; }
  }
  return next;
}

export function stopCoreOsVoice() {
  playbackGeneration += 1;
  pauseRequested = false;
  releaseAudio();
}
