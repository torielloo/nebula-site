const CALL_SOUND_KEY = "nebula:nitro-sound:call";
const CHANGE_EVENT = "nebula:nitro-call-sound-change";

export function getNitroCallSoundEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(CALL_SOUND_KEY) !== "0";
}

export function setNitroCallSoundEnabled(enabled) {
  const next = Boolean(enabled);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CALL_SOUND_KEY, next ? "1" : "0");
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  }
  return next;
}

export function onNitroCallSoundChange(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => handler(Boolean(event?.detail));
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
