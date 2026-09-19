const STORAGE_KEY = "nebula:ui-click-sound";
const EVENT_NAME = "nebula:ui-click-sound-change";

export function getUiClickSoundEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== "0";
}

export function setUiClickSoundEnabled(enabled) {
  const next = Boolean(enabled);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  }
  return next;
}

export function onUiClickSoundChange(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => handler(Boolean(event?.detail));
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

let ctx = null;
let lastPlayedAt = 0;

export function playUiClickSound() {
  if (typeof window === "undefined" || !getUiClickSoundEnabled()) return;
  const now = performance.now();
  if (now - lastPlayedAt < 28) return;
  lastPlayedAt = now;
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!ctx) ctx = new AudioContextCtor();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(620, start);
    osc.frequency.exponentialRampToValueAtTime(420, start + 0.045);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.022, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.055);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.06);
  } catch {}
}
