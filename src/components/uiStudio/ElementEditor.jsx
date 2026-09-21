import React from "react";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useUiStudio } from "@/lib/uiStudio/UiStudioContext";
import { UI_ELEMENTS } from "@/lib/uiStudio/defaults";
import { ColorField, MediaField, Row, TextField } from "./fields";

const sectionTitle = "font-heading text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground";

export default function ElementEditor({ elementKey }) {
  const ui = useUiStudio();
  const meta = UI_ELEMENTS[elementKey] || {};
  const el = ui.element(elementKey);
  const set = (patch) => ui.updateElement(elementKey, patch);
  const type = meta.type;

  return (
    <div className="space-y-6">
      <div>
        <p className={sectionTitle}>Elemento</p>
        <p className="mt-1 text-sm font-semibold">{meta.name || elementKey}</p>
      </div>

      <section className="space-y-4">
        <p className={sectionTitle}>Texto</p>
        {type === "nav" && <TextField label="Nome no menu" value={el.label} onChange={(v) => set({ label: v })} />}
        {type === "button" && <TextField label="Texto do botão" value={el.label} onChange={(v) => set({ label: v })} />}
        {type === "text" && (
          <TextField label="Conteúdo" value={el.text} onChange={(v) => set({ text: v })} textarea />
        )}
        {type === "card" && (
          <>
            <TextField label="Título" value={el.title} onChange={(v) => set({ title: v })} />
            <TextField label="Subtítulo" value={el.subtitle} onChange={(v) => set({ subtitle: v })} />
          </>
        )}
      </section>

      {(type === "button" || type === "text") && (
        <section className="space-y-4">
          <p className={sectionTitle}>Aparência</p>
          <ColorField label="Cor" value={el.color} onChange={(v) => set({ color: v })} />
          {type === "button" && (
            <>
              <Row label="Brilho">
                <Switch checked={el.glow !== false} onCheckedChange={(v) => set({ glow: v })} />
              </Row>
              <MediaField
                label="Imagem de fundo"
                accept="image/*"
                hint="Foto, GIF ou arte"
                value={el.image}
                onChange={(v) => set({ image: v })}
              />
            </>
          )}
        </section>
      )}

      {type === "card" && (
        <section className="space-y-4">
          <p className={sectionTitle}>Aparência</p>
          <MediaField
            label="Imagem de fundo do card"
            accept="image/*"
            hint="Foto, GIF ou arte"
            value={el.image}
            onChange={(v) => set({ image: v })}
          />
        </section>
      )}

      {(type === "nav" || type === "card") && (
        <section className="space-y-4">
          <p className={sectionTitle}>Posição</p>
          <Row label={type === "nav" ? "Ordem no menu" : "Ordem dos cards"}>
            <div className="flex gap-1.5">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => ui.moveElement(elementKey, -1)} aria-label="Mover para cima">
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => ui.moveElement(elementKey, 1)} aria-label="Mover para baixo">
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Row>
          <Row label="Visível">
            <Switch checked={!el.hidden} onCheckedChange={(v) => set({ hidden: !v })} />
          </Row>
        </section>
      )}

      <Button variant="outline" size="sm" className="w-full" onClick={() => ui.resetElement(elementKey)}>
        <RotateCcw className="h-3.5 w-3.5" /> Restaurar este elemento
      </Button>
    </div>
  );
}