import React, { useState } from "react";
import { RefreshCw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStudio } from "@/lib/uiStudio/UiStudioContext";
import { UI_BACKGROUNDS, UI_PRESETS } from "@/lib/uiStudio/defaults";
import { ColorField, MediaField } from "./fields";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const sectionTitle = "font-heading text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground";

export default function ThemeEditor() {
  const ui = useUiStudio();
  const { t } = useI18n();
  const [page, setPage] = useState(UI_BACKGROUNDS[0].key);
  const [accentHex, setAccentHex] = useState("#f5f5f5");

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">{t("uistudio.intro")}</p>

      <section className="space-y-3">
        <p className={sectionTitle}>{t("uistudio.ready_themes")}</p>
        {UI_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setAccentHex(p.id === "gamer" ? "#F5F5F5" : p.accent);
              ui.applyPreset(p);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border bg-card/40 p-3 text-left transition-colors hover:border-border hover:bg-card/70",
              ui.config.themePreset === p.id ? "border-primary/70 ring-1 ring-primary/25" : "border-border/60"
            )}
          >
            <span className="nebula-glow-sm h-8 w-8 shrink-0 rounded-full" style={{ backgroundColor: p.swatch }} />
            <span className="min-w-0">
              <span className="block text-sm font-bold">{p.name}</span>
              <span className="block text-[11px] text-muted-foreground">{p.desc || t("uistudio.intro")}</span>
            </span>
          </button>
        ))}
      </section>

      <section className="space-y-3">
        <p className={sectionTitle}>{t("uistudio.accent")}</p>
        <ColorField label={t("uistudio.site_color")} value={accentHex} onChange={setAccentHex} />
        <Button
          size="sm"
          className="w-full"
          onClick={() => {
            const hex = accentHex.trim();
            if (/^#[0-9a-f]{6}$/i.test(hex)) ui.applyPreset({ id: "custom", accent: hex, name: "Personalizado" });
          }}
        >
          {t("uistudio.apply_color")}
        </Button>
      </section>

      <section className="space-y-3">
        <p className={sectionTitle}>{t("uistudio.backgrounds")}</p>
        <div className="flex flex-wrap gap-1.5">
          {UI_BACKGROUNDS.map((b) => (
            <button
              key={b.key}
              onClick={() => setPage(b.key)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                page === b.key
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`uistudio.bg.${b.key}`)}
            </button>
          ))}
        </div>
        <MediaField
          label={t("uistudio.background_image")}
          accept="image/*"
          hint={t("uistudio.background_hint")}
          value={ui.config.backgrounds ? ui.config.backgrounds[page] : ""}
          onChange={(url) => ui.setBackground(page, url)}
        />
      </section>

      <section className="space-y-3">
        <p className={sectionTitle}>{t("uistudio.sounds")}</p>
        <MediaField
          label={t("uistudio.click_sound")}
          accept="audio/*"
          hint={t("uistudio.audio_hint")}
          value={ui.config.sounds ? ui.config.sounds.click : ""}
          onChange={ui.setClickSound}
        />
        {ui.config.sounds && ui.config.sounds.click && (
          <Button variant="secondary" size="sm" className="w-full" onClick={ui.playClick}>
            <Volume2 className="h-3.5 w-3.5" /> {t("uistudio.test_sound")}
          </Button>
        )}
      </section>

      <section className="space-y-3 border-t border-border/40 pt-4">
        <p className={sectionTitle}>{t("uistudio.restore")}</p>
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          disabled={ui.saveState === "saving"}
          onClick={async () => {
            const ok = await ui.resetAll();
            if (ok) {
              setAccentHex("#f5f5f5");
              setPage(UI_BACKGROUNDS[0].key);
            }
          }}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", ui.saveState === "saving" && "animate-spin")} />
          {ui.saveState === "saving" ? "Restaurando..." : t("uistudio.restore_all")}
        </Button>
      </section>
    </div>
  );
}