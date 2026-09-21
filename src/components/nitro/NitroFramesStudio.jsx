import React, { useState } from "react";
import { Check, Frame, ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import ProfileAvatar from "@/components/ProfileAvatar";
import { cn } from "@/lib/utils";

export const NITRO_FRAMES = [
  { id: "", name: "Sem moldura", desc: "Visual limpo" },
  { id: "neon", name: "Neon", desc: "Glow da cor principal" },
  { id: "gold", name: "Gold", desc: "Dourado premium" },
  { id: "aurora", name: "Aurora", desc: "Ciano suave" },
  { id: "fire", name: "Fire", desc: "Laranja intenso" },
  { id: "galaxy", name: "Galaxy", desc: "Violeta profundo" },
  { id: "electric", name: "Electric", desc: "Azul elétrico" },
  { id: "diamond", name: "Diamond", desc: "Brilho cristalino" },
  { id: "plasma", name: "Plasma Spin", desc: "Anel animado violeta/ciano" },
  { id: "cosmos", name: "Cosmos", desc: "Profundidade roxa e estrelas" },
  { id: "inferno", name: "Inferno", desc: "Fogo animado vermelho/laranja" },
  { id: "void", name: "Void Pulse", desc: "Pulso escuro com brilho magenta" },
  { id: "prism", name: "Prism Flux", desc: "Ciclo RGB contínuo" },
  { id: "orbit", name: "Orbit", desc: "Arcos luminosos em rotação" },
];

const ALLOWED = new Set(["image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024;

export default function NitroFramesStudio({ profile, active, saving, save, name }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const uploadCustom = async (file) => {
    if (!active || !file || uploading) return;
    setError("");
    if (!ALLOWED.has(file.type)) {
      setError("A moldura personalizada deve ser PNG, WEBP ou GIF.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      setError("A moldura deve ter no máximo 8 MB.");
      return;
    }

    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file });
      if (!res?.file_url) throw new Error("O upload não retornou um arquivo válido.");
      const ok = await save({
        frame: "custom",
        custom_frame_url: res.file_url,
      });
      if (!ok) throw new Error("Não foi possível aplicar a moldura.");
    } catch (err) {
      setError(err?.message || "Falha ao importar a moldura.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border/35 bg-background/25 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Frame className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-extrabold">Molduras Nitro</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Escolha uma moldura animada pronta ou importe a sua própria arte transparente.
            </p>
          </div>
        </div>
        {(profile.frame || profile.custom_frame_url) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!active || saving}
            onClick={() => save({ frame: "", custom_frame_url: "" })}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Remover
          </Button>
        )}
      </div>

      {!active ? (
        <div className="mt-4 grid min-h-28 place-items-center rounded-xl border border-dashed border-border/45 bg-card/20 text-center text-xs text-muted-foreground">
          Recurso exclusivo para Nitro ativo.
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {NITRO_FRAMES.map((frame) => {
              const selected = (profile.frame || "") === frame.id && (frame.id !== "custom");
              return (
                <button
                  key={frame.id || "none"}
                  type="button"
                  disabled={saving || uploading}
                  onClick={() => save({ frame: frame.id, custom_frame_url: "" })}
                  className={cn(
                    "group rounded-2xl border p-3 text-left transition disabled:opacity-45",
                    selected ? "border-primary/55 bg-primary/[0.08]" : "border-border/35 bg-card/20 hover:border-border"
                  )}
                >
                  <ProfileAvatar
                    name={name}
                    avatar={profile.avatar_url}
                    size="lg"
                    frame={frame.id}
                    className="mx-auto transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="mt-3 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-[11px] font-extrabold", selected && "text-primary")}>{frame.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-[9px] leading-3 text-muted-foreground">{frame.desc}</p>
                    </div>
                    {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-primary/25 bg-primary/[0.035] p-4">
            <div className="flex flex-wrap items-center gap-4">
              <ProfileAvatar
                name={name}
                avatar={profile.avatar_url}
                size="lg"
                frame={profile.frame}
                customFrameUrl={profile.custom_frame_url}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-extrabold">Importar moldura personalizada</p>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  PNG/WEBP transparente ou GIF animado · máximo 8 MB. Use arte quadrada com o centro transparente para melhor resultado.
                </p>
                {profile.custom_frame_url && (
                  <p className="mt-2 text-[10px] font-bold text-emerald-300">Moldura personalizada aplicada ✓</p>
                )}
              </div>
              <label className={cn(
                "inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border/50 bg-background/50 px-4 text-xs font-bold transition hover:border-primary/40 hover:bg-primary/[0.05]",
                (uploading || saving) && "pointer-events-none opacity-50"
              )}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {uploading ? "Importando..." : "Escolher moldura"}
                <input
                  type="file"
                  accept="image/png,image/webp,image/gif"
                  className="hidden"
                  disabled={uploading || saving}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadCustom(file);
                  }}
                />
              </label>
            </div>
            {error && <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-3 py-2 text-xs font-semibold text-red-300">{error}</p>}
          </div>
        </>
      )}
    </section>
  );
}
