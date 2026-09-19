const BEAT_ENABLED_KEY = "nebula:ambient-beat-enabled";
const BEAT_INTENSITY_KEY = "nebula:ambient-beat-intensity";
const BEAT_TARGETS_KEY = "nebula:ambient-beat-targets";
export const AMBIENT_BEAT_EVENT = "nebula:ambient-beat-preference";

const DEFAULT_TARGETS = { buttons: true, links: true, inputs: true };

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

export function getAmbientBeatPreferences() {
  if (typeof window === "undefined") {
    return { enabled: true, intensity: 1, targets: { ...DEFAULT_TARGETS } };
  }
  try {
    const enabled = window.localStorage.getItem(BEAT_ENABLED_KEY) !== "0";
    const storedIntensity = Number(window.localStorage.getItem(BEAT_INTENSITY_KEY));
    const intensity = Number.isFinite(storedIntensity) && storedIntensity > 0 ? clamp(storedIntensity, 0.25, 1.75) : 1;
    let targets = { ...DEFAULT_TARGETS };
    try {
      const parsed = JSON.parse(window.localStorage.getItem(BEAT_TARGETS_KEY) || "null");
      if (parsed && typeof parsed === "object") targets = { ...targets, ...parsed };
    } catch {}
    return { enabled, intensity, targets };
  } catch {
    return { enabled: true, intensity: 1, targets: { ...DEFAULT_TARGETS } };
  }
}

function persist(next) {
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(BEAT_ENABLED_KEY, next.enabled ? "1" : "0");
    window.localStorage.setItem(BEAT_INTENSITY_KEY, String(next.intensity));
    window.localStorage.setItem(BEAT_TARGETS_KEY, JSON.stringify(next.targets));
  } catch {}
  window.dispatchEvent(new CustomEvent(AMBIENT_BEAT_EVENT, { detail: next }));
  return next;
}

export function getAmbientBeatEnabled() {
  return getAmbientBeatPreferences().enabled;
}

export function setAmbientBeatEnabled(enabled) {
  const current = getAmbientBeatPreferences();
  return persist({ ...current, enabled: enabled !== false }).enabled;
}

export function setAmbientBeatIntensity(intensity) {
  const current = getAmbientBeatPreferences();
  return persist({ ...current, intensity: clamp(intensity, 0.25, 1.75) });
}

export function setAmbientBeatTarget(target, enabled) {
  const current = getAmbientBeatPreferences();
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_TARGETS, target)) return current;
  return persist({
    ...current,
    targets: { ...current.targets, [target]: enabled !== false },
  });
}

export function resetAmbientBeatPreferences() {
  return persist({ enabled: true, intensity: 1, targets: { ...DEFAULT_TARGETS } });
}
