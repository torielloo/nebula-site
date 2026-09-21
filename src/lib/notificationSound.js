const DEFAULTS = {
  normal: { enabled: true, volume: 0.55 },
  core: { enabled: true, volume: 0.65 },
};

const keyFor = (kind) => `nebula:notification-sound:${kind}`;

export function getNotificationSoundPrefs(kind) {
  const base = DEFAULTS[kind] || DEFAULTS.normal;
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(kind)) || "null");
    return {
      enabled: raw?.enabled !== false,
      volume: Math.max(0, Math.min(1, Number(raw?.volume ?? base.volume))),
    };
  } catch {
    return { ...base };
  }
}

export function saveNotificationSoundPrefs(kind, prefs) {
  const next = {
    enabled: prefs?.enabled !== false,
    volume: Math.max(0, Math.min(1, Number(prefs?.volume ?? 0.5))),
  };
  try { localStorage.setItem(keyFor(kind), JSON.stringify(next)); } catch {}
  return next;
}

let audioContext = null;

function getContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioContext || audioContext.state === "closed") audioContext = new AudioCtx();
  return audioContext;
}

export function playNotificationSound(kind, prefs) {
  if (!prefs?.enabled || Number(prefs.volume) <= 0) return;
  const ctx = getContext();
  if (!ctx) return;

  const normalPattern = [
    { f: 740, t: 0.00, d: 0.10 },
    { f: 980, t: 0.09, d: 0.14 },
  ];
  const corePattern = [
    { f: 420, t: 0.00, d: 0.09 },
    { f: 620, t: 0.08, d: 0.09 },
    { f: 880, t: 0.16, d: 0.16 },
  ];
  const pattern = kind === "core" ? corePattern : normalPattern;

  const play = () => {
    try {
      const now = ctx.currentTime;
      const master = ctx.createGain();
      const gain = Math.max(0.001, Math.min(1, Number(prefs.volume) || 0));
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(gain * 0.22, now + 0.01);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      master.connect(ctx.destination);

      pattern.forEach(({ f, t, d }) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const start = now + t;
        osc.type = kind === "core" ? "triangle" : "sine";
        osc.frequency.setValueAtTime(f, start);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.9, start + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, start + d);
        osc.connect(g);
        g.connect(master);
        osc.start(start);
        osc.stop(start + d + 0.02);
      });
    } catch {}
  };

  if (ctx.state === "suspended") ctx.resume().then(play).catch(() => {});
  else play();
}
