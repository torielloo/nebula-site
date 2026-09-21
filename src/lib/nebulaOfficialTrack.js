const LEGACY_TRACK_URL = "/audio/nebula-official.m4a";

export const NEBULA_DEFAULT_TRACKS = [
  {
    id: "6aad16a7b719762df96e77ed",
    title: "audio 5 nb",
    artist: "Nébula",
    track_url: "https://base44.app/api/apps/6aa87196309472108abb65fb/files/mp/public/6aa87196309472108abb65fb/16eb5edb9_audio5nb.m4a",
    mime_type: "audio/mp4",
    duration: 60,
    is_official: true,
    sort_order: 1,
  },
  {
    id: "6aad16a761562dca0d10db88",
    title: "audio 4 nb",
    artist: "Nébula",
    track_url: "https://base44.app/api/apps/6aa87196309472108abb65fb/files/mp/public/6aa87196309472108abb65fb/295910c90_audio4nb.m4a",
    mime_type: "audio/mp4",
    duration: 38.609002,
    is_official: true,
    sort_order: 2,
  },
  {
    id: "6aad16a7e027766216034c79",
    title: "audio 3 nb",
    artist: "Nébula",
    track_url: "https://base44.app/api/apps/6aa87196309472108abb65fb/files/mp/public/6aa87196309472108abb65fb/bfffc754b_audio3nb.m4a",
    mime_type: "audio/mp4",
    duration: 60,
    is_official: true,
    sort_order: 3,
  },
  {
    id: "6aad16a736ba55ba580edc3d",
    title: "audio 2 nb",
    artist: "Nébula",
    track_url: "https://base44.app/api/apps/6aa87196309472108abb65fb/files/mp/public/6aa87196309472108abb65fb/8a8804452_audio2nb.mp3",
    mime_type: "audio/mpeg",
    duration: 314.398186,
    is_official: true,
    sort_order: 4,
  },
  {
    id: "6aad16a7e75cd30e3822ee96",
    title: "audio 1 nb",
    artist: "Nébula",
    track_url: "https://base44.app/api/apps/6aa87196309472108abb65fb/files/mp/public/6aa87196309472108abb65fb/04ab1b275_audio1nb.m4a",
    mime_type: "audio/mp4",
    duration: 60,
    is_official: true,
    sort_order: 5,
  },
].map((track) => ({
  ...track,
  lyrics: "",
  lyrics_source: "none",
  bass_profile: { mode: "realtime", sensitivity: 1, low_hz: 32, high_hz: 210 },
}));

export const NEBULA_DEFAULT_QUEUE = {
  id: "nebula-defaults",
  name: "Padrões Nébula",
  source: "official-defaults",
  tracks: NEBULA_DEFAULT_TRACKS,
};

// Mantido somente para compatibilidade com dados antigos salvos no navegador.
export function getNebulaOfficialTrackUrl() {
  return Promise.resolve(LEGACY_TRACK_URL);
}

export const NEBULA_OFFICIAL_TRACK = NEBULA_DEFAULT_TRACKS[0];
