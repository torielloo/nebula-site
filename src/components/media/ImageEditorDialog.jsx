import React, { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crop, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ASPECTS = [
  { label: "Livre", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
];

const SIZES = [
  { label: "Pequeno · 512px", value: 512 },
  { label: "Médio · 1024px", value: 1024 },
  { label: "Grande · 2048px", value: 2048 },
  { label: "Original", value: null },
];

const MIN_PX = 24;

function fullRect(img, aspect) {
  if (!aspect) return { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  let w = img.naturalWidth;
  let h = w / aspect;
  if (h > img.naturalHeight) {
    h = img.naturalHeight;
    w = h * aspect;
  }
  return {
    x: (img.naturalWidth - w) / 2,
    y: (img.naturalHeight - h) / 2,
    w,
    h,
  };
}

export default function ImageEditorDialog({
  file,
  open,
  onOpenChange,
  onConfirm,
  defaultAspect = null,
  title = "Editar imagem",
}) {
  const [img, setImg] = useState(null);
  const [aspect, setAspect] = useState(defaultAspect);
  const [size, setSize] = useState(null);
  const [rect, setRect] = useState(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    if (!file || !open) {
      setImg(null);
      setRect(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      setAspect(defaultAspect);
      setRect(fullRect(image, defaultAspect));
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, open, defaultAspect]);

  const startDrag = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, rect };
  };

  const onMove = (e) => {
    const d = drag.current;
    const el = boxRef.current;
    if (!d || !el || !img) return;
    const scale = img.naturalWidth / el.clientWidth;
    const dx = (e.clientX - d.startX) * scale;
    const dy = (e.clientY - d.startY) * scale;
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    if (d.mode === "move") {
      setRect({
        ...d.rect,
        x: Math.min(Math.max(0, d.rect.x + dx), W - d.rect.w),
        y: Math.min(Math.max(0, d.rect.y + dy), H - d.rect.h),
      });
    } else {
      let w = Math.min(Math.max(MIN_PX, d.rect.w + dx), W - d.rect.x);
      let h = Math.min(Math.max(MIN_PX, d.rect.h + dy), H - d.rect.y);
      if (aspect) {
        if (w / h < aspect) w = h * aspect;
        else h = w / aspect;
        if (w > W - d.rect.x) {
          w = W - d.rect.x;
          h = w / aspect;
        }
        if (h > H - d.rect.y) {
          h = H - d.rect.y;
          w = h * aspect;
        }
        if (w < MIN_PX || h < MIN_PX) {
          w = d.rect.w;
          h = d.rect.h;
        }
      }
      setRect({ ...d.rect, w, h });
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  const outSize = rect
    ? {
        w: Math.max(1, Math.round(rect.w * (size ? Math.min(1, size / Math.max(rect.w, rect.h)) : 1))),
        h: Math.max(1, Math.round(rect.h * (size ? Math.min(1, size / Math.max(rect.w, rect.h)) : 1))),
      }
    : null;

  const confirm = async () => {
    if (!img || !rect || !outSize) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = outSize.w;
      canvas.height = outSize.h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, outSize.w, outSize.h);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.92));
      const name = (file.name || "imagem").replace(/\.[^.]+$/, "");
      onConfirm(new File([blob], `${name}-editada.jpg`, { type: "image/jpeg" }));
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const boxStyle =
    img && rect
      ? {
          left: `${(rect.x / img.naturalWidth) * 100}%`,
          top: `${(rect.y / img.naturalHeight) * 100}%`,
          width: `${(rect.w / img.naturalWidth) * 100}%`,
          height: `${(rect.h / img.naturalHeight) * 100}%`,
        }
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/60 bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
        </DialogHeader>

        {img && rect ? (
          <>
            <div className="flex justify-center rounded-xl bg-[#0a0a0a] p-2">
              <div ref={boxRef} className="relative inline-block max-w-full touch-none">
                <img
                  src={img.src}
                  alt="Pré-visualização"
                  draggable={false}
                  className="pointer-events-none max-h-[42vh] max-w-full select-none rounded-md"
                />
                <div
                  className="absolute cursor-move touch-none rounded-sm border-2 border-primary"
                  style={{ ...boxStyle, boxShadow: "0 0 0 9999px hsl(var(--background) / 0.6)" }}
                  onPointerDown={(e) => startDrag(e, "move")}
                  onPointerMove={onMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <span
                    className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize touch-none rounded-full border-2 border-background bg-primary"
                    onPointerDown={(e) => startDrag(e, "resize")}
                    onPointerMove={onMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Formato</span>
              {ASPECTS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => {
                    setAspect(a.value);
                    setRect(fullRect(img, a.value));
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    aspect === a.value ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tamanho</span>
              {SIZES.map((s) => (
                <button
                  key={s.label}
                  onClick={() => setSize(s.value)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    size === s.value ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s.label}
                </button>
              ))}
              {outSize && (
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {outSize.w}×{outSize.h}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => img && setRect(fullRect(img, aspect))}
            disabled={!img}
            className="text-muted-foreground"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Recorte completo
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={confirm} disabled={busy || !rect} className="nebula-glow-sm">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crop className="mr-2 h-4 w-4" />}
              Aplicar e enviar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}