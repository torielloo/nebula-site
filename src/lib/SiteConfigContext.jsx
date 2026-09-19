import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";

const DEFAULT_SITE_CONFIG = {
  brand: {
    name: "NÉBULA OS",
    tagline: "SISTEMA CONECTADO",
    logo_url: "https://media.base44.com/images/public/6aa87196309472108abb65fb/8eaf849a6_NEBULAV2.png",
  },
  announcement: { enabled: false, text: "" },
  audio: {
    enabled: true,
    title: "Travis Scott Mix + Transitions · mxrked",
    bpm: 143.5546875,
    default_volume: 0.08,
  },
  nav: {},
  pages: [],
};

const SiteConfigContext = createContext({
  config: DEFAULT_SITE_CONFIG,
  loading: true,
  reload: async () => {},
});

const mergeConfig = (value) => ({
  ...DEFAULT_SITE_CONFIG,
  ...(value || {}),
  brand: { ...DEFAULT_SITE_CONFIG.brand, ...((value && value.brand) || {}) },
  announcement: { ...DEFAULT_SITE_CONFIG.announcement, ...((value && value.announcement) || {}) },
  audio: { ...DEFAULT_SITE_CONFIG.audio, ...((value && value.audio) || {}) },
  nav: { ...DEFAULT_SITE_CONFIG.nav, ...((value && value.nav) || {}) },
  pages: Array.isArray(value?.pages) ? value.pages : [],
});

export function SiteConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_SITE_CONFIG);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const rows = await base44.entities.SiteConfig.filter({ key: "global" }, "-updated_date", 1);
      setConfig(mergeConfig(rows?.[0]?.data));
    } catch {
      setConfig(DEFAULT_SITE_CONFIG);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const subscribe = base44.entities.SiteConfig?.subscribe;
    if (typeof subscribe !== "function") return;
    const unsub = subscribe((event) => {
      if (event?.data?.key === "global") reload();
    });
    return () => { if (typeof unsub === "function") unsub(); };
  }, [reload]);

  const value = useMemo(() => ({ config, loading, reload }), [config, loading, reload]);
  return <SiteConfigContext.Provider value={value}>{children}</SiteConfigContext.Provider>;
}

export function useSiteConfig() {
  return useContext(SiteConfigContext);
}
