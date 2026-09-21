import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, Lock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const FRAMES = [
  { value: "", label: "Nenhuma" },
  { value: "neon", label: "Neon" },
  { value: "gold", label: "Ouro" },
  { value: "aurora", label: "Aurora" },
  { value: "fire", label: "Fire" },
  { value: "galaxy", label: "Galaxy" },
  { value: "electric", label: "Electric" },
  { value: "diamond", label: "Diamond" },
];

const inputCls =
  "h-10 rounded-lg border border-white/10 bg-white/[0.04] text-sm transition-colors placeholder:text-muted-foreground/60 focus-visible:border-white/25 focus-visible:ring-white/10";

const colorCls =
  "h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-white/[0.04] p-1.5";

export default function ProfileStyleSection({ profile, save, saving, nitroActive }) {
  const [tag, setTag] = useState(profile.custom_tag || "");
  const [accentDraft, setAccentDraft] = useState(profile.accent || "#ff0000");
  const [accent2Draft, setAccent2Draft] = useState(profile.accent_2 || "#a855f7");

  useEffect(() => {
    setAccentDraft(profile.accent || "#ff0000");
    setAccent2Draft(profile.accent_2 || "#a855f7");
  }, [profile.accent, profile.accent_2]);

  useEffect(() => {
    setTag(profile.custom_tag || "");
  }, [profile.custom_tag]);

  const commitColor = async (key, value) => {
    if (!nitroActive || saving) return;
    const current = key === "accent" ? (profile.accent || "#ff0000") : (profile.accent_2 || "#a855f7");
    if (value === current) return;
    await save({ [key]: value });
  };

  if (!nitroActive) {
    return (
      <div className="rounded-2xl bg-white/[0.03] p-4 md:p-5">
        <h3 className="font-heading text-sm font-bold">Estilo do perfil</h3>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <Lock className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Personalização exclusiva do Nébula Nitro</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Ative o Nitro para alterar cores, tag, tema e moldura do perfil.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/[0.03] p-4 md:p-5">
      <h3 className="font-heading text-sm font-bold">Estilo do perfil</h3>

      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Cor principal</label>
            <input
              type="color"
              value={accentDraft}
              onChange={(e) => setAccentDraft(e.target.value)}
              onBlur={() => commitColor("accent", accentDraft)}
              disabled={saving}
              className={cn(colorCls, "mt-1.5")}
            />
            <button
              onClick={() => {
                setAccentDraft("#ff0000");
                save({ accent: null });
              }}
              disabled={saving || !profile.accent}
              className="mt-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              Padrão do site
            </button>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Cor secundária</label>
            <input
              type="color"
              value={accent2Draft}
              onChange={(e) => setAccent2Draft(e.target.value)}
              onBlur={() => commitColor("accent_2", accent2Draft)}
              disabled={saving}
              className={cn(colorCls, "mt-1.5")}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Tag personalizada</label>
            <div className="mt-1.5 flex gap-2">
              <Input
                value={tag}
                onChange={(e) => setTag(e.target.value.replace(/\s+/g, " ").toUpperCase().slice(0, 16))}
                maxLength={16}
                placeholder="Ex.: FUNDADOR"
                className={inputCls}
              />
              <Button
                size="sm"
                className="h-10 shrink-0 rounded-lg px-4"
                onClick={() => save({ custom_tag: tag })}
                disabled={saving || tag.trim() === (profile.custom_tag || "")}
              >
                {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Salvar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-10 shrink-0 rounded-lg px-3"
                onClick={() => {
                  setTag("");
                  save({ custom_tag: "" });
                }}
                disabled={saving || !profile.custom_tag}
              >
                Limpar
              </Button>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Aparece no seu perfil público enquanto o Nitro estiver ativo.</span>
              <span>{tag.length}/16</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Tema</label>
            <Select value={profile.theme || "nebula"} onValueChange={(v) => save({ theme: v })}>
              <SelectTrigger className="mt-1.5 h-10 rounded-lg border border-white/10 bg-white/[0.04] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nebula">Nébula</SelectItem>
                <SelectItem value="nebula_nitro">Nébula Nitro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-xs font-extrabold uppercase tracking-[0.2em]">
            {(tag || "Membro").trim() || "Membro"} Nébula
          </span>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground">Moldura do avatar</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {FRAMES.map((f) => (
              <button
                key={f.label}
                onClick={() => save({ frame: f.value || null })}
                disabled={saving}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-semibold transition-all",
                  (profile.frame || "") === f.value
                    ? "bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.45)]"
                    : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}