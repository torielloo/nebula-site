import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { callEngine } from "@/lib/callEngine";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const STORAGE_KEY = "nebula_call_devices";

function DeviceSelect({ label, devices, value, onChange, defaultLabel }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <Select value={value || "auto"} onValueChange={onChange}>
        <SelectTrigger className="mt-1.5 h-10 rounded-lg border border-white/10 bg-white/[0.04] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{defaultLabel}</SelectItem>
          {devices.map((d, i) => (
            <SelectItem key={d.deviceId || i} value={d.deviceId || `dev-${i}`}>
              {d.label || `${label} ${i + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function CallDevicesSection() {
  const { t } = useI18n();
  const [audio, setAudio] = useState([]);
  const [video, setVideo] = useState([]);
  const [speaker, setSpeaker] = useState([]);
  const [mic, setMic] = useState("auto");
  const [cam, setCam] = useState("auto");
  const [out, setOut] = useState("auto");
  const [noise, setNoise] = useState(true);
  const [echo, setEcho] = useState(true);
  const [autoGain, setAutoGain] = useState(true);
  const [previewOn, setPreviewOn] = useState(false);
  const [msg, setMsg] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const refreshDevices = () =>
    navigator.mediaDevices
      .enumerateDevices()
      .then((list) => {
        setAudio(list.filter((d) => d.kind === "audioinput"));
        setVideo(list.filter((d) => d.kind === "videoinput"));
        setSpeaker(list.filter((d) => d.kind === "audiooutput"));
      })
      .catch(() => {});

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved.mic) setMic(saved.mic);
      if (saved.cam) setCam(saved.cam);
      if (saved.out) setOut(saved.out);
      if (saved.noise !== undefined) setNoise(saved.noise);
      if (saved.echo !== undefined) setEcho(saved.echo);
      if (saved.autoGain !== undefined) setAutoGain(saved.autoGain);
    } catch {}
    refreshDevices();
    const md = navigator.mediaDevices;
    md.addEventListener?.("devicechange", refreshDevices);
    return () => {
      md.removeEventListener?.("devicechange", refreshDevices);
      stopPreview();
    };
  }, []);

  const stopPreview = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setPreviewOn(false);
  };

  const testDevices = async () => {
    stopPreview();
    setMsg("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: echo,
          noiseSuppression: noise,
          autoGainControl: autoGain,
          ...(mic !== "auto" ? { deviceId: { exact: mic } } : {}),
        },
        video: cam !== "auto" ? { deviceId: { exact: cam } } : true,
      });
      streamRef.current = s;
      setPreviewOn(true);
      if (videoRef.current) videoRef.current.srcObject = s;
      refreshDevices();
    } catch {
      setMsg(t("perfil.devices_error"));
    }
  };

  const saveDevices = async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mic, cam, out, noise, echo, autoGain }));
    await callEngine.setMicOptions({
      deviceId: mic !== "auto" ? mic : null,
      noise,
      echo,
      autoGain,
    });
    callEngine.setCamDevice(cam !== "auto" ? cam : null);
    setMsg(t("perfil.devices_saved"));
    setTimeout(() => setMsg(""), 2000);
  };

  const checkboxRow = (label, checked, set) => (
    <label className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2.5">
      <Checkbox checked={checked} onCheckedChange={(v) => set(!!v)} />
      <span className="text-xs font-semibold">{label}</span>
    </label>
  );

  return (
    <section className="rounded-2xl bg-white/[0.04] p-5 md:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">{t("perfil.devices_kicker")}</p>
      <h3 className="mt-1 font-heading text-base font-bold">{t("perfil.devices_title")}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("perfil.devices_hint")}</p>

      <div className="mt-4 grid aspect-video place-items-center overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={cn("h-full w-full object-cover", !previewOn && "hidden")}
        />
        {!previewOn && <span className="text-xs text-muted-foreground">{t("perfil.device_preview")}</span>}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <DeviceSelect label={t("perfil.mic")} devices={audio} value={mic} onChange={setMic} defaultLabel={t("perfil.system_default")} />
        <DeviceSelect label={t("perfil.cam")} devices={video} value={cam} onChange={setCam} defaultLabel={t("perfil.system_default")} />
        <DeviceSelect label={t("perfil.output")} devices={speaker} value={out} onChange={setOut} defaultLabel={t("perfil.system_default")} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {checkboxRow(t("perfil.noise"), noise, setNoise)}
        {checkboxRow(t("perfil.echo"), echo, setEcho)}
        {checkboxRow(t("perfil.autogain"), autoGain, setAutoGain)}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-10 rounded-lg" onClick={testDevices}>
          {t("perfil.test_devices")}
        </Button>
        <Button size="sm" className="h-10 rounded-lg px-5" onClick={saveDevices}>
          {t("perfil.save_devices")}
        </Button>
        {msg && <span className="text-xs font-semibold text-primary">{msg}</span>}
      </div>
    </section>
  );
}