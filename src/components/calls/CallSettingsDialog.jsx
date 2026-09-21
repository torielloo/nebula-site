import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { callEngine } from "@/lib/callEngine";

/**
 * Modal de configurações da call. Cabeçalho fixo + corpo rolável para
 * caber tudo em qualquer tela, sem scrollbar horizontal (labels truncados).
 */
export default function CallSettingsDialog({
  open,
  onOpenChange,
  devices,
  sensitivity,
  onSensitivityChange,
  level,
  speaking,
  micOn,
}) {
  const [micId, setMicId] = useState("");
  const [camId, setCamId] = useState("");
  const [outputId, setOutputId] = useState("default");
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);

  const labelCls = "text-[11px] font-bold uppercase tracking-wide text-muted-foreground";
  const triggerCls = "mt-1.5 h-10 w-full border-border/60 bg-transparent text-xs";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[calc(100vw-2rem)] max-w-md flex-col gap-0 overflow-hidden border-border/60 p-0">
        <div className="shrink-0 border-b border-border/40 px-5 py-4">
          <DialogTitle className="font-heading text-base font-bold">Configurações de call</DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            Dispositivos, supressão de ruído e cancelamento de eco da Nébula Call.
          </DialogDescription>
        </div>

        <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <p className={labelCls}>Microfone</p>
            <Select
              value={micId || "default"}
              onValueChange={(v) => {
                setMicId(v === "default" ? "" : v);
                callEngine.setMicOptions({
                  deviceId: v === "default" ? undefined : v,
                  noise: noiseSuppression,
                  echo: echoCancellation,
                });
              }}
            >
              <SelectTrigger className={triggerCls}>
                <SelectValue className="truncate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Padrão do sistema</SelectItem>
                {devices.mics.map((d, i) => (
                  <SelectItem
                    key={d.deviceId || `mic-${i}`}
                    value={d.deviceId || `mic-${i}`}
                    className="max-w-[300px] truncate"
                  >
                    {d.label || "Microfone"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className={labelCls}>Saída de áudio</p>
            <Select value={outputId} onValueChange={setOutputId}>
              <SelectTrigger className={triggerCls}>
                <SelectValue className="truncate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Padrão do sistema</SelectItem>
                {devices.outputs.map((d, i) => (
                  <SelectItem
                    key={d.deviceId || `out-${i}`}
                    value={d.deviceId || `out-${i}`}
                    className="max-w-[300px] truncate"
                  >
                    {d.label || "Saída de áudio"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className={labelCls}>Câmera</p>
            <Select
              value={camId || "default"}
              onValueChange={(v) => {
                setCamId(v === "default" ? "" : v);
                callEngine.setCamDevice(v === "default" ? "" : v);
              }}
            >
              <SelectTrigger className={triggerCls}>
                <SelectValue className="truncate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Padrão do sistema</SelectItem>
                {devices.cams.map((d, i) => (
                  <SelectItem
                    key={d.deviceId || `cam-${i}`}
                    value={d.deviceId || `cam-${i}`}
                    className="max-w-[300px] truncate"
                  >
                    {d.label || "Câmera"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-secondary/40 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold">Supressor de ruído</p>
              <p className="text-[11px] text-muted-foreground">Teclado, ventilador e sons externos</p>
            </div>
            <Switch
              checked={noiseSuppression}
              onCheckedChange={(v) => {
                setNoiseSuppression(v);
                callEngine.setMicOptions({ noise: v });
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-secondary/40 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold">Cancelamento de eco</p>
              <p className="text-[11px] text-muted-foreground">Recomendado sem headset</p>
            </div>
            <Switch
              checked={echoCancellation}
              onCheckedChange={(v) => {
                setEchoCancellation(v);
                callEngine.setMicOptions({ echo: v });
              }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className={labelCls}>Sensibilidade da voz</p>
              <span className="text-xs font-bold text-primary">{sensitivity}</span>
            </div>
            <input
              type="range"
              min="4"
              max="40"
              value={sensitivity}
              onChange={(e) => onSensitivityChange(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </div>

          {micOn && (
            <div>
              <p className={labelCls}>Teste do microfone</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-100"
                  style={{ width: `${level}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {speaking ? "Detectando sua voz 🎤" : "Fale no microfone para testar."}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}