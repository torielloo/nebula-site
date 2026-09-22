import React, { useEffect, useState } from "react";
import { Check, MousePointer2, Palette, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PALETTES = [
  { id: "cyberpunk", name: "Cyberpunk Neon", a: "#22D3EE", b: "#EC4899", desc: "Ciano elétrico + magenta" },
  { id: "midnight", name: "Deep Midnight", a: "#6366F1", b: "#111827", desc: "Índigo profundo + preto azulado" },
  { id: "blurple", name: "Discord Blurple", a: "#5865F2", b: "#EB459E", desc: "Blurple + rosa neon" },
  { id: "matrix", name: "Emerald Matrix", a: "#10B981", b: "#052E16", desc: "Verde esmeralda + verde escuro" },
  { id: "nebula", name: "Nébula Pulse", a: "#8B5CF6", b: "#06B6D4", desc: "Violeta + ciano" },
];

const CURSORS = [
  ["none", "Sem efeito"],
  ["spark", "Faíscas"],
  ["nebula", "Nébula"],
  ["prism", "Prism RGB"],
];

export default function NitroThemeBuilder({ profile, active, saving, save }) {
  const [primary, setPrimary] = useState(profile.accent || "#8B5CF6");
  const [secondary, setSecondary] = useState(profile.accent_2 || "#06B6D4");
  const [cursor, setCursor] = useState(profile.cursor_effect || "none");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (profile.accent) setPrimary(profile.accent);
    if (profile.accent_2) setSecondary(profile.accent_2);
    setCursor(profile.cursor_effect || "none");
  }, [profile.accent, profile.accent_2, profile.cursor_effect]);

  const applyPalette = async (palette) => {
    setPrimary(palette.a);
    setSecondary(palette.b);
    setMessage("");
    const ok = await save({
      accent: palette.a,
      accent_2: palette.b,
      accent_source: `nitro-builder:${palette.id}`,
      theme: "nebula_nitro",
    });
    setMessage(ok ? `${palette.name} aplicado.` : "Não foi possível aplicar o tema.");
  };

  const applyCustom = async () => {
    setMessage("");
    const ok = await save({
      accent: primary,
      accent_2: secondary,
      accent_source: "nitro-builder:custom",
      theme: "nebula_nitro",
      cursor_effect: cursor,
    });
    setMessage(ok ? "Tema personalizado aplicado." : "Não foi possível aplicar.");
  };

  const applyCursor = async (next) => {
    setCursor(next);
    setMessage("");
    const ok = await save({ cursor_effect: next });
    setMessage(ok ? "Efeito do cursor atualizado." : "Não foi possível atualizar o cursor.");
  };

  return (
    <section id="theme-builder" className="scroll-mt-24 overflow-hidden rounded-3xl border border-border/40 bg-card/35">
      <div className="border-b border-border/35 p-5 md:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Theme Builder</p>
            <h2 className="mt-1 font-heading text-xl font-extrabold">Personalize o visual do seu Nébula</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Aplique paletas prontas ou crie a sua própria combinação para a interface e os elementos visuais. A cor do nome do perfil não é alterada.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PALETTES.map((palette) => {
            const selected = profile.accent?.toLowerCase() === palette.a.toLowerCase() && profile.accent_2?.toLowerCase() === palette.b.toLowerCase();
            return (
              <button
                key={palette.id}
                type="button"
                disabled={!active || saving}
                onClick={() => void applyPalette(palette)}
                className={cn(
                  "rounded-2xl border p-3 text-left transition disabled:opacity-45",
                  selected ? "border-primary/55 bg-primary/[0.08]" : "border-border/40 bg-background/25 hover:border-border"
                )}
              >
                <div className="h-14 rounded-xl border border-white/10" style={{ background: `linear-gradient(135deg, ${palette.a}, ${palette.b})` }} />
                <div className="mt-3 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-extrabold">{palette.name}</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{palette.desc}</p>
                  </div>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_.9fr]">
          <div className="rounded-2xl border border-border/40 bg-background/25 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-extrabold">Paleta personalizada</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="rounded-xl border border-border/40 bg-card/25 p-3">
                <span className="text-[11px] font-bold text-muted-foreground">Primary</span>
                <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} disabled={!active || saving} className="mt-2 h-11 w-full rounded-lg border border-border/40 bg-transparent p-1" />
              </label>
              <label className="rounded-xl border border-border/40 bg-card/25 p-3">
                <span className="text-[11px] font-bold text-muted-foreground">Accent</span>
                <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} disabled={!active || saving} className="mt-2 h-11 w-full rounded-lg border border-border/40 bg-transparent p-1" />
              </label>
            </div>
            <div className="mt-3 h-14 rounded-xl border border-white/10" style={{ background: `linear-gradient(100deg, ${primary}, ${secondary})` }} />
            <Button type="button" className="mt-3 w-full" disabled={!active || saving} onClick={() => void applyCustom()}>
              Aplicar tema personalizado
            </Button>
          </div>

          <div className="rounded-2xl border border-border/40 bg-background/25 p-4">
            <div className="flex items-center gap-2">
              <MousePointer2 className="h-4 w-4 text-primary" />
              <p className="text-sm font-extrabold">Efeito do cursor</p>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Efeito visual leve aplicado somente à sua experiência logada.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {CURSORS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  disabled={!active || saving}
                  onClick={() => void applyCursor(id)}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left text-xs font-bold transition disabled:opacity-45",
                    cursor === id ? "border-primary/50 bg-primary/10 text-primary" : "border-border/40 bg-card/20 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {message && <p className="mt-4 rounded-xl border border-border/40 bg-secondary/30 px-3 py-2 text-xs font-semibold">{message}</p>}
      </div>
    </section>
  );
}
