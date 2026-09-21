import React from "react";
import { Check, Palette, X } from "lucide-react";
import { useUiStudio } from "@/lib/uiStudio/UiStudioContext";
import { useI18n } from "@/lib/i18n";

export default function UiStudioBanner() {
  const ui = useUiStudio();
  const { t } = useI18n();
  if (!ui.editMode) return null;
  return (
    <div data-ui-studio-root className="pointer-events-none fixed inset-x-0 top-16 z-[90] flex justify-center px-3 sm:px-4">
      <div className="pointer-events-auto flex max-w-[min(92vw,720px)] items-center gap-3 rounded-full border border-white/10 bg-[#101010]/95 px-3 py-2 text-[11px] font-bold text-foreground shadow-[0_18px_50px_-24px_rgba(0,0,0,1)] backdrop-blur-2xl md:text-xs">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-black">
          <Palette className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate uppercase tracking-wider">{t("uistudio.banner")}</span>
        <button
          onClick={() => {
            if (ui.saveState === "error") {
              ui.retrySave();
              return;
            }
            ui.setEditMode(false);
          }}
          disabled={ui.saveState === "saving"}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white px-3 py-1.5 text-[11px] font-extrabold text-black transition-colors hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-70"
        >
          <Check className="h-3.5 w-3.5" />
          {ui.saveState === "saving" ? t("common.saving") : t("uistudio.save")}
        </button>
        <button
          onClick={() => {
            ui.setSelectedKey(null);
            ui.setEditMode(false);
          }}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          aria-label={t("uistudio.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}