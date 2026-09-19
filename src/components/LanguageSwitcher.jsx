import React from "react";
import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Cápsula de seleção de idioma (PT / EN / ES) — troca a interface na hora. */
export default function LanguageSwitcher({ className }) {
  const { lang, setLang, langs } = useI18n();
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full border border-border/50 bg-secondary/50 p-1 backdrop-blur",
        className
      )}
    >
      <Languages className="ml-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {langs.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          title={l.label}
          aria-label={l.label}
          aria-pressed={lang === l.code}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors",
            lang === l.code
              ? "nebula-glow-sm bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}