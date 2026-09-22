import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { fetchNitroStatus } from "@/lib/nitro";
import PageShell from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { STORAGE_TRACK, selectNebulaTrack } from "@/lib/nebulaMusicQueue";
import {
  AudioLines,
  Check,
  Disc3,
  GripVertical,
  Headphones,
  Image as ImageIcon,
  ListMusic,
  Loader2,
  Lock,
  Music2,
  Pencil,
  Play,
  Plus,
  Save,
  Search,
  Shuffle,
  Upload,
  SkipForward,
  Trash2,
  Waves,
  X,
} from "lucide-react";

const PANELS = [
  { id: "library", label: "Biblioteca", icon: Disc3 },
  { id: "playlists", label: "Playlists", icon: ListMusic },
  { id: "beat", label: "Beat / Graves", icon: AudioLines },
];

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  const min = Math.floor(value / 60);
  const sec = Math.floor(value % 60).toString().padStart(2, "0");
  return value ? `${min}:${sec}` : "--:--";
}

const MUSIC_READ_ACTIONS = new Set(["official_list", "list", "playlist_list"]);

async function invokeMusicLibrary(payload, retries = 2) {
  let lastError;
  const maxRetries = MUSIC_READ_ACTIONS.has(payload?.action) ? retries : 0;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await base44.functions["invoke"]("musicLibrary", payload);
    } catch (error) {
      lastError = error;
      const status = Number(error?.response?.status || 0);
      const retryable = [429, 502, 503, 504].includes(status);
      if (!retryable || attempt >= maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 220 * (attempt + 1)));
    }
  }
  throw lastError;
}

function readAudioDuration(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve(0);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    const finish = (value) => {
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(value) ? Math.max(0, value) : 0);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(0);
    audio.src = objectUrl;
  });
}

export default function NebulaMixer() {
  const { user } = useAuth();
  const [active, setActive] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [activePanel, setActivePanel] = useState("library");
  const [playlistName, setPlaylistName] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [playlistTrackSearch, setPlaylistTrackSearch] = useState({});
  const [playlistSort, setPlaylistSort] = useState({});
  const [editingPlaylistId, setEditingPlaylistId] = useState("");
  const [playlistDraft, setPlaylistDraft] = useState({ name: "", description: "", cover_url: "" });
  const [dragState, setDragState] = useState({ playlistId: "", trackId: "" });
  const [bass, setBass] = useState({ mode: "realtime", sensitivity: 1, low_hz: 32, high_hz: 210 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mixerPersonality, setMixerPersonality] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadArtist, setUploadArtist] = useState("");
  const [uploadingTrack, setUploadingTrack] = useState(false);
  const [playlistAddTrack, setPlaylistAddTrack] = useState({});

  const selected = useMemo(
    () => tracks.find((track) => track.id === selectedId) || tracks[0] || null,
    [tracks, selectedId]
  );

  const visibleTracks = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    if (!query) return tracks;
    return tracks.filter((track) =>
      [track.title, track.artist, track.is_official ? "oficial" : "pessoal"]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [tracks, librarySearch]);

  const playLibraryTrack = (track) => {
    if (!track) return;
    setSelectedId(track.id);
    selectNebulaTrack(
      track,
      {
        id: "nebula-library",
        name: "Biblioteca Nébula",
        source: "library",
        tracks,
      },
      { autoplay: true, userInitiated: true }
    );
    setError("");
    setNotice(`Tocando “${track.title}”. A biblioteca continua como fila.`);
  };

  const getPlaylistTracks = (playlist) =>
    (playlist?.track_ids || []).map((id) => tracks.find((track) => track.id === id)).filter(Boolean);

  const mergePlaylists = (...sources) => Array.from(new Map(
    sources.flat().filter((row) => row?.id && row?.is_active !== false).map((row) => [row.id, row])
  ).values()).sort((a, b) =>
    (new Date(b.updated_date || b.created_date || 0).getTime() || 0)
    - (new Date(a.updated_date || a.created_date || 0).getTime() || 0)
  );

  const fetchPlaylists = useCallback(async () => {
    if (!user?.id) return [];
    const [functionResult, directResult] = await Promise.allSettled([
      invokeMusicLibrary({ action: "playlist_list" }),
      base44.entities.MusicPlaylist.filter({ owner_id: user.id, is_active: true }, "-updated_date", 100),
    ]);
    const fromFunction = functionResult.status === "fulfilled" && Array.isArray(functionResult.value?.data?.playlists)
      ? functionResult.value.data.playlists
      : [];
    const fromDirect = directResult.status === "fulfilled" && Array.isArray(directResult.value)
      ? directResult.value
      : [];
    return mergePlaylists(fromFunction, fromDirect);
  }, [user?.id]);

  const replacePlaylistLocal = (playlist) => {
    if (!playlist?.id) return;
    setPlaylists((current) => mergePlaylists([playlist], current.filter((item) => item.id !== playlist.id)));
  };

  const playPlaylist = (playlist, startTrackId = "") => {
    const orderedTracks = getPlaylistTracks(playlist);
    if (!orderedTracks.length) {
      setNotice("");
      setError("Essa playlist ainda não tem músicas.");
      return;
    }

    const first = orderedTracks.find((track) => track.id === startTrackId) || orderedTracks[0];
    setSelectedId(first.id);
    selectNebulaTrack(
      first,
      {
        id: playlist.id,
        name: playlist.name,
        source: "playlist",
        tracks: orderedTracks,
      },
      { autoplay: true, userInitiated: true }
    );
    setError("");
    setNotice(`Tocando playlist “${playlist.name}”. A próxima faixa começa automaticamente.`);
  };

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError("");
    try {
      const [statusResult, gateResult] = await Promise.allSettled([
        fetchNitroStatus(user.id),
        invokeMusicLibrary({ action: "official_list" }),
      ]);
      const status = statusResult.status === "fulfilled" ? statusResult.value : null;
      const gateActive = gateResult.status === "fulfilled" && gateResult.value?.data?.nitro_active === true;
      const nitroActive = status?.active === true || gateActive;
      setActive(nitroActive);

      if (!nitroActive) {
        setTracks([]);
        setPlaylists([]);
        return;
      }

      const [libraryResult, playlistResult] = await Promise.allSettled([
        invokeMusicLibrary({ action: "list" }),
        fetchPlaylists(),
      ]);

      if (libraryResult.status !== "fulfilled") throw libraryResult.reason;
      const libraryRes = libraryResult.value;
      const nextTracks = Array.isArray(libraryRes.data?.tracks) ? libraryRes.data.tracks : [];
      setTracks(nextTracks);
      setMixerPersonality(libraryRes.data?.mixer_personality || null);
      if (playlistResult.status === "fulfilled") setPlaylists(playlistResult.value);
      setSelectedId((current) =>
        current && nextTracks.some((track) => track.id === current) ? current : nextTracks[0]?.id || ""
      );
    } catch (err) {
      setError(err?.response?.data?.error || "Não foi possível abrir o Nébula Mixer.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, fetchPlaylists]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setBass(selected.bass_profile || { mode: "realtime", sensitivity: 1, low_hz: 32, high_hz: 210 });
  }, [selected?.id, selected?.bass_profile]);

  const uploadOwnTrack = async () => {
    if (!active || !uploadFile || uploadingTrack) return;
    const file = uploadFile;
    const maxBytes = 25 * 1024 * 1024;
    const ext = String(file.name || "").split(".").pop()?.toLowerCase() || "";
    const mimeByExt = {
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      mp4: "audio/mp4",
      aac: "audio/aac",
      wav: "audio/wav",
      ogg: "audio/ogg",
      flac: "audio/flac",
      webm: "audio/webm",
    };
    const mimeType = file.type?.startsWith("audio/") ? file.type : mimeByExt[ext];

    if (!mimeType) {
      setError("Escolha um arquivo de áudio válido (MP3, M4A, AAC, WAV, OGG, FLAC ou WEBM).");
      return;
    }
    if (file.size <= 0 || file.size > maxBytes) {
      setError("A música deve ter no máximo 25 MB.");
      return;
    }

    setUploadingTrack(true);
    setError("");
    setNotice("");
    try {
      const [uploaded, duration] = await Promise.all([
        base44.integrations.Core.UploadPublicFile({ file }),
        readAudioDuration(file),
      ]);
      if (!uploaded?.file_url) throw new Error("O upload terminou sem retornar o arquivo.");

      const cleanName = String(file.name || "Minha música").replace(/\.[^.]+$/, "").trim();
      const res = await invokeMusicLibrary({
        action: "add",
        title: uploadTitle.trim() || cleanName || "Minha música",
        artist: uploadArtist.trim() || user?.full_name || "Nébula",
        track_url: uploaded.file_url,
        mime_type: mimeType,
        duration,
      });

      const created = res?.data?.track;
      setUploadFile(null);
      setUploadTitle("");
      setUploadArtist("");
      setNotice("Música enviada para sua biblioteca.");
      await load();
      if (created?.id) setSelectedId(created.id);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Não foi possível enviar sua música.");
    } finally {
      setUploadingTrack(false);
    }
  };

  const renameOwnTrack = async (track) => {
    if (!track?.uploaded_by_me || busy) return;
    const title = window.prompt("Novo nome da música:", track.title || "");
    if (title === null) return;
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle === track.title) return;

    setBusy(`track:rename:${track.id}`);
    setError("");
    setNotice("");
    try {
      const res = await invokeMusicLibrary({
        action: "rename",
        track_id: track.id,
        title: cleanTitle,
      });
      const updated = res?.data?.track;
      if (!updated?.id) throw new Error("O servidor não confirmou o novo nome.");
      setTracks((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setNotice("Música renomeada.");
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Não foi possível renomear a música.");
    } finally {
      setBusy("");
    }
  };

  const removeOwnTrack = async (track) => {
    if (!track?.uploaded_by_me || busy) return;
    if (!window.confirm(`Remover “${track.title}” da sua biblioteca?`)) return;

    setBusy(`track:remove:${track.id}`);
    setError("");
    setNotice("");
    try {
      await invokeMusicLibrary({ action: "remove", track_id: track.id });
      setTracks((current) => current.filter((item) => item.id !== track.id));
      setPlaylists((current) => current.map((playlist) => ({
        ...playlist,
        track_ids: (playlist.track_ids || []).filter((id) => id !== track.id),
      })));
      if (selectedId === track.id) setSelectedId("");
      setNotice("Música removida da biblioteca e das suas playlists.");
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Não foi possível remover a música.");
    } finally {
      setBusy("");
    }
  };

  const mutatePlaylist = async (key, playlist, patch, success) => {
    if (!playlist?.id || busy) return null;
    const previous = playlist;
    const optimistic = { ...playlist, ...patch, updated_date: new Date().toISOString() };
    replacePlaylistLocal(optimistic);
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const res = await invokeMusicLibrary({
        action: "playlist_update",
        playlist_id: playlist.id,
        ...patch,
      });
      const updated = res?.data?.playlist || optimistic;
      replacePlaylistLocal(updated);
      if (success) setNotice(success);
      return updated;
    } catch (err) {
      replacePlaylistLocal(previous);
      setError(err?.response?.data?.error || err?.message || "Não foi possível atualizar a playlist.");
      return null;
    } finally {
      setBusy("");
    }
  };

  const addExistingTrackToPlaylist = async (playlist) => {
    const trackId = playlistAddTrack[playlist.id];
    if (!trackId || !playlist?.id || busy) return;
    const current = Array.isArray(playlist.track_ids) ? playlist.track_ids : [];
    if (current.includes(trackId)) {
      setNotice("Essa música já está nessa playlist.");
      return;
    }

    const optimistic = { ...playlist, track_ids: [...current, trackId], updated_date: new Date().toISOString() };
    replacePlaylistLocal(optimistic);
    setBusy(`playlist:add:${playlist.id}`);
    setError("");
    setNotice("");
    try {
      const res = await invokeMusicLibrary({
        action: "playlist_add_track",
        playlist_id: playlist.id,
        track_id: trackId,
      });
      const updated = res?.data?.playlist;
      if (!updated?.id || !(updated.track_ids || []).includes(trackId)) {
        throw new Error("O servidor não confirmou a música dentro da playlist.");
      }
      replacePlaylistLocal(updated);
      setPlaylistAddTrack((state) => ({ ...state, [playlist.id]: "" }));
      setNotice("Música adicionada e salva na playlist.");
    } catch (err) {
      replacePlaylistLocal(playlist);
      setError(err?.response?.data?.error || err?.message || "Não foi possível adicionar a música à playlist.");
    } finally {
      setBusy("");
    }
  };

  const run = async (key, fn, success) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
      if (success) setNotice(success);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Não foi possível concluir a ação.");
    } finally {
      setBusy("");
    }
  };

  const createPlaylist = async () => {
    const name = playlistName.trim();
    if (!name || busy) return;
    setBusy("playlist:create");
    setError("");
    setNotice("");
    try {
      const res = await invokeMusicLibrary({ action: "playlist_create", name });
      const created = res?.data?.playlist;
      if (!created?.id) throw new Error("A playlist foi criada, mas não retornou os dados para a tela.");
      replacePlaylistLocal(created);
      setPlaylistName("");
      setEditingPlaylistId(created.id);
      setPlaylistDraft({ name: created.name || name, description: created.description || "", cover_url: created.cover_url || "" });
      setNotice("Playlist criada. Agora você já pode adicionar músicas.");
      fetchPlaylists().then((rows) => setPlaylists((current) => mergePlaylists(current, rows))).catch(() => {});
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Não foi possível criar a playlist.");
    } finally {
      setBusy("");
    }
  };

  const deletePlaylist = async (playlist) => {
    if (!playlist?.id || busy) return;
    if (!window.confirm(`Excluir a playlist “${playlist.name}”?`)) return;
    const previous = playlist;
    setPlaylists((current) => current.filter((item) => item.id !== playlist.id));
    if (editingPlaylistId === playlist.id) setEditingPlaylistId("");
    setBusy(`delete:${playlist.id}`);
    setError("");
    setNotice("");
    try {
      await invokeMusicLibrary({
        action: "playlist_delete",
        playlist_id: playlist.id,
      });
      setNotice("Playlist removida.");
    } catch (err) {
      replacePlaylistLocal(previous);
      setError(err?.response?.data?.error || err?.message || "Não foi possível remover a playlist.");
    } finally {
      setBusy("");
    }
  };

  const renamePlaylist = (playlist) => {
    setEditingPlaylistId(playlist.id);
    setPlaylistDraft({
      name: playlist.name || "",
      description: playlist.description || "",
      cover_url: playlist.cover_url || "",
    });
  };

  const savePlaylistMeta = async (playlist) => {
    const name = playlistDraft.name.trim();
    if (!name) return;
    const updated = await mutatePlaylist(
      `playlist:meta:${playlist.id}`,
      playlist,
      {
        name,
        description: playlistDraft.description.trim(),
        cover_url: playlistDraft.cover_url.trim(),
      },
      "Playlist atualizada."
    );
    if (updated) setEditingPlaylistId("");
  };

  const movePlaylistTrack = (playlist, draggedTrackId, targetTrackId) => {
    if (!draggedTrackId || !targetTrackId || draggedTrackId === targetTrackId) return;
    const current = Array.isArray(playlist.track_ids) ? [...playlist.track_ids] : [];
    const from = current.indexOf(draggedTrackId);
    const to = current.indexOf(targetTrackId);
    if (from < 0 || to < 0) return;
    current.splice(from, 1);
    current.splice(to, 0, draggedTrackId);
    mutatePlaylist(
      `playlist:order:${playlist.id}`,
      playlist,
      { track_ids: current },
      "Ordem da playlist atualizada."
    );
  };

  const playPlaylistShuffle = (playlist) => {
    const orderedTracks = getPlaylistTracks(playlist);
    if (!orderedTracks.length) return;
    const shuffled = [...orderedTracks].sort(() => Math.random() - 0.5);
    const first = shuffled[0];
    setSelectedId(first.id);
    selectNebulaTrack(first, {
      id: playlist.id,
      name: playlist.name,
      source: "playlist",
      tracks: shuffled,
    }, { autoplay: true, userInitiated: true });
    setNotice(`Tocando “${playlist.name}” em ordem aleatória.`);
  };

  const toggleTrackInPlaylist = async (playlist, trackId) => {
    if (!playlist?.id || !trackId || busy) return;
    const current = Array.isArray(playlist.track_ids) ? playlist.track_ids : [];
    const removing = current.includes(trackId);
    const next = removing ? current.filter((id) => id !== trackId) : [...current, trackId];
    const optimistic = { ...playlist, track_ids: next, updated_date: new Date().toISOString() };
    replacePlaylistLocal(optimistic);
    setBusy(`playlist:${playlist.id}:${trackId}`);
    setError("");
    setNotice("");
    try {
      const res = await invokeMusicLibrary({
        action: removing ? "playlist_remove_track" : "playlist_add_track",
        playlist_id: playlist.id,
        track_id: trackId,
      });
      const updated = res?.data?.playlist;
      if (!updated?.id) throw new Error("O servidor não confirmou a alteração da playlist.");
      const serverHasTrack = (updated.track_ids || []).includes(trackId);
      if ((!removing && !serverHasTrack) || (removing && serverHasTrack)) {
        throw new Error("A playlist retornou um estado diferente do esperado.");
      }
      replacePlaylistLocal(updated);
      setNotice(removing ? "Música removida da playlist." : "Música adicionada e salva na playlist.");
    } catch (err) {
      replacePlaylistLocal(playlist);
      setError(err?.response?.data?.error || err?.message || "Não foi possível atualizar a playlist.");
    } finally {
      setBusy("");
    }
  };

  const saveBass = () => {
    if (!selected?.uploaded_by_me) return;
    run(
      "bass:save",
      async () => {
        const res = await invokeMusicLibrary({
          action: "update_bass",
          track_id: selected.id,
          bass_profile: bass,
        });
        const updated = res.data?.track;
        if (updated && selected.id === JSON.parse(localStorage.getItem(STORAGE_TRACK) || "null")?.id) {
          selectNebulaTrack({ ...selected, ...updated });
        }
      },
      "Perfil de graves atualizado."
    );
  };

  if (loading) {
    return (
      <div className="grid min-h-[55vh] place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (active === false) {
    return (
      <PageShell
        className="mx-auto max-w-5xl"
        label="NÉBULA MUSIC"
        title="Nébula Mixer"
        subtitle="Playlists e controle de graves para músicas do Nébula."
      >
        <div className="grid min-h-[50vh] place-items-center rounded-3xl border border-white/10 bg-[#070707] p-8 text-center">
          <div>
            <Lock className="mx-auto h-8 w-8 text-white/35" />
            <h2 className="mt-4 text-xl font-extrabold">Mixer exclusivo do Nébula Nitro</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Ative o Nitro para criar playlists, editar letras e configurar o sistema de graves das suas músicas.
            </p>
            <Button asChild className="mt-5 rounded-full">
              <Link to="/nitro">Abrir Nébula Nitro</Link>
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      className="mx-auto max-w-7xl"
      label="NÉBULA MUSIC LAB"
      title="Nébula Mixer"
      subtitle="Uma página dedicada para biblioteca, playlists contínuas e controle de graves."
    >
      <div className="space-y-5">
        {(error || notice) && (
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm",
              error
                ? "border-red-400/20 bg-red-500/10 text-red-200"
                : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
            )}
          >
            <span>{error || notice}</span>
            {error && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full border border-white/10"
                onClick={load}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Tentar novamente
              </Button>
            )}
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,.07),transparent_34%),#060606]">
          <div className="grid gap-4 p-4 md:p-5 lg:grid-cols-[1.25fr_.75fr]">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.05]">
                <Headphones className="h-7 w-7 text-white/70" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Faixa selecionada</p>
                <h2 className="mt-1 truncate text-xl font-black">{selected?.title || "Nenhuma música"}</h2>
                <p className="truncate text-xs text-muted-foreground">
                  {selected ? `${selected.artist || "Nébula"} · ${formatDuration(selected.duration)}` : "Adicione músicas no Nébula Music"}
                </p>
                {selected && (
                  <Button className="mt-3 rounded-full" size="sm" onClick={() => playLibraryTrack(selected)}>
                    <Play className="mr-2 h-3.5 w-3.5 fill-current" />
                    Tocar agora
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <Disc3 className="h-4 w-4 text-white/55" />
                <p className="mt-3 text-xl font-black">{tracks.length}</p>
                <p className="text-[10px] text-muted-foreground">músicas</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <ListMusic className="h-4 w-4 text-white/55" />
                <p className="mt-3 text-xl font-black">{playlists.length}</p>
                <p className="text-[10px] text-muted-foreground">playlists</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <Waves className="h-4 w-4 text-white/55" />
                <p className="mt-3 text-xl font-black">AUTO</p>
                <p className="text-[10px] text-muted-foreground">próxima faixa</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-4">
            {PANELS.map((panel) => {
              const Icon = panel.icon;
              const current = activePanel === panel.id;
              return (
                <button
                  key={panel.id}
                  type="button"
                  onClick={() => setActivePanel(panel.id)}
                  className={cn(
                    "flex min-h-14 items-center justify-center gap-2 border-white/10 px-3 text-xs font-bold transition",
                    "border-r last:border-r-0",
                    current ? "bg-white/[0.09] text-white" : "bg-black/20 text-white/45 hover:bg-white/[0.045] hover:text-white/80"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {panel.label}
                </button>
              );
            })}
          </div>
        </section>

        {activePanel === "library" && (
          <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#070707]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <h2 className="font-extrabold">Biblioteca</h2>
                <p className="text-xs text-muted-foreground">
                  Tocar uma faixa usa toda a biblioteca como fila e continua automaticamente.
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <div className="relative min-w-[210px] flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={librarySearch}
                    onChange={(event) => setLibrarySearch(event.target.value)}
                    placeholder="Buscar música ou artista..."
                    className="h-9 pl-9 text-xs"
                  />
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to="/nitro">Gerenciar Nitro</Link>
                </Button>
              </div>
            </div>

            <div className="border-b border-white/10 bg-white/[0.015] p-3 md:p-4">
              <div className="grid gap-2 lg:grid-cols-[1fr_1fr_auto_auto]">
                <Input
                  value={uploadTitle}
                  onChange={(event) => setUploadTitle(event.target.value)}
                  placeholder="Título da sua música"
                  disabled={uploadingTrack}
                />
                <Input
                  value={uploadArtist}
                  onChange={(event) => setUploadArtist(event.target.value)}
                  placeholder="Artista (opcional)"
                  disabled={uploadingTrack}
                />
                <label className={cn(
                  "inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-white/10 px-4 text-xs font-bold transition hover:bg-white/[0.05]",
                  uploadingTrack && "pointer-events-none opacity-50"
                )}>
                  <Upload className="mr-2 h-4 w-4" />
                  {uploadFile ? uploadFile.name : "Escolher áudio"}
                  <input
                    type="file"
                    accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.webm"
                    className="hidden"
                    disabled={uploadingTrack}
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      event.target.value = "";
                      setUploadFile(file);
                      if (file && !uploadTitle.trim()) {
                        setUploadTitle(String(file.name || "").replace(/\.[^.]+$/, ""));
                      }
                    }}
                  />
                </label>
                <Button onClick={uploadOwnTrack} disabled={!uploadFile || uploadingTrack}>
                  {uploadingTrack ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {uploadingTrack ? "Enviando..." : "Enviar música"}
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Upload pessoal Nitro: MP3, M4A, AAC, WAV, OGG, FLAC ou WEBM · máximo 25 MB.
              </p>
            </div>

            <div className="grid gap-2 p-2 md:grid-cols-2">
              {visibleTracks.map((track, index) => (
                <div
                  key={track.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                    selected?.id === track.id
                      ? "border-white/15 bg-white/[0.08]"
                      : "border-transparent bg-white/[0.018] hover:bg-white/[0.045]"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => playLibraryTrack(track)}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-white hover:bg-white/[0.12]"
                    aria-label={`Tocar ${track.title}`}
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </button>
                  <button type="button" onClick={() => setSelectedId(track.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-bold">
                      <span className="mr-2 text-[10px] text-white/25">{String(index + 1).padStart(2, "0")}</span>
                      {track.title}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {track.artist || "Nébula"} · {formatDuration(track.duration)}
                    </span>
                  </button>
                  {track.is_official && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">OFICIAL</span>
                  )}
                  {track.uploaded_by_me && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={() => renameOwnTrack(track)}
                        disabled={!!busy}
                        title="Renomear música"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full text-muted-foreground hover:bg-red-500/10 hover:text-red-300"
                        onClick={() => removeOwnTrack(track)}
                        disabled={!!busy}
                        title="Remover música"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              {!visibleTracks.length && (
                <div className="col-span-full rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-xs text-muted-foreground">
                  {tracks.length ? "Nenhuma música encontrada nessa busca." : "Nenhuma música disponível."}
                </div>
              )}
            </div>
          </section>
        )}

        {activePanel === "playlists" && (
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#070707]">
            <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,.08),transparent_35%)] p-4 md:p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <ListMusic className="h-5 w-5" />
                    <h2 className="text-lg font-extrabold">Suas playlists</h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Biblioteca pessoal com reprodução contínua, busca, ordenação e reordenação das faixas.
                  </p>
                </div>

                <div className="grid w-full gap-2 md:grid-cols-[1fr_1fr_auto] xl:max-w-2xl">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={playlistSearch}
                      onChange={(event) => setPlaylistSearch(event.target.value)}
                      placeholder="Buscar playlist..."
                      className="pl-9"
                    />
                  </div>
                  <Input
                    value={playlistName}
                    onChange={(event) => setPlaylistName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") createPlaylist();
                    }}
                    placeholder="Criar nova playlist"
                  />
                  <Button onClick={createPlaylist} disabled={!playlistName.trim() || !!busy}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 p-3 lg:grid-cols-[260px_1fr] md:p-4">
              <aside className="rounded-2xl border border-white/[0.08] bg-black/20 p-2">
                <p className="px-2 pb-2 pt-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/35">
                  Sua biblioteca
                </p>
                <div className="space-y-1">
                  {playlists
                    .filter((playlist) => playlist.name.toLowerCase().includes(playlistSearch.trim().toLowerCase()))
                    .map((playlist) => {
                      const playlistTracks = getPlaylistTracks(playlist);
                      return (
                        <button
                          key={`side:${playlist.id}`}
                          type="button"
                          onClick={() => {
                            setEditingPlaylistId(playlist.id);
                            setPlaylistDraft({
                              name: playlist.name || "",
                              description: playlist.description || "",
                              cover_url: playlist.cover_url || "",
                            });
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl p-2 text-left transition",
                            editingPlaylistId === playlist.id ? "bg-white/[0.09]" : "hover:bg-white/[0.05]"
                          )}
                        >
                          <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.06]">
                            {playlist.cover_url ? (
                              <img src={playlist.cover_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Music2 className="h-4 w-4 text-white/45" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold">{playlist.name}</p>
                            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                              Playlist · {playlistTracks.length} músicas
                            </p>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </aside>

              <div className="space-y-4">
                {playlists
                  .filter((playlist) => playlist.name.toLowerCase().includes(playlistSearch.trim().toLowerCase()))
                  .map((playlist) => {
                    const allPlaylistTracks = getPlaylistTracks(playlist);
                    const included = !!selected && (playlist.track_ids || []).includes(selected.id);
                    const search = String(playlistTrackSearch[playlist.id] || "").trim().toLowerCase();
                    const sort = playlistSort[playlist.id] || "custom";
                    let playlistTracks = allPlaylistTracks.filter((track) =>
                      !search || `${track.title || ""} ${track.artist || ""}`.toLowerCase().includes(search)
                    );
                    if (sort === "title") playlistTracks = [...playlistTracks].sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
                    if (sort === "artist") playlistTracks = [...playlistTracks].sort((a, b) => String(a.artist || "").localeCompare(String(b.artist || "")));
                    if (sort === "duration") playlistTracks = [...playlistTracks].sort((a, b) => Number(a.duration || 0) - Number(b.duration || 0));
                    const duration = allPlaylistTracks.reduce((sum, track) => sum + (Number(track.duration) || 0), 0);
                    const editing = editingPlaylistId === playlist.id;

                    return (
                      <article key={playlist.id} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/20">
                        <div className="grid gap-4 border-b border-white/[0.07] p-4 md:grid-cols-[120px_1fr]">
                          <div className="grid aspect-square w-full max-w-[120px] place-items-center overflow-hidden rounded-xl bg-white/[0.06]">
                            {playlist.cover_url ? (
                              <img src={playlist.cover_url} alt={playlist.name} className="h-full w-full object-cover" />
                            ) : (
                              <ListMusic className="h-9 w-9 text-white/30" />
                            )}
                          </div>

                          <div className="min-w-0">
                            {editing ? (
                              <div className="space-y-2">
                                <Input
                                  value={playlistDraft.name}
                                  onChange={(event) => setPlaylistDraft((current) => ({ ...current, name: event.target.value }))}
                                  placeholder="Nome da playlist"
                                />
                                <Input
                                  value={playlistDraft.description}
                                  onChange={(event) => setPlaylistDraft((current) => ({ ...current, description: event.target.value }))}
                                  placeholder="Descrição"
                                />
                                <div className="relative">
                                  <ImageIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                  <Input
                                    value={playlistDraft.cover_url}
                                    onChange={(event) => setPlaylistDraft((current) => ({ ...current, cover_url: event.target.value }))}
                                    placeholder="URL da capa da playlist"
                                    className="pl-9"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => savePlaylistMeta(playlist)} disabled={!!busy || !playlistDraft.name.trim()}>
                                    <Check className="mr-2 h-3.5 w-3.5" />
                                    Salvar
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingPlaylistId("")}>
                                    <X className="mr-2 h-3.5 w-3.5" />
                                    Cancelar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/30">Playlist</p>
                                <h3 className="mt-1 truncate text-2xl font-black md:text-3xl">{playlist.name}</h3>
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {playlist.description || "Sua playlist pessoal do Nébula Music."}
                                </p>
                                <p className="mt-3 text-[11px] text-white/40">
                                  {allPlaylistTracks.length} músicas · {formatDuration(duration)}
                                </p>
                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                  <Button className="rounded-full" onClick={() => playPlaylist(playlist)} disabled={!allPlaylistTracks.length}>
                                    <Play className="mr-2 h-4 w-4 fill-current" />
                                    Tocar
                                  </Button>
                                  <Button variant="outline" className="rounded-full" onClick={() => playPlaylistShuffle(playlist)} disabled={!allPlaylistTracks.length}>
                                    <Shuffle className="mr-2 h-4 w-4" />
                                    Aleatório
                                  </Button>
                                  {selected && (
                                    <Button
                                      variant={included ? "secondary" : "outline"}
                                      className="rounded-full"
                                      disabled={!!busy}
                                      onClick={() => toggleTrackInPlaylist(playlist, selected.id)}
                                    >
                                      {included ? "Remover música atual" : "Adicionar música atual"}
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="rounded-full" onClick={() => renamePlaylist(playlist)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-full text-muted-foreground hover:bg-red-500/10 hover:text-red-300"
                                    onClick={() => deletePlaylist(playlist)}
                                    disabled={!!busy}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-2 border-b border-white/[0.06] p-3 md:grid-cols-[1fr_auto]">
                          <select
                            value={playlistAddTrack[playlist.id] || ""}
                            onChange={(event) => setPlaylistAddTrack((current) => ({ ...current, [playlist.id]: event.target.value }))}
                            className="h-9 min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-white outline-none"
                          >
                            <option value="">Adicionar música da biblioteca...</option>
                            {tracks
                              .filter((track) => !(playlist.track_ids || []).includes(track.id))
                              .map((track) => (
                                <option key={`add:${playlist.id}:${track.id}`} value={track.id}>
                                  {track.title} — {track.artist || "Nébula"}
                                </option>
                              ))}
                          </select>
                          <Button
                            size="sm"
                            className="h-9"
                            onClick={() => addExistingTrackToPlaylist(playlist)}
                            disabled={!!busy || !playlistAddTrack[playlist.id]}
                          >
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Adicionar música
                          </Button>
                        </div>

                        <div className="grid gap-2 border-b border-white/[0.06] p-3 md:grid-cols-[1fr_180px]">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={playlistTrackSearch[playlist.id] || ""}
                              onChange={(event) => setPlaylistTrackSearch((current) => ({ ...current, [playlist.id]: event.target.value }))}
                              placeholder="Buscar nesta playlist"
                              className="h-9 pl-9 text-xs"
                            />
                          </div>
                          <select
                            value={sort}
                            onChange={(event) => setPlaylistSort((current) => ({ ...current, [playlist.id]: event.target.value }))}
                            className="h-9 rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-white outline-none"
                          >
                            <option value="custom">Ordem personalizada</option>
                            <option value="title">Título</option>
                            <option value="artist">Artista</option>
                            <option value="duration">Duração</option>
                          </select>
                        </div>

                        <div className="max-h-[420px] overflow-y-auto">
                          <div className="grid grid-cols-[34px_1fr_auto_34px] gap-2 border-b border-white/[0.05] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white/25">
                            <span>#</span>
                            <span>Título</span>
                            <span>Duração</span>
                            <span className="sr-only">Remover</span>
                          </div>

                          {playlistTracks.map((track, index) => (
                            <div
                              key={`${playlist.id}:${track.id}`}
                              draggable={sort === "custom" && !search}
                              onDragStart={() => setDragState({ playlistId: playlist.id, trackId: track.id })}
                              onDragOver={(event) => {
                                if (dragState.playlistId === playlist.id && sort === "custom" && !search) event.preventDefault();
                              }}
                              onDrop={() => {
                                if (dragState.playlistId === playlist.id && sort === "custom" && !search) {
                                  movePlaylistTrack(playlist, dragState.trackId, track.id);
                                }
                                setDragState({ playlistId: "", trackId: "" });
                              }}
                              className={cn(
                                "group grid grid-cols-[34px_1fr_auto_34px] items-center gap-2 px-3 py-2 transition hover:bg-white/[0.045]",
                                selected?.id === track.id && "bg-white/[0.04]"
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => playPlaylist(playlist, track.id)}
                                className="relative grid h-8 w-8 place-items-center rounded-full text-xs text-white/35 hover:text-white"
                              >
                                <span className="group-hover:hidden">{index + 1}</span>
                                <Play className="hidden h-3.5 w-3.5 fill-current group-hover:block" />
                              </button>
                              <div className="flex min-w-0 items-center gap-3">
                                {sort === "custom" && !search && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-white/20" />}
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-bold">{track.title}</p>
                                  <p className="truncate text-[10px] text-muted-foreground">{track.artist || "Nébula"}</p>
                                </div>
                              </div>
                              <span className="text-[10px] tabular-nums text-white/35">{formatDuration(track.duration)}</span>
                              <button
                                type="button"
                                onClick={() => toggleTrackInPlaylist(playlist, track.id)}
                                disabled={!!busy}
                                title="Remover da playlist"
                                className="grid h-8 w-8 place-items-center rounded-full text-white/30 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}

                          {!playlistTracks.length && (
                            <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                              {search ? "Nenhuma música encontrada nesta playlist." : "Selecione uma música na Biblioteca e adicione à playlist."}
                            </div>
                          )}
                        </div>

                        {!!allPlaylistTracks.length && (
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-3 py-2 text-[10px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <SkipForward className="h-3 w-3" />
                              Reprodução contínua ativa
                            </span>
                            {sort === "custom" && !search && <span>Arraste as músicas para reorganizar</span>}
                          </div>
                        )}
                      </article>
                    );
                  })}

                {!playlists.filter((playlist) => playlist.name.toLowerCase().includes(playlistSearch.trim().toLowerCase())).length && (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-14 text-center text-xs text-muted-foreground">
                    {playlistSearch ? "Nenhuma playlist encontrada." : "Nenhuma playlist criada ainda."}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activePanel === "beat" && (
          <section className="rounded-2xl border border-white/10 bg-[#070707] p-4 md:p-5">
            <div className="flex items-center gap-2">
              <AudioLines className="h-5 w-5 text-primary" />
              <div>
                <h2 className="font-extrabold">Beat / Graves</h2>
                <p className="text-xs text-muted-foreground">
                  Pulso curto: grave e médio dominam a animação; agudos têm peso mínimo.
                </p>
              </div>
            </div>

            {!selected ? (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-muted-foreground">
                Selecione uma música na Biblioteca.
              </div>
            ) : (
              <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_.8fr]">
                <div className="space-y-5">
                  <label className="block">
                    <div className="mb-2 flex justify-between text-xs">
                      <span>Sensibilidade</span>
                      <strong>{Number(bass.sensitivity || 1).toFixed(2)}×</strong>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.05"
                      value={bass.sensitivity || 1}
                      onChange={(event) =>
                        setBass((value) => ({ ...value, sensitivity: Number(event.target.value) }))
                      }
                      className="w-full accent-white"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 flex justify-between text-xs">
                      <span>Início do grave</span>
                      <strong>{bass.low_hz || 32} Hz</strong>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="120"
                      step="1"
                      value={bass.low_hz || 32}
                      onChange={(event) =>
                        setBass((value) => ({ ...value, low_hz: Number(event.target.value) }))
                      }
                      className="w-full accent-white"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 flex justify-between text-xs">
                      <span>Fim do grave</span>
                      <strong>{bass.high_hz || 210} Hz</strong>
                    </div>
                    <input
                      type="range"
                      min="100"
                      max="350"
                      step="1"
                      value={bass.high_hz || 210}
                      onChange={(event) =>
                        setBass((value) => ({ ...value, high_hz: Number(event.target.value) }))
                      }
                      className="w-full accent-white"
                    />
                  </label>

                  {selected.uploaded_by_me ? (
                    <Button className="w-full" disabled={!!busy} onClick={saveBass}>
                      {busy === "bass:save" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Salvar perfil de graves
                    </Button>
                  ) : (
                    <p className="text-center text-[11px] text-muted-foreground">O perfil desta faixa é somente leitura.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <Waves className="h-5 w-5 text-primary" />
                  <h3 className="mt-3 text-sm font-extrabold">Animação curta restaurada</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    O efeito agora volta rapidamente ao tamanho normal depois de cada transiente, em vez de ficar sustentado.
                    Todas as novas músicas continuam recebendo um perfil de grave para a detecção em tempo real.
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-black/25 p-3">
                      <p className="text-xs font-black">GRAVE</p>
                      <p className="mt-1 text-[9px] text-white/35">forte</p>
                    </div>
                    <div className="rounded-xl bg-black/25 p-3">
                      <p className="text-xs font-black">MÉDIO</p>
                      <p className="mt-1 text-[9px] text-white/35">forte</p>
                    </div>
                    <div className="rounded-xl bg-black/25 p-3">
                      <p className="text-xs font-black">AGUDO</p>
                      <p className="mt-1 text-[9px] text-white/35">leve</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#080808] p-4">
          <div className="flex items-center gap-2">
            <Music2 className="h-4 w-4 text-primary" />
            <p className="text-xs text-muted-foreground">
              O mini player continua global e flutuante; toda a configuração avançada fica concentrada nesta página.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/nitro">Nitro e uploads</Link>
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
