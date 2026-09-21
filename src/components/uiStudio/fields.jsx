import React, { useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import ImageEditorDialog from "@/components/media/ImageEditorDialog";

const fieldLabel = "text-[11px] font-bold uppercase tracking-wider text-muted-foreground";
const fieldInput =
  "mt-1.5 w-full rounded-lg border border-border/60 bg-transparent px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring";

export function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={fieldLabel}>{label}</span>
      {children}
    </div>
  );
}

export function TextField({ label, value, onChange, textarea }) {
  const Comp = textarea ? "textarea" : "input";
  return (
    <label className="block">
      <span className={fieldLabel}>{label}</span>
      <Comp
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={textarea ? 3 : undefined}
        className={fieldInput}
        placeholder="Padrão"
      />
    </label>
  );
}

function hexToRgb(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value || "").trim());
  if (!match) return { r: 245, g: 245, b: 245 };
  return {
    r: parseInt(match[1].slice(0, 2), 16),
    g: parseInt(match[1].slice(2, 4), 16),
    b: parseInt(match[1].slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (channel) => Math.max(0, Math.min(255, Number(channel) || 0)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function ColorField({ label, value, onChange }) {
  const [open, setOpen] = useState(true);
  const current = /^#[0-9a-f]{6}$/i.test(value || "") ? String(value).toUpperCase() : "#F5F5F5";
  const rgb = hexToRgb(current);
  const presets = ["#F5F5F5", "#FF263B", "#8FA3BF", "#8B5CF6", "#22C55E", "#38BDF8", "#F59E0B", "#EC4899"];
  const updateChannel = (key, next) => onChange(rgbToHex({ ...rgb, [key]: Number(next) }));

  return (
    <div className="block">
      <span className={fieldLabel}>{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((state) => !state)}
          className="h-8 w-10 shrink-0 rounded-md border border-border/60 p-0.5"
          aria-label={`${label}: abrir seletor de cor`}
          aria-expanded={open}
        >
          <span className="block h-full w-full rounded-[4px]" style={{ backgroundColor: current }} />
        </button>
        <input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#F5F5F5"
          className="h-8 flex-1 rounded-md border border-border/60 bg-transparent px-2 text-xs uppercase focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {open && (
        <div className="mt-2 space-y-3 rounded-xl border border-border/50 bg-card/55 p-3" onClick={(event) => event.stopPropagation()}>
          <div className="grid grid-cols-8 gap-1.5">
            {presets.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onChange(color)}
                className="h-6 rounded-md border border-white/10 transition-transform hover:scale-105"
                style={{ backgroundColor: color }}
                aria-label={`Usar ${color}`}
              />
            ))}
          </div>
          {[["r", "R"], ["g", "G"], ["b", "B"]].map(([key, channelLabel]) => (
            <label key={key} className="grid grid-cols-[14px_1fr_34px] items-center gap-2 text-[10px] font-bold text-muted-foreground">
              <span>{channelLabel}</span>
              <input
                type="range"
                min="0"
                max="255"
                value={rgb[key]}
                onChange={(event) => updateChannel(key, event.target.value)}
                className="w-full accent-primary"
              />
              <span className="text-right tabular-nums">{rgb[key]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function MediaField({ label, value, onChange, accept, hint }) {
  const [uploading, setUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [error, setError] = useState("");

  const upload = async (file) => {
    if (!file || uploading) return;
    setUploading(true);
    setError("");
    try {
      const maxBytes = file.type?.startsWith("audio/") ? 15 * 1024 * 1024 : 12 * 1024 * 1024;
      if (file.size <= 0 || file.size > maxBytes) throw new Error(`Arquivo muito grande. Máximo de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      const res = await base44.integrations.Core.UploadPublicFile({ file });
      if (!res?.file_url) throw new Error("O upload terminou sem retornar o arquivo.");
      onChange(res.file_url);
      setPendingImage(null);
    } catch (err) {
      setError(err?.message || "Não foi possível enviar o arquivo.");
    } finally {
      setUploading(false);
    }
  };

  const pick = (e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    input.value = "";
    setError("");
    if (!file) return;
    const wantsImage = !accept || accept.includes("image");
    if (file.type.startsWith("image/") && wantsImage) setPendingImage(file);
    else upload(file);
  };

  return (
    <div>
      <span className={fieldLabel}>{label}</span>
      {value ? (
        <div className="mt-1.5 flex items-center gap-2">
          {accept && accept.includes("image") && (
            <Image src={value} alt={label} className="h-12 w-16 rounded-md object-cover" />
          )}
          <Button variant="outline" size="sm" onClick={() => onChange("")}>
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </Button>
        </div>
      ) : (
        <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-3 text-xs text-muted-foreground transition-colors hover:border-border/40 hover:text-foreground">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {hint || "Enviar arquivo"}
          <input type="file" accept={accept} className="hidden" onChange={pick} disabled={uploading} />
        </label>
      )}
      {error && <p className="mt-2 text-[11px] font-semibold text-red-300">{error}</p>}
      <ImageEditorDialog
        file={pendingImage}
        open={!!pendingImage}
        onOpenChange={(o) => !o && setPendingImage(null)}
        onConfirm={upload}
      />
    </div>
  );
}