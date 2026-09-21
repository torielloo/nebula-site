import React from "react";
import { motion } from "framer-motion";
import { ChevronLeft, RefreshCw, X } from "lucide-react";
import { useUiStudio } from "@/lib/uiStudio/UiStudioContext";
import { UI_ELEMENTS } from "@/lib/uiStudio/defaults";
import ElementEditor from "./ElementEditor";
import ThemeEditor from "./ThemeEditor";
import { useI18n } from "@/lib/i18n";

export default function UiStudioPanel() {
  const ui = useUiStudio();
  const { t } = useI18n();
  if (!ui.editMode) return null;
  const meta = ui.selectedKey ? UI_ELEMENTS[ui.selectedKey] : null;

  return (
    <motion.aside
      data-ui-studio-root
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="scrollbar-thin fixed inset-x-0 bottom-0 z-[80] max-h-[76dvh] overscroll-contain overflow-y-auto rounded-t-2xl border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-20px_60px_-30px_rgba(0,0,0,0.95)] backdrop-blur-2xl md:inset-x-auto md:bottom-0 md:right-0 md:top-16 md:max-h-none md:w-[360px] md:rounded-none md:border-l md:border-t-0 md:pb-0"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <div className="min-w-0">
          <p className="font-heading text-sm font-bold">UI Studio</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {ui.saveState === "saving"
              ? t("common.saving")
              : ui.saveState === "saved"
                ? `${t("common.saved")} ✓`
                : ui.saveState === "error"
                  ? "Alterações aplicadas"
                  : meta
                    ? meta.name
                    : t("uistudio.theme_site")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {ui.saveState === "error" && (
            <button
              onClick={ui.retrySave}
              className="grid h-8 w-8 place-items-center rounded-full text-red-300 transition-colors hover:bg-red-500/10"
              aria-label="Tentar salvar novamente"
              title="Tentar salvar novamente"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          {ui.selectedKey && (
            <button
              onClick={() => ui.setSelectedKey(null)}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t("common.back")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => {
              ui.setSelectedKey(null);
              ui.setEditMode(false);
            }}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("uistudio.close")}
            title={t("uistudio.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="p-4">
        {ui.selectedKey ? <ElementEditor elementKey={ui.selectedKey} /> : <ThemeEditor />}
      </div>
    </motion.aside>
  );
}