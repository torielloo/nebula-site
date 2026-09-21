import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Minus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCall } from "@/lib/CallContext";
import { useIsMobile } from "@/hooks/use-mobile";

const STORAGE_KEY = "nebula-ai-button-minimized";

export default function AiSupportButton() {
  const { t } = useI18n();
  const { channel } = useCall();
  const isMobile = useIsMobile();
  const [minimized, setMinimized] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, minimized ? "1" : "0");
    } catch {}
  }, [minimized]);

  if (isMobile && channel) return null;

  return (
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-3 z-40 md:bottom-6 md:right-6">
      <AnimatePresence initial={false} mode="popLayout">
        {minimized ? (
          <motion.button
            key="mini"
            type="button"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => setMinimized(false)}
            className="grid h-12 w-12 place-items-center rounded-full bg-primary/90 text-primary-foreground backdrop-blur-md nebula-glow"
            aria-label={t("aisupport.open")}
          >
            <Sparkles className="h-5 w-5" />
          </motion.button>
        ) : (
          <motion.div
            key="full"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-stretch overflow-hidden rounded-xl bg-primary/85 text-sm font-bold text-primary-foreground backdrop-blur-md nebula-glow-sm"
          >
            <Link to="/suporte-ia" className="flex items-center gap-2 py-3 pl-4 pr-2">
              <Sparkles className="h-4 w-4" />
              {t("aisupport.label")}
            </Link>
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="grid w-8 place-items-center opacity-70 transition-opacity hover:opacity-100"
              aria-label={t("aisupport.minimize")}
            >
              <Minus className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}