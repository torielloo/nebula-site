import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, ImagePlus, Layers3, ScanLine, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const MAX_BYTES = 20 * 1024 * 1024;

function drawCover(ctx, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function NitroMediaStudio() {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [sourceName, setSourceName] = useState("");
  const [sourceSize, setSourceSize] = useState(0);
  const [isGif, setIsGif] = useState(false);
  const [glow, setGlow] = useState(true);
  const [scanlines, setScanlines] = useState(false);
  const [particles, setParticles] = useState(false);
  const [vignette, setVignette] = useState(true);
  const [safeZone, setSafeZone] = useState(true);
  const [quality, setQuality] = useState(84);
  const [error, setError] = useState("");

  const render = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 680;
    canvas.height = 240;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (glow) {
      ctx.filter = "saturate(1.14) contrast(1.04)";
      ctx.shadowColor = "rgba(88,101,242,.42)";
      ctx.shadowBlur = 18;
    }
    drawCover(ctx, image, canvas.width, canvas.height);
    ctx.restore();

    if (scanlines) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#000";
      for (let y = 0; y < canvas.height; y += 4) ctx.fillRect(0, y, canvas.width, 1);
      ctx.restore();
    }

    if (particles) {
      ctx.save();
      for (let i = 0; i < 46; i += 1) {
        const x = (i * 83) % canvas.width;
        const y = (i * 47) % canvas.height;
        const r = 0.7 + (i % 4) * 0.55;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${0.18 + (i % 5) * 0.08})`;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (vignette) {
      const gradient = ctx.createRadialGradient(340, 120, 30, 340, 120, 390);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, "rgba(0,0,0,.48)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (safeZone) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,.7)";
      ctx.fillStyle = "rgba(0,0,0,.2)";
      ctx.setLineDash([7, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(22, 18, 636, 204);
      ctx.fillRect(28, 142, 144, 70);
      ctx.strokeRect(28, 142, 144, 70);
      ctx.fillStyle = "rgba(255,255,255,.78)";
      ctx.font = "11px sans-serif";
      ctx.fillText("SAFE ZONE · avatar", 40, 164);
      ctx.fillText("evite texto importante", 40, 182);
      ctx.restore();
    }
  };

  useEffect(() => { render(); }, [glow, scanlines, particles, vignette, safeZone]);

  const chooseFile = (file) => {
    setError("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      setError("O editor aceita PNG, JPG, WEBP ou GIF.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      setError("A mídia deve ter no máximo 20 MB.");
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setSourceName(file.name);
      setSourceSize(file.size);
      setIsGif(file.type === "image/gif");
      render();
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      setError("Não foi possível abrir esta imagem.");
      URL.revokeObjectURL(url);
    };
    image.src = url;
  };

  const exportWebp = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current) {
      setError("Escolha uma imagem primeiro.");
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Falha ao otimizar a imagem.");
        return;
      }
      downloadBlob(blob, "nebula-banner-680x240.webp");
    }, "image/webp", quality / 100);
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current) {
      setError("Escolha uma imagem primeiro.");
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Falha ao exportar.");
        return;
      }
      downloadBlob(blob, "nebula-banner-680x240.png");
    }, "image/png");
  };

  const sizeLabel = useMemo(() => sourceSize ? `${(sourceSize / 1024 / 1024).toFixed(2)} MB` : "nenhum arquivo", [sourceSize]);

  return (
    <section id="media-studio" className="scroll-mt-24 overflow-hidden rounded-3xl border border-border/40 bg-card/35">
      <div className="border-b border-border/35 p-5 md:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <WandSparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">In-Browser Studio</p>
            <h2 className="mt-1 font-heading text-xl font-extrabold">Mini-editor de banners e mídia</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Prepare um banner em 680×240, aplique efeitos, visualize a safe zone e exporte PNG ou WEBP otimizado sem sair do navegador.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)] md:p-6">
        <div>
          <div className="overflow-hidden rounded-2xl border border-border/45 bg-black">
            <canvas ref={canvasRef} className="aspect-[17/6] h-auto w-full" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border/50 bg-background/40 px-4 text-xs font-bold hover:border-primary/40">
              <ImagePlus className="h-4 w-4" />
              Escolher mídia
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; chooseFile(f); }} />
            </label>
            <Button type="button" variant="outline" onClick={exportWebp}><Download className="mr-2 h-4 w-4" />WEBP otimizado</Button>
            <Button type="button" variant="outline" onClick={exportPng}><Download className="mr-2 h-4 w-4" />PNG</Button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {sourceName ? `${sourceName} · ${sizeLabel}` : "Escolha uma imagem para começar."}
            {isGif ? " · GIF detectado: o editor exporta o frame atual como PNG/WEBP; o arquivo animado original permanece intacto." : ""}
          </p>
          {error && <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-3 py-2 text-xs font-semibold text-red-300">{error}</p>}
        </div>

        <div className="space-y-3">
          {[
            [glow, setGlow, Sparkles, "Neon glow", "Saturação e brilho premium"],
            [scanlines, setScanlines, ScanLine, "Scanlines", "Efeito retrô discreto"],
            [particles, setParticles, Sparkles, "Partículas", "Pontos de luz no banner"],
            [vignette, setVignette, Layers3, "Vinheta", "Escurece suavemente as bordas"],
            [safeZone, setSafeZone, Layers3, "Safe Zone", "Mostra áreas cobertas pelo perfil"],
          ].map(([value, setter, Icon, title, desc]) => (
            <div key={title} className="flex items-center justify-between gap-3 rounded-2xl border border-border/40 bg-background/25 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-extrabold">{title}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{desc}</p>
                </div>
              </div>
              <Switch checked={value} onCheckedChange={setter} />
            </div>
          ))}

          <label className="block rounded-2xl border border-border/40 bg-background/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-extrabold">Qualidade WEBP</span>
              <span className="text-xs font-bold text-primary">{quality}%</span>
            </div>
            <input type="range" min="45" max="100" value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="mt-3 w-full accent-primary" />
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
              Menor qualidade reduz o arquivo. Para GIF animado, mantenha o original ou comprima em uma ferramenta dedicada antes de importar.
            </p>
          </label>
        </div>
      </div>
    </section>
  );
}
