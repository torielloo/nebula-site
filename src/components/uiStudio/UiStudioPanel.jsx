import React from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
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
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="scrollbar-thin fixed inset-x-0 bottom-0 z-50 max-h-[68vh] overflow-y-auto rounded-t-2xl border-t border-border/60 bg-background/90 backdrop-blur-2xl md:inset-x-auto md:bottom-0 md:right-0 md:top-12 md:max-h-none md:w-[340px] md:rounded-none md:border-l md:border-t-0"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <div className="min-w-0">
          <p className="font-heading text-sm font-bold">UI Studio</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {ui.saveState === "saving" ? t("common.saving") : ui.saveState === "saved" ? `${t("common.saved")} ✓` : meta ? meta.name : t("uistudio.theme_site")}
          </p>
        </div>
        {ui.selectedKey && (
          <button
            onClick={() => ui.setSelectedKey(null)}
            className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("common.back")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="p-4">
        {ui.selectedKey ? <ElementEditor elementKey={ui.selectedKey} /> : <ThemeEditor />}
      </div>
    </motion.aside>
  );
}