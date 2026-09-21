import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Volume2,
  VolumeX,
  PhoneOff,
  UserPlus,
  Settings,
  Maximize2,
  Minimize2,
  Users,
  Activity,
  Cpu,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useCall } from "@/lib/CallContext";
import { callEngine } from "@/lib/callEngine";
import ProfileAvatar from "@/components/ProfileAvatar";
import CallSidebar from "@/components/calls/CallSidebar";
import PeerTile from "@/components/calls/PeerTile";
import ProfileCard from "@/components/calls/ProfileCard";
import CallSettingsDialog from "@/components/calls/CallSettingsDialog";
import CallMuteIndicators from "@/components/calls/CallMuteIndicators";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { getNitroCallSoundEnabled } from "@/lib/nitroSoundPreferences";

let controlAudioContext = null;

function getControlAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!controlAudioContext || controlAudioContext.state === "closed") controlAudioContext = new AudioCtx();
  return controlAudioContext;
}

function playControlTone(action, enabled) {
  if (!getNitroCallSoundEnabled()) return;
  const ctx = getControlAudioContext();
  if (!ctx) return;

  const patterns = {
    mic: enabled ? [520, 700] : [700, 420],
    audio: enabled ? [430, 610] : [610, 330],
    camera: enabled ? [560, 760] : [760, 460],
    share: enabled ? [390, 540, 720] : [720, 520, 360],
  };
  const notes = patterns[action] || (enabled ? [500, 680] : [680, 420]);

  const play = () => {
    try {
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      master.connect(ctx.destination);

      notes.forEach((frequency, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + index * 0.07;
        osc.type = "sine";
        osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.48, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(start + 0.1);
      });
    } catch {
      /* feedback sonoro opcional */
    }
  };

  if (ctx.state === "suspended") ctx.resume().then(play).catch(() => {});
  else play();
}

export default function CallRoom({ channel }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const {
    micOn,
    deafened,
    camOn,
    sharing,
    connected,
    peers,
    me,
    micStream,
    localStream,
    shareOptions,
    coreOsJoined,
    toggleMic,
    toggleDeafened,
    toggleCam,
    toggleShare,
    setShareOptions,
    leave,
  } = useCall();

  const videoRef = useRef(null);
  const tileRef = useRef(null);
  const roomRef = useRef(null);
  const sensRef = useRef(12);
  const meterPaintRef = useRef(0);

  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devices, setDevices] = useState({ mics: [], cams: [], outputs: [] });
  const [sensitivity, setSensitivity] = useState(12);
  const [deviceNotice, setDeviceNotice] = useState(null);
  const [roomFullscreen, setRoomFullscreen] = useState(false);
  const [previewSharedScreen, setPreviewSharedScreen] = useState(false);

  useEffect(() => {
    if (!sharing) {
      setPreviewSharedScreen(false);
      return;
    }

    // Nunca mantenha a própria transmissão de tela em fullscreen. Quando o
    // usuário compartilha o mesmo monitor onde a call está aberta, renderizar
    // essa captura em tela cheia cria o efeito de espelho infinito e pode
    // disparar artefatos de composição/GPU. Saímos do fullscreen e mantemos a
    // prévia local oculta; os demais participantes continuam recebendo a tela.
    if (document.fullscreenElement === tileRef.current || document.fullscreenElement === roomRef.current) {
      document.exitFullscreen().catch(() => {});
    }
    setPreviewSharedScreen(false);
  }, [sharing]);

  const name = me.name || t("common.you");
  const profile = (user && user.profile) || {};
  const showVideo = camOn || sharing;
  const hasCoreOs = Boolean(channel?.staffPrivate && coreOsJoined);
  const maxParticipants = channel?.ticketCall ? 12 : channel?.staffPrivate ? 13 : 8;
  const count = 1 + peers.length + (hasCoreOs ? 1 : 0);

  const changeSensitivity = (v) => {
    setSensitivity(v);
    sensRef.current = v;
  };

  // Reanexa o vídeo local sempre que câmera/compartilhamento muda
  useEffect(() => {
    const next = showVideo && (!sharing || previewSharedScreen) ? localStream : null;
    if (videoRef.current && videoRef.current.srcObject !== next) {
      videoRef.current.srcObject = next;
    }
  }, [showVideo, sharing, previewSharedScreen, localStream]);

  // Detecção de voz local (indicador de fala) sobre o mic do motor
  useEffect(() => {
    if (!micStream || micStream.getAudioTracks().length === 0) {
      setSpeaking(false);
      setLevel(0);
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(micStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const loop = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length;
      // Nível quantizado + atualização só quando muda: evita re-render a 60fps (tremedeira na tela)
      const lvl = Math.min(100, Math.round((avg * 1.8) / 4) * 4);
      const speakingNow = micOn && avg > sensRef.current;
      // A mídia continua nativa a 60fps; o indicador visual atualiza só 15x/s.
      const now = performance.now();
      if (now - meterPaintRef.current >= 66) {
        meterPaintRef.current = now;
        setLevel((prev) => (prev !== lvl ? lvl : prev));
        setSpeaking((prev) => (prev !== speakingNow ? speakingNow : prev));
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ctx.close().catch(() => {});
      setSpeaking(false);
      setLevel(0);
    };
  }, [micStream, micOn]);

  // Detecção automática de headset: notifica troca de dispositivo
  useEffect(() => {
    let prevInputs = null;
    const refresh = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        const inputs = list.filter((d) => d.kind === "audioinput");
        if (prevInputs !== null && inputs.length !== prevInputs) {
          setDeviceNotice(
            inputs.length > prevInputs ? t("call.headset_connected") : t("call.headset_removed")
          );
          setTimeout(() => setDeviceNotice(null), 4000);
          callEngine.setMicOptions({});
        }
        prevInputs = inputs.length;
        setDevices({
          mics: inputs,
          cams: list.filter((d) => d.kind === "videoinput"),
          outputs: list.filter((d) => d.kind === "audiooutput"),
        });
      } catch {
        /* enumeração indisponível */
      }
    };
    refresh();
    const md = navigator.mediaDevices;
    if (md && md.addEventListener) md.addEventListener("devicechange", refresh);
    return () => {
      if (md && md.removeEventListener) md.removeEventListener("devicechange", refresh);
    };
  }, []);

  // Acompanha o estado de tela cheia para estilizar a sala inteira
  useEffect(() => {
    const onFs = () => setRoomFullscreen(document.fullscreenElement === roomRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Tela cheia no próprio <video>: fullscreen nativo, sem artefatos/piscadas
  const toggleFullscreen = () => {
    // A prévia da PRÓPRIA tela compartilhada nunca entra em fullscreen. Isso
    // evita recursão visual (a tela exibindo a própria tela indefinidamente).
    if (sharing) return;
    const el = tileRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  // Tela cheia da call inteira: vídeos, participantes e controles
  const toggleRoomFullscreen = () => {
    if (!roomRef.current) return;
    // Enquanto a tela local estiver sendo transmitida, não colocamos a sala
    // inteira em fullscreen no mesmo monitor. Fullscreen continua disponível
    // normalmente fora do compartilhamento e para transmissões remotas.
    if (sharing) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (roomRef.current.requestFullscreen) roomRef.current.requestFullscreen().catch(() => {});
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div
        ref={roomRef}
        className={cn(
          "call-room-shell space-y-4 lg:col-span-2",
          roomFullscreen && "max-h-screen overflow-y-auto bg-[#050505] p-4 scrollbar-thin"
        )}
      >
        {deviceNotice && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-400">
            <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-emerald-400" />
            {deviceNotice}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div
            ref={tileRef}
            className={cn(
              "call-media-tile relative grid aspect-video place-items-center overflow-hidden rounded-2xl border border-border/50 bg-[#0a0a0a]",
              sharing && "sm:col-span-2 xl:col-span-3",
              sharing && !previewSharedScreen && "min-h-52"
            )}
          >
            {sharing && !previewSharedScreen ? (
              <div className="max-w-lg px-6 text-center">
                <MonitorUp aria-hidden="true" className="mx-auto h-8 w-8 text-primary" />
                <p className="mt-3 text-sm font-semibold">Sua tela está sendo compartilhada</p>
                <p className="mt-2 text-xs text-muted-foreground">A prévia local fica oculta para evitar imagens repetidas ao compartilhar esta janela. As outras pessoas continuam recebendo sua tela. Escolha outra aba ou janela para mostrar conteúdo.</p>
                <button type="button" onClick={() => setPreviewSharedScreen(true)} className="mt-4 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent">Mostrar prévia local</button>
              </div>
            ) : showVideo ? (
              // object-contain no compartilhamento: exibe a tela inteira sem cortes/distorções
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                className={cn("call-media-video h-full w-full bg-black", sharing ? "object-contain" : "object-cover")}
              />
            ) : (
              <div className="px-4 text-center">
                <ProfileAvatar
                  name={name}
                  avatar={profile.avatar_url}
                  size="xl"
                  frame={profile.frame}
                  className={cn(
                    "mx-auto transition-all duration-300",
                    speaking && "scale-105 ring-2 ring-primary shadow-[0_0_30px_hsl(var(--ring)/0.65)]"
                  )}
                />
                {speaking && micOn ? <p className="mt-3 text-xs font-semibold text-primary">{t("call.speaking")}</p> : null}
                {micOn && (
                  <div className="mx-auto mt-2 h-1 w-28 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-100"
                      style={{ width: `${level}%` }}
                    />
                  </div>
                )}
              </div>
            )}
            <span className="absolute left-3 top-3 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-bold text-black">
              {t("call.you")}
            </span>
            {showVideo && (
              <span className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                {sharing ? t("call.sharing") : t("call.camera")}
              </span>
            )}
            {sharing && previewSharedScreen && (
              <button type="button" onClick={() => setPreviewSharedScreen(false)} className="absolute bottom-3 right-3 rounded-md bg-black/70 px-3 py-1.5 text-xs text-white">Ocultar prévia</button>
            )}
            <CallMuteIndicators micMuted={!micOn} deafened={deafened} className="absolute right-3 top-3" />
            {showVideo && !sharing && (
              <button
                onClick={toggleFullscreen}
                title={t("call.fullscreen")}
                aria-label={t("call.fullscreen")}
                className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {peers.map((peer) => (
            <PeerTile key={peer.seat} peer={peer} muted={deafened} />
          ))}

          {hasCoreOs && (
            <div className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl border border-primary/30 bg-primary/[0.06] text-center">
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-[0_0_35px_hsl(var(--ring)/0.18)]">
                  <Cpu className="h-7 w-7" />
                </div>
                <p className="mt-3 text-sm font-extrabold">Core OS</p>
                <p className="mt-1 text-xs text-emerald-400">IA conectada à Staff Call</p>
              </div>
              <span className="absolute left-3 top-3 rounded-md bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground">CORE AI</span>
            </div>
          )}

          {peers.length === 0 && !hasCoreOs && (
            <div className="grid aspect-video place-items-center overflow-hidden rounded-2xl border border-border/50 bg-[#0a0a0a] text-center sm:col-span-1 xl:col-span-2">
              <div>
                <UserPlus className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">{t("call.waiting")}</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {t("call.waiting_hint", { name: channel.name })}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/50 bg-[#121212] p-3">
          <button
            onClick={() => {
              playControlTone("mic", !micOn);
              toggleMic();
            }}
            title={micOn ? t("call.mic_disable") : t("call.mic_enable")} 
            className={cn(
              "grid h-11 w-11 place-items-center rounded-full transition-colors",
              micOn ? "bg-secondary text-foreground hover:bg-accent" : "bg-destructive text-destructive-foreground"
            )}
          >
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
          <button
            onClick={() => {
              playControlTone("camera", !camOn);
              toggleCam();
            }}
            title={camOn ? t("call.cam_disable") : t("call.cam_enable")} 
            className={cn(
              "grid h-11 w-11 place-items-center rounded-full transition-colors",
              camOn ? "bg-secondary text-foreground hover:bg-accent" : "bg-destructive text-destructive-foreground"
            )}
          >
            {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>
          <div className="grid w-full grid-cols-2 gap-2 rounded-xl border border-border/40 bg-background/35 p-1.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <select
              value={shareOptions?.quality || "1080p"}
              onChange={(e) => setShareOptions({ quality: e.target.value })}
              disabled={sharing}
              className="h-8 w-full rounded-lg border border-border/50 bg-secondary px-2 text-[11px] font-semibold outline-none disabled:opacity-50 sm:w-auto"
              aria-label="Qualidade da transmissão"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              <option value="1440p">1440p</option>
            </select>
            <select
              value={shareOptions?.fps || 30}
              onChange={(e) => setShareOptions({ fps: Number(e.target.value) })}
              disabled={sharing}
              className="h-8 w-full rounded-lg border border-border/50 bg-secondary px-2 text-[11px] font-semibold outline-none disabled:opacity-50 sm:w-auto"
              aria-label="FPS da transmissão"
            >
              <option value={15}>15 FPS</option>
              <option value={30}>30 FPS</option>
              <option value={60}>60 FPS</option>
            </select>
            <button
              onClick={() => {
                playControlTone("share", !sharing);
                toggleShare();
              }}
              className={cn(
                "col-span-2 flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold transition-colors sm:col-span-1",
                sharing ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-accent"
              )}
            >
              <MonitorUp className="h-4 w-4" /> {t("call.share_screen")}
            </button>
          </div>
          <button
            onClick={() => {
              playControlTone("audio", deafened);
              toggleDeafened();
            }}
            title={deafened ? t("call.audio_enable") : t("call.audio_disable")} 
            className={cn(
              "relative grid h-11 w-11 place-items-center rounded-full transition-colors",
              !deafened ? "bg-secondary text-foreground hover:bg-accent" : "bg-destructive text-destructive-foreground"
            )}
          >
            {!deafened ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            {deafened && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-[#121212]" />}
          </button>
          <button
            onClick={toggleRoomFullscreen}
            disabled={sharing}
            title={sharing ? "Saia do compartilhamento para usar tela cheia sem recursão visual" : (roomFullscreen ? t("call.exit_fullscreen") : t("call.room_fullscreen"))}
            className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {roomFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title={t("call.settings")}
            className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            onClick={leave}
            className="ml-auto flex min-w-[120px] flex-1 items-center justify-center gap-1.5 rounded-full bg-destructive px-4 py-2.5 text-xs font-bold text-destructive-foreground transition-colors hover:bg-destructive/90 sm:flex-none"
          >
            <PhoneOff className="h-4 w-4" /> {t("call.leave")}
          </button>
        </div>

        <div className="rounded-2xl border border-border/50 bg-[#121212] p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
            <Users className="h-3.5 w-3.5 text-primary" /> {t("call.participants")} · {count}/{maxParticipants}
          </p>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/40 bg-card/60 p-3">
              <ProfileCard
                profile={{ name, avatar: profile.avatar_url, frame: profile.frame, banner: profile.banner_url, micOn, camOn, user_id: user?.id }}
              >
                <button type="button" className="flex items-center gap-3 rounded-xl text-left transition-opacity hover:opacity-75">
                  <ProfileAvatar name={name} avatar={profile.avatar_url} size="sm" frame={profile.frame} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-xs font-bold">
                        {name} <span className="text-muted-foreground">{t("call.you_suffix")}</span>
                      </p>
                      <CallMuteIndicators micMuted={!micOn} deafened={deafened} compact />
                    </div>
                    {speaking && micOn ? <p className="text-[11px] font-semibold text-primary">{t("call.speaking")}</p> : null}
                  </div>
                </button>
              </ProfileCard>
              <div className="w-full sm:w-44">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t("call.sensitivity")}</p>
                <input
                  type="range"
                  min="4"
                  max="40"
                  value={sensitivity}
                  onChange={(e) => changeSensitivity(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            </div>
            {hasCoreOs && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] p-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Cpu className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">Core OS</p><p className="text-[11px] text-emerald-400">Conectada · assistente da equipe</p></div>
              </div>
            )}
            {peers.map((peer) => (
              <div key={peer.seat} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/40 bg-card/60 p-3">
                <ProfileCard
                  profile={{
                    name: peer.name,
                    avatar: peer.avatar,
                    frame: peer.frame,
                    banner: peer.banner,
                    micOn: peer.micOn,
                    camOn: peer.camOn,
                    sharing: peer.sharing,
                    user_id: peer.user_id,
                  }}
                >
                  <button type="button" className="flex items-center gap-3 rounded-xl text-left transition-opacity hover:opacity-75">
                    <ProfileAvatar name={peer.name} avatar={peer.avatar} size="sm" frame={peer.frame} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-xs font-bold">{peer.name}</p>
                        <CallMuteIndicators micMuted={!peer.micOn} deafened={Boolean(peer.deafened)} compact />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {peer.sharing ? t("call.peer_sharing") : peer.camOn ? t("call.peer_camera") : ""}
                        {peer.linked ? "" : t("call.peer_connecting")}
                      </p>
                    </div>
                  </button>
                </ProfileCard>
                <div className="flex w-full min-w-0 items-center gap-2 sm:ml-auto sm:w-auto sm:min-w-[150px]">
                  {deafened || Number(peer.volume ?? 1) <= 0 ? <VolumeX className="h-3.5 w-3.5 text-amber-400" /> : <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={peer.volume ?? 1}
                    onChange={(e) => callEngine.setPeerVolume(peer.seat, Number(e.target.value))}
                    className="w-full accent-primary"
                    aria-label={`Volume de ${peer.name}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-[#121212] px-4 py-3">
          <span className="flex items-center gap-2 text-xs font-semibold">
            <Activity className="h-3.5 w-3.5 text-emerald-500" />
            {t("call.active")} · {connected ? t("call.connected") : t("call.connecting")}
          </span>
          <Link
            to="/"
            className="text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("call.browse")}
          </Link>
          <button
            onClick={leave}
            className="flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground transition-colors hover:bg-destructive/90"
          >
            <PhoneOff className="h-3.5 w-3.5" /> {t("call.leave")}
          </button>
        </div>
      </div>
      <CallSidebar channel={channel} connected={connected} count={count} maxCount={maxParticipants} />

      <CallSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        devices={devices}
        sensitivity={sensitivity}
        onSensitivityChange={changeSensitivity}
        level={level}
        speaking={speaking}
        micOn={micOn}
      />
    </div>
  );
}
