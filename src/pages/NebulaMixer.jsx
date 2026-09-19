import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { nitroStatusFromRequests } from "@/lib/nitro";
import PageShell from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { STORAGE_TRACK, selectNebulaTrack } from "@/lib/nebulaMusicQueue";
import {
  AudioLines,
  Bot,
  Disc3,
  Headphones,
  ListMusic,
  Loader2,
  Lock,
  Music2,
  Play,
  Plus,
  Save,
  SkipForward,
  Sparkles,
  Trash2,
  Waves,
} from "lucide-react";

const PANELS = [
  { id: "library", label: "Biblioteca", icon: Disc3 },
  { id: "playlists", label: "Playlists", icon: ListMusic },
  { id: "lyrics", label: "Letras + IA", icon: Sparkles },
  { id: "beat", label: "Beat / Graves", icon: AudioLines },
];

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  const min = Math.floor(value / 60);
  const sec = Math.floor(value % 60).toString().padStart(2, "0");
  return value ? `${min}:${sec}` : "--:--";
}

export default function NebulaMixer() {
  const { user } = useAuth();
  const [active, setActive] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [activePanel, setActivePanel] = useState("library");
  const [playlistName, setPlaylistName] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [idea, setIdea] = useState("");
  const [bass, setBass] = useState({ mode: "realtime", sensitivity: 1, low_hz: 32, high_hz: 210 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mixerPersonality, setMixerPersonality] = useState(null);

  const selected = useMemo(
    () => tracks.find((track) => track.id === selectedId) || tracks[0] || null,
    [tracks, selectedId]
  );

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
      const requests = await base44.entities.NitroRequest.filter({ user_id: user.id }, "-created_date", 50);
      const status = nitroStatusFromRequests(requests || []);
      setActive(status.active);

      if (!status.active) {
        setTracks([]);
        setPlaylists([]);
        return;
      }

      const [libraryRes, playlistsRes] = await Promise.all([
        base44.functions.invoke("musicLibrary", { action: "list" }),
        base44.functions.invoke("musicLibrary", { action: "playlist_list" }),
      ]);

      const nextTracks = Array.isArray(libraryRes.data?.tracks) ? libraryRes.data.tracks : [];
      setTracks(nextTracks);
      setMixerPersonality(libraryRes.data?.mixer_personality || null);
      setPlaylists(Array.isArray(playlistsRes.data?.playlists) ? playlistsRes.data.playlists : []);
      setSelectedId((current) =>
        current && nextTracks.some((track) => track.id === current) ? current : nextTracks[0]?.id || ""
      );
    } catch (err) {
      setError(err?.response?.data?.error || "Não foi possível abrir o Nébula Mixer.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setLyrics(selected.lyrics || "");
    setBass(selected.bass_profile || { mode: "realtime", sensitivity: 1, low_hz: 32, high_hz: 210 });
  }, [selected?.id, selected?.lyrics, selected?.bass_profile]);

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

  const createPlaylist = () => {
    const name = playlistName.trim();
    if (!name) return;

    run(
      "playlist:create",
      async () => {
        await base44.functions.invoke("musicLibrary", { action: "playlist_create", name });
        setPlaylistName("");
      },
      "Playlist criada."
    );
  };

  const toggleTrackInPlaylist = (playlist, trackId) => {
    const current = Array.isArray(playlist.track_ids) ? playlist.track_ids : [];
    const next = current.includes(trackId)
      ? current.filter((id) => id !== trackId)
      : [...current, trackId];

    run(
      `playlist:${playlist.id}`,
      () =>
        base44.functions.invoke("musicLibrary", {
          action: "playlist_update",
          playlist_id: playlist.id,
          track_ids: next,
        }),
      current.includes(trackId) ? "Música removida da playlist." : "Música adicionada à playlist."
    );
  };

  const saveLyrics = () => {
    if (!selected?.uploaded_by_me) return;
    run(
      "lyrics:save",
      () =>
        base44.functions.invoke("musicLibrary", {
          action: "save_lyrics",
          track_id: selected.id,
          lyrics,
          lyrics_source: "manual",
        }),
      "Letra salva."
    );
  };

  const generateLyrics = () => {
    if (!selected?.uploaded_by_me) return;
    run(
      "lyrics:ai",
      async () => {
        const generated = await base44.functions.invoke("musicLibrary", {
          action: "generate_lyrics",
          track_id: selected.id,
          idea,
        });
        const finalLyrics = String(generated.data?.lyrics || "").trim();
        if (!finalLyrics) throw new Error("A IA não conseguiu concluir a letra.");
        setLyrics(finalLyrics);
      },
      "Letra original criada pela IA e salva."
    );
  };

  const saveBass = () => {
    if (!selected?.uploaded_by_me) return;
    run(
      "bass:save",
      async () => {
        const res = await base44.functions.invoke("musicLibrary", {
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
        subtitle="Playlists, letras e controle de graves para músicas do Nébula."
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
      subtitle="Uma página dedicada para biblioteca, playlists contínuas, letras com IA e sincronização de graves."
    >
      <div className="space-y-5">
        {(error || notice) && (
          <div
            className={cn(
              "rounded-xl border px-4 py-3 text-sm",
              error
                ? "border-red-400/20 bg-red-500/10 text-red-200"
                : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
            )}
          >
            {error || notice}
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
              <Button asChild variant="outline" size="sm">
                <Link to="/nitro">Gerenciar uploads</Link>
              </Button>
            </div>

            <div className="grid gap-2 p-2 md:grid-cols-2">
              {tracks.map((track, index) => (
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
                </div>
              ))}

              {!tracks.length && (
                <div className="col-span-full rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-xs text-muted-foreground">
                  Nenhuma música disponível.
                </div>
              )}
            </div>
          </section>
        )}

        {activePanel === "playlists" && (
          <section className="rounded-2xl border border-white/10 bg-[#070707] p-4 md:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ListMusic className="h-5 w-5" />
                  <h2 className="font-extrabold">Playlists contínuas</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Quando uma faixa termina, a próxima começa sozinha e a lista volta ao início no final.
                </p>
              </div>

              <div className="flex w-full gap-2 lg:max-w-md">
                <Input
                  value={playlistName}
                  onChange={(event) => setPlaylistName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") createPlaylist();
                  }}
                  placeholder="Nome da nova playlist"
                />
                <Button onClick={createPlaylist} disabled={!playlistName.trim() || !!busy} size="icon">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {playlists.map((playlist) => {
                const playlistTracks = getPlaylistTracks(playlist);
                const included = !!selected && (playlist.track_ids || []).includes(selected.id);

                return (
                  <div key={playlist.id} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/20">
                    <div className="flex items-center gap-2 border-b border-white/[0.07] p-3">
                      <button
                        type="button"
                        onClick={() => playPlaylist(playlist)}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-white transition hover:bg-white/[0.12]"
                        aria-label={`Tocar playlist ${playlist.name}`}
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{playlist.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {playlistTracks.length} faixas · reprodução contínua
                        </p>
                      </div>

                      {selected && (
                        <Button
                          variant={included ? "secondary" : "outline"}
                          size="sm"
                          disabled={!!busy}
                          onClick={() => toggleTrackInPlaylist(playlist, selected.id)}
                        >
                          {included ? "Remover atual" : "Adicionar atual"}
                        </Button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          run(
                            `delete:${playlist.id}`,
                            () =>
                              base44.functions.invoke("musicLibrary", {
                                action: "playlist_delete",
                                playlist_id: playlist.id,
                              }),
                            "Playlist removida."
                          )
                        }
                        className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-300"
                        aria-label={`Excluir playlist ${playlist.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="max-h-72 overflow-y-auto p-2">
                      {playlistTracks.map((track, index) => (
                        <button
                          key={`${playlist.id}:${track.id}`}
                          type="button"
                          onClick={() => playPlaylist(playlist, track.id)}
                          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-white/[0.05]"
                        >
                          <span className="w-5 text-right text-[10px] tabular-nums text-white/25">
                            {index + 1}
                          </span>
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.05]">
                            <Play className="h-3 w-3" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-bold">{track.title}</span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {track.artist || "Nébula"} · {formatDuration(track.duration)}
                            </span>
                          </span>
                        </button>
                      ))}

                      {!playlistTracks.length && (
                        <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                          Selecione uma música na Biblioteca e use “Adicionar atual”.
                        </div>
                      )}
                    </div>

                    {!!playlistTracks.length && (
                      <div className="flex items-center gap-1.5 border-t border-white/[0.07] px-3 py-2 text-[10px] text-muted-foreground">
                        <SkipForward className="h-3 w-3" />
                        Próxima faixa automática ativada.
                      </div>
                    )}
                  </div>
                );
              })}

              {!playlists.length && (
                <div className="xl:col-span-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-xs text-muted-foreground">
                  Nenhuma playlist criada ainda.
                </div>
              )}
            </div>
          </section>
        )}

        {activePanel === "lyrics" && (
          <section className="rounded-2xl border border-white/10 bg-[#070707] p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="font-extrabold">Letras + IA</h2>
                  <p className="text-xs text-muted-foreground">{selected?.title || "Selecione uma música"}</p>
                </div>
              </div>
              {selected?.lyrics_source === "ai_original" && (
                <span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-bold text-primary">IA ORIGINAL</span>
              )}
            </div>

            {!selected ? (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-muted-foreground">
                Selecione uma música na Biblioteca.
              </div>
            ) : !selected.uploaded_by_me ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-xs text-muted-foreground">
                A letra só pode ser editada pelo usuário que adicionou esta música. A faixa oficial continua protegida.
              </div>
            ) : (
              <>
                <textarea
                  value={lyrics}
                  onChange={(event) => setLyrics(event.target.value)}
                  placeholder="Cole sua letra aqui ou use a IA para criar uma letra original..."
                  className="mt-4 min-h-72 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-primary/40"
                />
                <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto_auto]">
                  <Input
                    value={idea}
                    onChange={(event) => setIdea(event.target.value)}
                    placeholder="Ideia para a letra: tema, clima, história..."
                  />
                  <Button variant="outline" disabled={!!busy} onClick={generateLyrics}>
                    {busy === "lyrics:ai" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Bot className="mr-2 h-4 w-4" />
                    )}
                    Criar com IA
                  </Button>
                  <Button disabled={!!busy} onClick={saveLyrics}>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar
                  </Button>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  A IA cria letras novas e originais; ela não copia letras de músicas existentes.
                </p>
              </>
            )}
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
