import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import pt from "./pt";
import en from "./en";
import es from "./es";

/**
 * Sistema de idiomas do Nébula OS (PT / EN / ES).
 * - A escolha fica salva no navegador (localStorage) e detecta o idioma
 *   do sistema na primeira visita.
 * - t("chave") NUNCA quebra: se faltar tradução, cai para o português;
 *   se faltar no português, mostra a própria chave.
 * - t("chave", { nome: valor }) substitui marcadores {nome} no texto.
 */
const DICTS = { pt, en, es };

export const LANGS = [
  { code: "pt", short: "PT", label: "Português" },
  { code: "en", short: "EN", label: "English" },
  { code: "es", short: "ES", label: "Español" },
];

const LOCALES = { pt: "pt-BR", en: "en-US", es: "es-ES" };
const STORAGE_KEY = "nebula_lang";

function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICTS[saved]) return saved;
  } catch {
    /* localStorage indisponível */
  }
  const nav = (typeof navigator !== "undefined" && navigator.language) || "pt";
  const lang = nav.toLowerCase();
  if (lang.startsWith("es")) return "es";
  if (lang.startsWith("en")) return "en";
  return "pt";
}

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(detectLang);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = LOCALES[lang];
  }, [lang]);

  const value = useMemo(() => {
    const dict = DICTS[lang] || pt;
    const t = (key, vars) => {
      const raw = dict[key] !== undefined ? dict[key] : pt[key] !== undefined ? pt[key] : key;
      if (!vars) return raw;
      return Object.keys(vars).reduce(
        (acc, k) => acc.split(`{${k}}`).join(String(vars[k])),
        raw
      );
    };
    return { lang, setLang, t, locale: LOCALES[lang], langs: LANGS };
  }, [lang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LangContext);
  // Fora do provider: usa português sem quebrar nada
  if (!ctx) {
    const t = (key, vars) => {
      const raw = pt[key] !== undefined ? pt[key] : key;
      if (!vars) return raw;
      return Object.keys(vars).reduce((acc, k) => acc.split(`{${k}}`).join(String(vars[k])), raw);
    };
    return { lang: "pt", setLang: () => {}, t, locale: "pt-BR", langs: LANGS };
  }
  return ctx;
}