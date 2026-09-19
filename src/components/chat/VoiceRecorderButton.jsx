import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

export default function VoiceRecorderButton({ disabled, onUploaded, onUploadingChange, compact = false }) {
  const { toast } = useToast();
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
  }, []);

  const cleanupRecorder = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setSeconds(0);
  };

  const start = async () => {
    if (disabled || uploading || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ description: "Seu navegador não suporta gravação de áudio aqui.", variant: "destructive" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const actualMime = recorder.mimeType || mimeType || "audio/webm";
        const chunks = chunksRef.current;
        cleanupRecorder();
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: actualMime });
        if (!blob.size) return;
        setUploading(true);
        onUploadingChange?.(true);
        try {
          const extension = actualMime.includes("ogg") ? "ogg" : "webm";
          const file = new File([blob], `audio-${Date.now()}.${extension}`, { type: actualMime });
          const upload = await base44.integrations.Core.UploadPrivateFile({ file });
          if (!upload?.file_uri) throw new Error("Upload sem file_uri");
          onUploaded?.({ type: "audio", url: upload.file_uri, name: file.name });
        } catch {
          toast({ description: "Não foi possível enviar o áudio.", variant: "destructive" });
        } finally {
          setUploading(false);
          onUploadingChange?.(false);
        }
      };
      recorder.start(250);
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      cleanupRecorder();
      toast({ description: "Permita o acesso ao microfone para gravar áudio.", variant: "destructive" });
    }
  };

  const stop = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  };

  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      disabled={disabled || uploading}
      title={recording ? "Parar e anexar áudio" : "Gravar áudio"}
      className={compact
        ? "flex h-8 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground disabled:opacity-40"
        : "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"}
    >
      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : recording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-3.5 w-3.5" />}
      {uploading ? "Enviando…" : recording ? label : "Áudio"}
    </button>
  );
}
