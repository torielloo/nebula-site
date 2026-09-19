export const EVENT_SELECT = "nebula:music-select";
export const STORAGE_TRACK = "nebula:selected-track";
export const STORAGE_QUEUE = "nebula:music-queue";

export function toSafeTrack(track) {
  if (!track?.id || !track?.track_url) return null;
  return {
    id: track.id,
    title: track.title || "Faixa sem nome",
    artist: track.artist || "Nébula",
    track_url: track.track_url,
    mime_type: track.mime_type || "audio/mpeg",
    duration: Number(track.duration) || 0,
    is_official: !!track.is_official,
    lyrics: track.lyrics || "",
    lyrics_source: track.lyrics_source || "none",
    bass_profile: track.bass_profile || { mode: "realtime", sensitivity: 1, low_hz: 32, high_hz: 210 },
  };
}

export function normalizeMusicQueue(queue) {
  if (!queue || !Array.isArray(queue.tracks)) return null;
  const tracks = queue.tracks.map(toSafeTrack).filter(Boolean);
  if (!tracks.length) return null;
  return {
    id: queue.id || "",
    name: queue.name || "Fila Nébula",
    source: queue.source || "library",
    tracks,
  };
}

export function readMusicQueue() {
  if (typeof window === "undefined") return null;
  try {
    return normalizeMusicQueue(JSON.parse(window.localStorage.getItem(STORAGE_QUEUE) || "null"));
  } catch {
    return null;
  }
}

export function selectNebulaTrack(track, queue = null, options = {}) {
  if (typeof window === "undefined") return null;
  const safe = toSafeTrack(track);
  if (!safe) return null;
  const safeQueue = normalizeMusicQueue(queue);
  window.localStorage.setItem(STORAGE_TRACK, JSON.stringify(safe));
  if (safeQueue) window.localStorage.setItem(STORAGE_QUEUE, JSON.stringify(safeQueue));
  window.dispatchEvent(new CustomEvent(EVENT_SELECT, {
    detail: {
      track: safe,
      queue: safeQueue,
      autoplay: options?.autoplay === true,
      userInitiated: options?.userInitiated === true,
    },
  }));
  return safe;
}
