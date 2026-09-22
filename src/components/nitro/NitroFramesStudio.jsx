import React from "react";
import { Check, Frame, Trash2 } from "lucide-react";
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

export default function NitroFramesStudio({ profile, active, saving, save, name }) {
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
              Escolha uma moldura animada pronta para usar no seu avatar.
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
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {NITRO_FRAMES.map((frame) => {
            const selected = (profile.frame || "") === frame.id && profile.frame !== "custom";
            return (
              <button
                key={frame.id || "none"}
                type="button"
                disabled={saving}
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
      )}
    </section>
  );
}
