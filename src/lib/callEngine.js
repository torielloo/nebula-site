import { base44 } from "@/api/base44Client";

const ICE = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: "stun:stun.cloudflare.com:3478" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 8,
  bundlePolicy: "max-bundle",
};

let callAudioContext = null;

function getCallAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!callAudioContext || callAudioContext.state === "closed") callAudioContext = new AudioCtx();
  return callAudioContext;
}

function unlockCallAudio() {
  const ctx = getCallAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

function playCallTone(kind = "join") {
  const ctx = getCallAudioContext();
  if (!ctx) return;

  const play = () => {
    try {
      const master = ctx.createGain();
      const now = ctx.currentTime;
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      master.connect(ctx.destination);

      const notes = kind === "leave"
        ? [{ f: 620, t: 0 }, { f: 470, t: 0.105 }, { f: 350, t: 0.21 }]
        : [{ f: 390, t: 0 }, { f: 520, t: 0.09 }, { f: 700, t: 0.18 }];

      notes.forEach(({ f, t }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + t;
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.75, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.115);
        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(start + 0.13);
      });
    } catch {
      /* som de interface é opcional */
    }
  };

  if (ctx.state === "suspended") ctx.resume().then(play).catch(() => {});
  else play();
}

/**
 * Motor da Nébula Call — singleton que mantém a call viva em todo o site.
 * Conecta à sala do servidor (actor) do canal escolhido, sincroniza a
 * presença de todos os participantes e cria a malha WebRTC (áudio + vídeo)
 * entre eles. Enquanto não chamar leave(), a call continua ativa mesmo
 * navegando entre páginas.
 */
class CallEngine {
  constructor() {
    this.listeners = new Set();
    this.room = null;
    this.channel = null;
    this.seat = null;
    this.roster = [];
    this.peers = new Map(); // seat -> { pc, stream, audioSender, videoSender, remoteSet, pending }
    this.micStream = null;
    this.camStream = null;
    this.screenStream = null;
    this.micOn = false;
    this.deafened = false;
    this.camOn = false;
    this.sharing = false;
    this.connected = false;
    this.profile = {};
    this.micOptions = { deviceId: null, noise: true, echo: true, autoGain: true };
    this.camDeviceId = null;
    this.shareOptions = { quality: "1080p", fps: 30 };
    this.coreOsJoined = false;
    this.coreOsMessages = [];
    this.joinError = null;
    this.rosterInitialized = false;
  }

  /* ---------- estado / inscrições ---------- */

  snapshot() {
    return {
      channel: this.channel,
      connected: this.connected,
      micOn: this.micOn,
      deafened: this.deafened,
      camOn: this.camOn,
      sharing: this.sharing,
      micStream: this.micStream,
      localStream: this.screenStream || this.camStream,
      shareOptions: this.shareOptions,
      coreOsJoined: this.coreOsJoined,
      coreOsMessages: this.coreOsMessages,
      joinError: this.joinError,
      me: {
        seat: this.seat,
        name: this.profile.name || "Você",
        avatar: this.profile.avatar,
        frame: this.profile.frame,
        banner: this.profile.banner,
        deafened: this.deafened,
      },
      peers: this.roster
        .filter((u) => u.seat !== this.seat && !(this.profile?.user_id && u.user_id === this.profile.user_id))
        .map((u) => {
          const p = this.peers.get(u.seat);
          return { ...u, stream: p ? p.stream : null, linked: !!p, volume: p?.volume ?? 1 };
        }),
    };
  }

  emit() {
    const snap = this.snapshot();
    this.listeners.forEach((cb) => cb(snap));
  }

  subscribe(cb) {
    this.listeners.add(cb);
    cb(this.snapshot());
    return () => this.listeners.delete(cb);
  }

  /* ---------- entrar / sair ---------- */

  async join(channel, profile) {
    unlockCallAudio();
    this.leave();
    this.channel = channel;
    this.profile = profile || {};
    this.joinError = null;
    // Cada instância/aba recebe uma conexão própria. sessionStorage pode ser
    // clonado ao duplicar uma aba; reutilizar o mesmo id fazia dois usuários/tabs
    // ocuparem o mesmo assento da sala e sumirem um para o outro.
    const connId = crypto.randomUUID();
    try {
      const actor = channel?.staffPrivate
        ? base44.actors.PrivateStaffCallRoom(channel.code)
        : base44.actors.CallRoom(channel.code);
      this.room = actor.connect({ id: connId });
      this.room.subscribe((msg) => this.onMessage(msg));
    } catch (error) {
      this.joinError = "Não foi possível conectar à sala de voz.";
      this.emit();
      return;
    }
    await this.acquireMic();
    if (!this.room) return; // saiu durante a conexão
    this.room.send({
      type: "profile",
      name: this.profile.name,
      avatar: this.profile.avatar,
      frame: this.profile.frame,
      banner: this.profile.banner,
      user_id: this.profile.user_id,
      ticket_id: channel?.ticketCall ? channel.ticketId : undefined,
    });
    this.pushState();
  }

  leave() {
    const hadActiveCall = Boolean(this.room || this.connected || this.channel);
    if (hadActiveCall) playCallTone("leave");
    if (this.room) {
      try { this.room.close(); } catch { /* já fechada */ }
    }
    this.room = null;
    this.resetPeers();
    [this.micStream, this.camStream, this.screenStream].forEach((s) => {
      if (s) s.getTracks().forEach((t) => t.stop());
    });
    this.micStream = null;
    this.camStream = null;
    this.screenStream = null;
    this.channel = null;
    this.seat = null;
    this.roster = [];
    this.micOn = false;
    this.deafened = false;
    this.camOn = false;
    this.sharing = false;
    this.connected = false;
    this.coreOsJoined = false;
    this.coreOsMessages = [];
    this.joinError = null;
    this.rosterInitialized = false;
    this.emit();
  }

  getMicStream() {
    return this.micStream;
  }

  /* ---------- mensagens do servidor ---------- */

  onMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "you") {
      if (this.seat != null && this.seat !== msg.seat) this.resetPeers();
      this.seat = msg.seat;
      if (!this.connected) {
        this.connected = true;
        playCallTone("join");
        this.emit();
      }
    } else if (msg.type === "presence" || msg.type === "roster") {
      this.onRoster(msg.users || []);
    } else if (msg.type === "signal") {
      this.onSignal(msg.from, msg.data);
    } else if (msg.type === "core_os_state") {
      const nextJoined = Boolean(msg.joined);
      if (nextJoined && !this.coreOsJoined) playCallTone("join");
      if (!nextJoined && this.coreOsJoined) playCallTone("leave");
      this.coreOsJoined = nextJoined;
      this.emit();
    } else if (msg.type === "core_os_message" && typeof msg.text === "string") {
      const id = msg.id || crypto.randomUUID();
      const duplicate = this.coreOsMessages.some((item) => item.id === id || (item.text === msg.text && Math.abs(new Date(item.createdAt || 0).getTime() - new Date(msg.created_at || Date.now()).getTime()) < 3500));
      if (!duplicate) {
        this.coreOsMessages = [...this.coreOsMessages, {
          id,
          text: msg.text,
          source: msg.source || "Core OS",
          requestedBy: msg.requested_by || "Staff",
          createdAt: msg.created_at || new Date().toISOString(),
        }].slice(-40);
        this.emit();
      }
    } else if (msg.type === "room_error") {
      this.joinError = msg.message || "A sala não está disponível.";
      this.emit();
    }
  }

  onRoster(users) {
    const previousSeats = new Set(this.roster.map((user) => user.seat));
    const nextSeats = new Set(users.map((user) => user.seat));
    const newRemoteParticipant = this.rosterInitialized && users.some((user) => user.seat !== this.seat && !previousSeats.has(user.seat));
    const remoteParticipantLeft = this.rosterInitialized && this.roster.some((user) => user.seat !== this.seat && !nextSeats.has(user.seat));
    this.roster = users;
    if (newRemoteParticipant) playCallTone("join");
    if (remoteParticipantLeft) playCallTone("leave");
    this.rosterInitialized = true;
    if (this.seat == null) {
      this.emit();
      return;
    }
    for (const u of users) {
      if (u.seat === this.seat) continue;
      if (this.profile?.user_id && u.user_id === this.profile.user_id) continue;
      if (!this.peers.has(u.seat)) {
        this.ensurePeer(u.seat);
        // apenas o assento menor inicia a oferta — evita choque de ofertas
        if (this.seat < u.seat) this.makeOffer(u.seat);
      }
    }
    for (const seat of [...this.peers.keys()]) {
      if (!users.some((u) => u.seat === seat && !(this.profile?.user_id && u.user_id === this.profile.user_id))) {
        this.destroyPeer(seat);
      }
    }
    this.emit();
  }

  /* ---------- malha WebRTC ---------- */

  ensurePeer(seat) {
    if (this.peers.has(seat)) return this.peers.get(seat);
    const pc = new RTCPeerConnection(ICE);
    const peer = {
      pc,
      stream: new MediaStream(),
      audioSender: null,
      videoSender: null,
      remoteSet: false,
      pending: [],
      remoteGain: null,
      remoteAudioSources: new Map(),
      remoteMuted: false,
      uiMuted: false,
      volume: 1,
      healthTimer: null,
      lastInboundAudioBytes: null,
      staleInboundChecks: 0,
      lastRepairAt: 0,
    };
    this.peers.set(seat, peer);

    pc.onicecandidate = (e) => {
      if (e.candidate && this.room) {
        this.sendSignal(seat, { kind: "ice", candidate: e.candidate.toJSON() });
      }
    };
    pc.ontrack = (e) => {
      // Alguns navegadores disparam ontrack mais de uma vez para o mesmo track.
      // Mantemos uma única instância por id para evitar áudio duplicado/faseado.
      if (!peer.stream.getTracks().some((track) => track.id === e.track.id)) {
        peer.stream.addTrack(e.track);
      }

      // Áudio remoto é reproduzido também via Web Audio já desbloqueado pelo
      // clique de entrar/iniciar a call. Isso evita o autoplay assimétrico do
      // <audio>/<video>, que fazia principalmente o iniciador ficar sem ouvir.
      if (e.track.kind === "audio") this.attachRemoteAudio(peer, e.track);

      e.track.addEventListener("unmute", () => {
        if (e.track.kind === "audio") this.attachRemoteAudio(peer, e.track);
        this.emit();
      });
      e.track.addEventListener("ended", () => {
        try { peer.stream.removeTrack(e.track); } catch { /* já removida */ }
        if (e.track.kind === "audio") this.detachRemoteAudio(peer, e.track.id);
        this.emit();
      });
      this.emit();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        this.syncPeerTracks(peer).catch(() => {});
        this.startPeerHealthCheck(seat, peer);
      }
      this.emit();
    };
    pc.oniceconnectionstatechange = () => {
      this.emit();
      // Recupera automaticamente uma rota ICE quebrada. Apenas o menor assento
      // renegocia, mantendo a mesma regra usada na criação inicial da oferta.
      if ((pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") && this.seat < seat) {
        window.setTimeout(() => {
          if (!this.peers.has(seat)) return;
          if (pc.iceConnectionState !== "failed" && pc.iceConnectionState !== "disconnected") return;
          try { pc.restartIce(); } catch { /* navegador sem restartIce */ }
          this.makeOffer(seat, true);
        }, 1200);
      }
    };

    // Os transceivers são criados de forma preguiçosa em syncPeerTracks().
    // Isso é importante para quem RECEBE uma oferta: primeiro aplicamos o SDP
    // remoto, deixando o navegador criar/associar os m-lines corretos, e só
    // depois anexamos microfone/câmera aos senders existentes. Criar transceivers
    // locais antes de setRemoteDescription podia gerar m-lines extras e áudio
    // assimétrico (o segundo participante ouvia, mas não era ouvido).
    this.startPeerHealthCheck(seat, peer);
    return peer;
  }

  startPeerHealthCheck(seat, peer) {
    if (!peer || peer.healthTimer) return;
    peer.healthTimer = window.setInterval(async () => {
      if (!this.peers.has(seat) || peer.pc.connectionState === "closed") return;
      if (peer.pc.connectionState !== "connected") return;

      try {
        const stats = await peer.pc.getStats();
        let inboundAudioBytes = 0;
        let hasInboundAudio = false;
        stats.forEach((report) => {
          if (report.type === "inbound-rtp" && report.kind === "audio" && !report.isRemote) {
            hasInboundAudio = true;
            inboundAudioBytes += Number(report.bytesReceived || 0);
          }
        });

        const remoteState = this.roster.find((user) => user.seat === seat);
        const expectsAudio = remoteState?.micOn !== false;

        if (hasInboundAudio && expectsAudio) {
          if (peer.lastInboundAudioBytes != null && inboundAudioBytes <= peer.lastInboundAudioBytes) {
            peer.staleInboundChecks += 1;
          } else {
            peer.staleInboundChecks = 0;
          }
          peer.lastInboundAudioBytes = inboundAudioBytes;

          // Se a conexão parece "connected", mas o RTP de áudio para de chegar,
          // repara automaticamente sem exigir que o usuário saia da call.
          if (peer.staleInboundChecks >= 2 && Date.now() - peer.lastRepairAt > 10000) {
            peer.lastRepairAt = Date.now();
            peer.staleInboundChecks = 0;
            try { peer.pc.restartIce(); } catch { /* sem suporte */ }
            if (this.seat < seat) this.makeOffer(seat, true);
            else this.sendSignal(seat, { kind: "renegotiate" });
          }
        } else {
          peer.staleInboundChecks = 0;
          peer.lastInboundAudioBytes = inboundAudioBytes;
        }
      } catch {
        /* estatísticas são apenas mecanismo de auto-reparo */
      }
    }, 4000);
  }

  destroyPeer(seat) {
    const peer = this.peers.get(seat);
    if (!peer) return;
    if (peer.healthTimer) window.clearInterval(peer.healthTimer);
    for (const node of peer.remoteAudioSources?.values?.() || []) {
      try { node.source.disconnect(); } catch { /* já desconectado */ }
    }
    peer.remoteAudioSources?.clear?.();
    if (peer.remoteGain) {
      try { peer.remoteGain.disconnect(); } catch { /* já desconectado */ }
    }
    try { peer.pc.close(); } catch { /* já fechada */ }
    this.peers.delete(seat);
  }

  attachRemoteAudio(peer, track) {
    if (!peer || !track || track.kind !== "audio" || peer.remoteAudioSources.has(track.id)) return;
    const ctx = getCallAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    try {
      if (!peer.remoteGain) {
        peer.remoteGain = ctx.createGain();
        peer.remoteGain.gain.value = peer.remoteMuted ? 0 : (peer.volume ?? 1);
        peer.remoteGain.connect(ctx.destination);
      }
      const stream = new MediaStream([track]);
      const source = ctx.createMediaStreamSource(stream);
      source.connect(peer.remoteGain);
      peer.remoteAudioSources.set(track.id, { source, stream });
    } catch {
      /* Web Audio indisponível: o vídeo remoto continua como fallback visual */
    }
  }

  detachRemoteAudio(peer, trackId) {
    const node = peer?.remoteAudioSources?.get(trackId);
    if (!node) return;
    try { node.source.disconnect(); } catch { /* já desconectado */ }
    peer.remoteAudioSources.delete(trackId);
  }

  setPeerMuted(seat, muted) {
    const peer = this.peers.get(seat);
    if (!peer) return;
    peer.uiMuted = Boolean(muted);
    peer.remoteMuted = this.deafened || peer.uiMuted;
    if (peer.remoteGain) peer.remoteGain.gain.value = peer.remoteMuted ? 0 : (peer.volume ?? 1);
    if (!peer.remoteMuted) {
      const ctx = getCallAudioContext();
      if (ctx?.state === "suspended") ctx.resume().catch(() => {});
    }
  }

  setPeerVolume(seat, volume) {
    const peer = this.peers.get(seat);
    if (!peer) return;
    peer.volume = Math.max(0, Math.min(1, Number(volume) || 0));
    if (peer.remoteGain && !peer.remoteMuted) peer.remoteGain.gain.value = peer.volume;
    this.emit();
  }

  resetPeers() {
    for (const seat of [...this.peers.keys()]) this.destroyPeer(seat);
  }

  async syncPeerTracks(peer) {
    if (!peer) return;
    const pc = peer.pc;
    const audioTrack = this.micStream && this.micStream.getAudioTracks()[0];
    const videoTrack = this.activeVideoTrack();

    const transceivers = pc.getTransceivers();
    let audioTransceiver = transceivers.find((tr) =>
      tr.receiver?.track?.kind === "audio" || tr.sender?.track?.kind === "audio"
    );
    let videoTransceiver = transceivers.find((tr) =>
      tr.receiver?.track?.kind === "video" || tr.sender?.track?.kind === "video"
    );

    // Quem inicia a oferta ainda não possui m-lines remotos; cria os dois aqui.
    // Quem responde já terá os transceivers criados por setRemoteDescription().
    if (!audioTransceiver) audioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
    if (!videoTransceiver) videoTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });

    peer.audioSender = audioTransceiver.sender;
    peer.videoSender = videoTransceiver.sender;

    try { audioTransceiver.direction = "sendrecv"; } catch { /* navegador gerencia */ }
    try { videoTransceiver.direction = "sendrecv"; } catch { /* navegador gerencia */ }

    try { await peer.audioSender.replaceTrack(audioTrack || null); } catch { /* sender fechado */ }
    try { await peer.videoSender.replaceTrack(videoTrack || null); } catch { /* sender fechado */ }
    if (peer.videoSender) this.applyVideoParams(peer.videoSender);
  }

  async makeOffer(seat, iceRestart = false) {
    const peer = this.ensurePeer(seat);
    const pc = peer.pc;
    try {
      // Garante que o microfone já esteja efetivamente preso ao sender ANTES
      // de gerar o SDP. Isso elimina o caso de áudio em apenas uma direção.
      await this.syncPeerTracks(peer);
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      await pc.setLocalDescription(offer);
      this.sendSignal(seat, { kind: "offer", sdp: pc.localDescription });
    } catch { /* conexão mudou durante a negociação */ }
  }

  async onSignal(from, data) {
    if (from == null || from === this.seat || !data) return;
    const peer = this.ensurePeer(from);
    const pc = peer.pc;
    try {
      if (data.kind === "offer" && data.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        peer.remoteSet = true;
        for (const c of peer.pending) await pc.addIceCandidate(c).catch(() => {});
        peer.pending = [];
        // O lado que responde também precisa anexar o mic antes do createAnswer.
        await this.syncPeerTracks(peer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal(from, { kind: "answer", sdp: pc.localDescription });
      } else if (data.kind === "answer" && data.sdp) {
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          peer.remoteSet = true;
          for (const c of peer.pending) await pc.addIceCandidate(c).catch(() => {});
          peer.pending = [];
          // Reafirma o track após a resposta para contornar implementações
          // que deixam o sender inicialmente inativo quando entrou sem mídia.
          await this.syncPeerTracks(peer);
        }
      } else if (data.kind === "ice" && data.candidate) {
        const cand = new RTCIceCandidate(data.candidate);
        if (peer.remoteSet) await pc.addIceCandidate(cand).catch(() => {});
        else peer.pending.push(cand);
      } else if (data.kind === "renegotiate") {
        // Apenas um lado cria a oferta para não haver glare.
        if (this.seat < from) {
          try { pc.restartIce(); } catch { /* sem suporte */ }
          await this.makeOffer(from, true);
        }
      }
    } catch { /* sinal fora de ordem */ }
  }

  sendSignal(to, data) {
    if (this.room) this.room.send({ type: "signal", to, data });
  }

  setCoreOsJoined(joined) {
    if (!this.room || !this.channel?.staffPrivate) return false;
    const nextJoined = Boolean(joined);
    if (nextJoined && !this.coreOsJoined) playCallTone("join");
    if (!nextJoined && this.coreOsJoined) playCallTone("leave");
    this.coreOsJoined = nextJoined;
    this.emit();
    this.room.send({ type: nextJoined ? "core_os_join" : "core_os_leave" });
    return true;
  }

  sendCoreOsMessage(text) {
    const value = String(text || "").trim();
    if (!this.room || !this.channel?.staffPrivate || !value) return;
    const id = crypto.randomUUID();
    const payload = {
      type: "core_os_message",
      id,
      text: value.slice(0, 5000),
      source: "Core OS",
      requested_by: "Staff",
      created_at: new Date().toISOString(),
    };
    this.coreOsMessages = [...this.coreOsMessages, {
      id,
      text: payload.text,
      source: payload.source,
      requestedBy: payload.requested_by,
      createdAt: payload.created_at,
    }].slice(-40);
    this.emit();
    this.room.send(payload);
  }

  /* ---------- mídia local ---------- */

  activeVideoTrack() {
    const s = this.screenStream || this.camStream;
    return (s && s.getVideoTracks()[0]) || null;
  }

  pushMediaToPeers() {
    for (const peer of this.peers.values()) {
      this.syncPeerTracks(peer).catch(() => {});
    }
  }

  // Qualidade do vídeo enviado: transmissão de tela mantém a resolução
  // máxima (evita imagem tremida/desfocada), câmera usa balanceamento padrão.
  applyVideoParams(sender) {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      if (this.sharing) {
        const shareBitrates = { "720p": 2500000, "1080p": 6000000, "1440p": 10000000 };
        params.encodings[0].maxBitrate = shareBitrates[this.shareOptions.quality] || 6000000;
        params.encodings[0].maxFramerate = this.shareOptions.fps || 30;
        params.degradationPreference = "maintain-resolution";
      } else {
        params.encodings[0].maxBitrate = 1500000;
        params.encodings[0].maxFramerate = 30;
        params.degradationPreference = "balanced";
      }
      sender.setParameters(params).catch(() => {});
    } catch {
      /* navegador sem suporte aos parâmetros */
    }
  }

  async acquireMic() {
    try {
      const { deviceId, noise, echo, autoGain } = this.micOptions;
      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: echo,
          noiseSuppression: noise,
          autoGainControl: autoGain,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      if (this.micStream) this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = s;
      this.micOn = true;
      this.pushMediaToPeers();
    } catch {
      if (this.micStream) this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
      this.micOn = false;
    }
    this.emit();
  }

  async toggleMic() {
    if (!this.micStream) {
      await this.acquireMic();
      this.pushState();
      return;
    }
    this.micOn = !this.micOn;
    this.micStream.getAudioTracks().forEach((t) => (t.enabled = this.micOn));
    this.pushState();
    this.emit();
  }

  toggleDeafened() {
    this.deafened = !this.deafened;
    for (const peer of this.peers.values()) {
      peer.remoteMuted = this.deafened || Boolean(peer.uiMuted);
      if (peer.remoteGain) peer.remoteGain.gain.value = peer.remoteMuted ? 0 : (peer.volume ?? 1);
    }
    if (!this.deafened) {
      const ctx = getCallAudioContext();
      if (ctx?.state === "suspended") ctx.resume().catch(() => {});
    }
    this.pushState();
    this.emit();
    return this.deafened;
  }

  async toggleCam() {
    if (this.camOn) {
      if (this.camStream) this.camStream.getTracks().forEach((t) => t.stop());
      this.camStream = null;
      this.camOn = false;
    } else {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: this.camDeviceId ? { deviceId: { exact: this.camDeviceId } } : true,
        });
        this.camStream = s;
        this.camOn = true;
      } catch { return; }
    }
    this.pushMediaToPeers();
    this.pushState();
    this.emit();
  }

  setShareOptions(next = {}) {
    const quality = ["720p", "1080p", "1440p"].includes(next.quality) ? next.quality : this.shareOptions.quality;
    const fps = [15, 30, 60].includes(Number(next.fps)) ? Number(next.fps) : this.shareOptions.fps;
    this.shareOptions = { quality, fps };
    this.emit();
  }

  async toggleShare(options = null) {
    if (options) this.setShareOptions(options);
    if (this.sharing) {
      this.stopScreen();
      return;
    }
    try {
      const qualityMap = {
        "720p": { width: 1280, height: 720, bitrate: 2500000 },
        "1080p": { width: 1920, height: 1080, bitrate: 6000000 },
        "1440p": { width: 2560, height: 1440, bitrate: 10000000 },
      };
      const preset = qualityMap[this.shareOptions.quality] || qualityMap["1080p"];
      const fps = this.shareOptions.fps || 30;
      const s = await navigator.mediaDevices.getDisplayMedia({
        // Quando suportado, impede selecionar esta mesma aba e criar recursão visual.
        selfBrowserSurface: "exclude",
        preferCurrentTab: false,
        video: {
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: fps, max: fps },
        },
        audio: false,
      });
      this.screenStream = s;
      this.sharing = true;
      const track = s.getVideoTracks()[0];
      if (track) {
        // Nitidez da transmissão de tela: o navegador prioriza resolução
        track.contentHint = "detail";
        track.applyConstraints({
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: fps, max: fps },
        }).catch(() => {});
        track.addEventListener("ended", () => this.stopScreen());
      }
    } catch { return; }
    this.pushMediaToPeers();
    this.pushState();
    this.emit();
  }

  stopScreen() {
    if (this.screenStream) this.screenStream.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    this.sharing = false;
    this.pushMediaToPeers();
    this.pushState();
    this.emit();
  }

  setMicOptions({ deviceId, noise, echo, autoGain } = {}) {
    this.micOptions = {
      deviceId: deviceId || null,
      noise: noise !== undefined ? noise : this.micOptions.noise,
      echo: echo !== undefined ? echo : this.micOptions.echo,
      autoGain: autoGain !== undefined ? autoGain : this.micOptions.autoGain,
    };
    return this.acquireMic();
  }

  setCamDevice(id) {
    this.camDeviceId = id || null;
  }

  pushState() {
    if (this.room) {
      this.room.send({ type: "state", micOn: this.micOn, deafened: this.deafened, camOn: this.camOn, sharing: this.sharing });
    }
  }
}

export const callEngine = new CallEngine();
