import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Disc3, Headphones, ListMusic, Loader2, Lock, Music2, Play, Plus, Trash2, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STORAGE_TRACK, selectNebulaTrack } from "@/lib/nebulaMusicQueue";
const MAX_FILE_BYTES = 30 * 1024 * 1024;

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  if (!value) return "";
  const min = Math.floor(value / 60);
  const sec = Math.floor(value % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function readAudioDuration(file) {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    const done = (value) => {
      URL.revokeObjectURL(url);
      audio.removeAttribute("src");
      resolve(Number.isFinite(value) ? value : 0);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

async function detectAudioMime(file) {
  try {
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const marker = String.fromCharCode(...bytes.slice(4, 8));
    if (marker === "ftyp") return "audio/mp4";
    const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
    const mpegSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    if (id3 || mpegSync) return "audio/mpeg";
  } catch {}
  return file.type?.startsWith("audio/") ? file.type : "audio/mpeg";
}

function normalizedUploadFile(file, mimeType) {
  if (typeof File === "undefined") return file;
  const currentName = file.name || "audio";
  if (mimeType === "audio/mp4" && !/\.(m4a|mp4)$/i.test(currentName)) {
    return new File([file], currentName.replace(/\.[^.]+$/, "") + ".m4a", { type: "audio/mp4" });
  }
  if (mimeType === "audio/mpeg" && !/\.mp3$/i.test(currentName)) {
    return new File([file], currentName.replace(/\.[^.]+$/, "") + ".mp3", { type: "audio/mpeg" });
  }
  if (file.type !== mimeType) return new File([file], currentName, { type: mimeType });
  return file;
}

export default function NebulaMusicLibrary({ active }) {
  const { user } = useAuth();
  const inputRef = useRef(null);
  const officialInputRef = useRef(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingOfficial, setUploadingOfficial] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canManageOfficial = user?.role === "owner";
  const [selectedId, setSelectedId] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_TRACK) || "null")?.id || "nebula-official-mxrked"; }
    catch { return "nebula-official-mxrked"; }
  });

  const load = useCallback(async () => {
    if (!active && !canManageOfficial) { setTracks([]); return; }
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("musicLibrary", { action: active ? "list" : "official_list" });
      setTracks(Array.isArray(res.data?.tracks) ? res.data.tracks : []);
    } catch (err) {
      setError(err?.response?.data?.error || "Não foi possível carregar a biblioteca agora.");
    } finally {
      setLoading(false);
    }
  }, [active, canManageOfficial]);

  useEffect(() => { load(); }, [load]);

  const choose = (track, queueTracks = tracks) => {
    setSelectedId(track.id);
    selectNebulaTrack(track, {
      id: "nebula-library",
      name: "Biblioteca Nébula",
      source: "library",
      tracks: queueTracks,
    }, { autoplay: true, userInitiated: true });
  };

  const replaceOfficialDefaults = async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    setError("");
    setNotice("");
    if (files.length !== 5) { setError("Selecione exatamente as 5 músicas padrão."); return; }
    if (files.some((file) => !file.type?.startsWith("audio/") || file.size > MAX_FILE_BYTES)) {
      setError("Todas as 5 faixas precisam ser arquivos de áudio de até 30 MB.");
      return;
    }

    setUploadingOfficial(true);
    try {
      const prepared = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const [duration, mimeType] = await Promise.all([
          readAudioDuration(file),
          detectAudioMime(file),
        ]);
        const uploadFile = normalizedUploadFile(file, mimeType);
        const upload = await base44.integrations.Core.UploadPublicFile({ file: uploadFile });
        prepared.push({
          title: file.name.replace(/\.[^.]+$/, "").trim() || `Nébula Track ${index + 1}`,
          artist: "Nébula",
          track_url: upload.file_url,
          mime_type: mimeType,
          duration,
          sort_order: index + 1,
        });
      }

      await base44.functions.invoke("musicLibrary", {
        action: "official_replace",
        tracks: prepared,
      });
      setNotice("As 5 músicas padrão foram atualizadas para todos os usuários.");
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || "Não foi possível atualizar as músicas padrão.");
    } finally {
      setUploadingOfficial(false);
    }
  };

  const addFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setNotice("");
    if (!file.type?.startsWith("audio/")) { setError("Escolha um arquivo de áudio."); return; }
    if (file.size > MAX_FILE_BYTES) { setError("A música pode ter no máximo 30 MB."); return; }

    setUploading(true);
    try {
      const [duration, mimeType] = await Promise.all([
        readAudioDuration(file),
        detectAudioMime(file),
      ]);
      const uploadFile = normalizedUploadFile(file, mimeType);
      const upload = await base44.integrations.Core.UploadPublicFile({ file: uploadFile });
      const rawName = file.name.replace(/\.[^.]+$/, "").trim();
      const result = await base44.functions.invoke("musicLibrary", {
        action: "add",
        title: rawName || "Nova música",
        artist: "Biblioteca Nitro",
        track_url: upload.file_url,
        mime_type: mimeType,
        duration,
      });
      await load();
      if (result.data?.track) {
        const added = {
          ...result.data.track,
          id: result.data.track.id,
          artist: result.data.track.artist || "Biblioteca Nitro",
        };
        choose(added, [...tracks.filter((item) => item.id !== added.id), added]);
      }
    } catch (err) {
      setError(err?.response?.data?.error || "Não foi possível adicionar essa música.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (track) => {
    if (!track?.id || track.is_official) return;
    setError("");
    try {
      await base44.functions.invoke("musicLibrary", { action: "remove", track_id: track.id });
      if (selectedId === track.id) {
        const official = tracks.find((item) => item.is_official);
        if (official) choose(official);
      }
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || "Não foi possível remover essa música.");
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#070707] text-white shadow-[0_24px_70px_-40px_rgba(0,0,0,.95)]">
      <div className="relative border-b border-white/[0.07] p-5 md:p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.05]">
              <Disc3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.26em] text-emerald-400">Só para Nitro</p>
              <h2 className="font-heading text-xl font-extrabold">Nébula Music</h2>
              <p className="mt-0.5 text-xs text-white/50">O Spotify do Nébula — sua biblioteca dentro do OS.</p>
            </div>
          </div>
          {(active || canManageOfficial) && (
            <div className="flex flex-wrap gap-2">
              {canManageOfficial && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => officialInputRef.current?.click()}
                  disabled={uploadingOfficial}
                  className="rounded-full border-amber-400/20 bg-amber-400/[0.06] text-amber-100 hover:bg-amber-400/10"
                >
                  {uploadingOfficial ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crown className="mr-2 h-4 w-4" />}
                  Substituir 5 padrões
                </Button>
              )}
              {active && (
                <>
                  <Button asChild variant="outline" className="rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]">
                    <Link to="/mixer"><ListMusic className="mr-2 h-4 w-4" />Abrir Mixer</Link>
                  </Button>
                  <Button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    className="rounded-full bg-white text-black hover:bg-white/90"
                  >
                    {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Adicionar música
                  </Button>
                </>
              )}
            </div>
          )}
          <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={addFile} />
          <input ref={officialInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={replaceOfficialDefaults} />
        </div>
      </div>

      {!active && !canManageOfficial ? (
        <div className="grid min-h-44 place-items-center px-5 py-10 text-center">
          <div>
            <Lock className="mx-auto h-6 w-6 text-white/35" />
            <p className="mt-3 text-sm font-bold">Biblioteca exclusiva do Nébula Nitro</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-white/45">Ative o Nitro para abrir o Nébula Music, escolher faixas e adicionar suas próprias músicas.</p>
          </div>
        </div>
      ) : loading ? (
        <div className="grid min-h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-white/50" /></div>
      ) : (
        <div className="p-3 md:p-4">
          {error && <div className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
          {notice && <div className="mb-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{notice}</div>}
          {!active && canManageOfficial && (
            <div className="mb-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2 text-xs text-amber-100/80">
              Modo Owner: abaixo estão apenas as faixas padrão globais. Uploads pessoais continuam exigindo Nitro.
            </div>
          )}
          <div className="space-y-1">
            {tracks.map((track, index) => {
              const selected = selectedId === track.id;
              return (
                <div key={track.id} className={cn("group flex items-center gap-3 rounded-xl px-3 py-2.5 transition", selected ? "bg-white/[0.09]" : "hover:bg-white/[0.05]") }>
                  <button type="button" onClick={() => choose(track)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-white hover:bg-white/[0.12]" aria-label={`Tocar ${track.title}`}>
                    {selected ? <Headphones className="h-4 w-4 text-emerald-400" /> : <Play className="ml-0.5 h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold">{track.title}</p>
                      {track.is_official && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400">Oficial</span>}
                    </div>
                    <p className="truncate text-[11px] text-white/45">{track.artist || "Nébula"}{track.duration ? ` · ${formatDuration(track.duration)}` : ""}</p>
                  </div>
                  <span className="hidden w-7 text-center text-[10px] tabular-nums text-white/25 sm:block">{String(index + 1).padStart(2, "0")}</span>
                  {!track.is_official && track.uploaded_by_me && (
                    <button type="button" onClick={() => remove(track)} className="grid h-8 w-8 place-items-center rounded-full text-white/25 opacity-70 transition hover:bg-white/[0.08] hover:text-red-300 md:opacity-0 md:group-hover:opacity-100" aria-label="Remover música">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            {!tracks.length && (
              <div className="grid min-h-36 place-items-center text-center text-xs text-white/40"><Music2 className="mb-2 h-5 w-5" />Nenhuma música disponível.</div>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] px-2 pt-4 text-[10px] text-white/35">
            <Upload className="h-3.5 w-3.5" />
            {active ? "Nitros podem adicionar arquivos de áudio pessoais de até 30 MB." : "As faixas padrão globais ficam disponíveis para todos; uploads pessoais continuam Nitro-only."}
          </div>
        </div>
      )}
    </section>
  );
}
