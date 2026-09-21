import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { fetchNitroStatus } from "@/lib/nitro";
import { UI_DEFAULTS, UI_ELEMENTS, deepMerge } from "./defaults";

const Ctx = createContext(null);
export const useUiStudio = () => useContext(Ctx);

const ENTITLEMENT_CACHE_KEY = "nebula:uistudio:entitlement";

function readCachedEntitlement(userId) {
  if (typeof window === "undefined" || !userId) return false;
  try {
    const raw = window.sessionStorage.getItem(ENTITLEMENT_CACHE_KEY);
    if (!raw) return false;
    const cached = JSON.parse(raw);
    if (cached?.userId !== userId) return false;
    const until = new Date(cached?.validUntil || 0).getTime();
    return cached?.active === true && Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function cacheEntitlement(userId, active, validUntil) {
  if (typeof window === "undefined" || !userId) return;
  try {
    if (!active || !validUntil) {
      window.sessionStorage.removeItem(ENTITLEMENT_CACHE_KEY);
      return;
    }
    window.sessionStorage.setItem(ENTITLEMENT_CACHE_KEY, JSON.stringify({ userId, active: true, validUntil }));
  } catch {}
}

const orderOf = (key, cfg) => {
  const el = (cfg.elements || {})[key] || {};
  return el.order !== undefined ? el.order : (UI_ELEMENTS[key] ? UI_ELEMENTS[key].order : 0);
};

export default function UiStudioProvider({ children }) {
  const { user, checkUserAuth } = useAuth();
  const [nitroActive, setNitroActive] = useState(false);
  const nitroActiveRef = useRef(false);
  const [nitroStatus, setNitroStatus] = useState("checking");
  const [config, setConfig] = useState(UI_DEFAULTS);
  const [editMode, setEditMode] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const recordRef = useRef(null);
  const configLoadedForRef = useRef("");
  const cfgRef = useRef(UI_DEFAULTS);
  const saveTimer = useRef(null);
  const saveIdleTimer = useRef(null);
  const audioRef = useRef(null);
  const presetQueueRef = useRef(Promise.resolve());
  const canEdit = nitroActive;

  const loadUiConfig = useCallback(async (userId) => {
    // Falha de rede não pode ser tratada como "não existe configuração",
    // senão um save logo depois pode criar registros duplicados.
    const list = await base44.entities.UiSetting.list("-updated_date", 20);
    if (!Array.isArray(list) || !list.length) {
      recordRef.current = null;
      configLoadedForRef.current = userId || "";
      return;
    }
    const current = list[0];
    recordRef.current = current.id;
    configLoadedForRef.current = userId || "";
    const merged = deepMerge(UI_DEFAULTS, current.data || {});
    cfgRef.current = merged;
    setConfig(merged);
  }, []);

  const syncNitro = useCallback(async ({ quiet = false } = {}) => {
    if (!user?.id) return false;
    if (!quiet) setNitroStatus("checking");

    try {
      // Usa a mesma resolução robusta da página Nitro: backend + histórico
      // aprovado. Assim um falso-negativo transitório nunca bloqueia o Studio
      // enquanto a assinatura ainda está válida.
      const state = await fetchNitroStatus(user.id);
      const active = state?.active === true;
      const validUntil = state?.validUntil?.toISOString?.() || "";
      const wasActive = nitroActiveRef.current;

      nitroActiveRef.current = active;
      setNitroActive(active);
      setNitroStatus("ready");
      cacheEntitlement(user.id, active, validUntil);

      if (state?.reset) await checkUserAuth().catch(() => {});

      if (active) {
        // Não recarrega a configuração em todo focus da janela. Isso evitava
        // sobrescrever mudanças locais quando o usuário voltava de um seletor
        // de arquivo ou alternava rapidamente de aba.
        if (configLoadedForRef.current !== user.id || (!wasActive && active)) {
          await loadUiConfig(user.id);
        }
      } else {
        const defaults = JSON.parse(JSON.stringify(UI_DEFAULTS));
        cfgRef.current = defaults;
        setConfig(defaults);
        recordRef.current = null;
        configLoadedForRef.current = "";
        setSelectedKey(null);
        setEditMode(false);
      }
      return active;
    } catch {
      // Falha transitória de rede/backend nunca derruba uma permissão que já
      // estava válida. Mantemos o último estado conhecido e tentamos de novo
      // ao focar a janela ou quando houver atualização de Nitro.
      setNitroStatus("error");
      return nitroActiveRef.current;
    }
  }, [user?.id, checkUserAuth, loadUiConfig]);

  // Carrega e mantém o status do editor sem piscar/bloquear durante refreshes.
  useEffect(() => {
    if (!user?.id) {
      nitroActiveRef.current = false;
      setNitroActive(false);
      setNitroStatus("checking");
      setEditMode(false);
      setSelectedKey(null);
      recordRef.current = null;
      configLoadedForRef.current = "";
      return undefined;
    }

    // Cache nunca concede acesso; o botão/Studio só aparecem depois da
    // confirmação autoritativa do backend.
    nitroActiveRef.current = false;
    setNitroActive(false);
    setNitroStatus("checking");

    void syncNitro({ quiet: false });

    const unsubscribe = base44.entities.NitroRequest.subscribe((event) => {
      const row = event?.data;
      if (!row || row.user_id !== user.id) return;
      void syncNitro({ quiet: true });
    });

    const onFocus = () => void syncNitro({ quiet: true });
    window.addEventListener("focus", onFocus);

    return () => {
      unsubscribe?.();
      window.removeEventListener("focus", onFocus);
    };
  }, [user?.id, loadUiConfig, syncNitro]);

  const openEditor = useCallback(async () => {
    if (nitroActive) {
      setSelectedKey(null);
      setEditMode(true);
      return true;
    }

    const active = await syncNitro();
    if (active) {
      setSelectedKey(null);
      setEditMode(true);
      return true;
    }
    return false;
  }, [nitroActive, syncNitro]);

  const persist = useCallback((next) => {
    clearTimeout(saveTimer.current);
    clearTimeout(saveIdleTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");

      let lastError = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const res = await base44.functions.invoke("saveNitroProfileStyle", { ui_config: next });
          const savedId = res?.data?.ui_setting_id || "";
          if (savedId) recordRef.current = savedId;
          setSaveState("saved");
          saveIdleTimer.current = setTimeout(
            () => setSaveState((state) => (state === "saved" ? "idle" : state)),
            1400
          );
          return;
        } catch (error) {
          lastError = error;
          const status = Number(error?.status || error?.response?.status || 0);
          if (status === 403 || status === 404) recordRef.current = null;
          if (status === 403) await syncNitro({ quiet: true }).catch(() => {});
          if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 220 * (attempt + 1)));
        }
      }

      // Nunca finge que salvou. O editor continua aberto e deixa claro que
      // houve falha, sem perder a configuração local da sessão.
      if (lastError) setSaveState("error");
    }, 350);
  }, [user?.id, syncNitro]);

  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    clearTimeout(saveIdleTimer.current);
  }, []);

  const applyConfig = useCallback(
    (fn) => {
      if (!canEdit) return;
      const next = fn(cfgRef.current);
      cfgRef.current = next;
      setConfig(next);
      persist(next);
    },
    [canEdit, persist]
  );

  const saveProfileStyle = useCallback(async (changes, uiConfig = null) => {
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await base44.functions.invoke("saveNitroProfileStyle", {
          ...(changes && Object.keys(changes).length ? { changes } : {}),
          ...(uiConfig ? { ui_config: uiConfig } : {}),
        });
      } catch (error) {
        lastError = error;
        const status = Number(error?.status || error?.response?.status || 0);
        const retryable = status === 403 || status === 404 || status === 409 || status >= 500 || status === 0;
        if (!retryable || attempt >= 3) throw error;
        await syncNitro({ quiet: true }).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
      }
    }
    throw lastError || new Error("Falha ao salvar personalização Nitro");
  }, [syncNitro]);

  const retrySave = useCallback(() => {
    if (!canEdit || saveState === "saving") return;
    persist(cfgRef.current);
  }, [canEdit, saveState, persist]);

  const updateElement = useCallback(
    (key, patch) =>
      applyConfig((c) => ({
        ...c,
        elements: { ...c.elements, [key]: { ...(c.elements[key] || {}), ...patch } },
      })),
    [applyConfig]
  );

  const resetElement = useCallback(
    (key) =>
      applyConfig((c) => {
        const els = { ...c.elements };
        delete els[key];
        return { ...c, elements: els };
      }),
    [applyConfig]
  );

  const moveElement = useCallback(
    (key, dir) => {
      const meta = UI_ELEMENTS[key];
      if (!meta || !meta.group) return;
      const siblings = Object.keys(UI_ELEMENTS)
        .filter((k) => UI_ELEMENTS[k].group === meta.group)
        .sort((a, b) => orderOf(a, cfgRef.current) - orderOf(b, cfgRef.current));
      const i = siblings.indexOf(key);
      const j = i + dir;
      if (j < 0 || j >= siblings.length) return;
      const a = orderOf(siblings[i], cfgRef.current);
      const b = orderOf(siblings[j], cfgRef.current);
      updateElement(siblings[i], { order: b });
      updateElement(siblings[j], { order: a });
    },
    [updateElement]
  );

  const setBackground = useCallback(
    (page, url) => applyConfig((c) => ({ ...c, backgrounds: { ...c.backgrounds, [page]: url } })),
    [applyConfig]
  );

  const setClickSound = useCallback(
    (url) => applyConfig((c) => ({ ...c, sounds: { ...c.sounds, click: url } })),
    [applyConfig]
  );

  const resetAll = useCallback(async () => {
    if (!canEdit || !user?.id || saveState === "saving") return false;
    const defaults = JSON.parse(JSON.stringify(UI_DEFAULTS));
    setSaveState("saving");

    try {
      // "Restaurar todo meu Nébula" precisa limpar as duas fontes de
      // personalização: o perfil Nitro (cores/tema/moldura/tag/fundo/sons)
      // e o documento do UI Studio (HUD, fundos por página, ordem etc.).
      const res = await saveProfileStyle({
        accent: "",
        accent_2: "",
        accent_source: "",
        background_url: "",
        frame: "",
        custom_tag: "",
        theme: "nebula",
        sounds: { notify: true, call: true },
      }, defaults);
      const savedId = res?.data?.ui_setting_id || "";
      if (savedId) recordRef.current = savedId;

      cfgRef.current = defaults;
      setConfig(defaults);
      setSelectedKey(null);
      setEditMode(false);
      await checkUserAuth().catch(() => {});

      setSaveState("saved");
      clearTimeout(saveIdleTimer.current);
      saveIdleTimer.current = setTimeout(
        () => setSaveState((state) => (state === "saved" ? "idle" : state)),
        1400
      );
      return true;
    } catch {
      setSaveState("error");
      return false;
    }
  }, [canEdit, user?.id, saveState, checkUserAuth, saveProfileStyle]);

  const applyPreset = useCallback(
    async (preset) => {
      if (!canEdit || !preset || !preset.accent) return false;
      const presetId = preset.id || "custom";
      const isGamer = presetId === "gamer";
      const nextAccent = isGamer ? "#f5f5f5" : preset.accent;
      const nextSecondary = preset.secondary || "";

      // Serializa trocas rápidas para a resposta de um clique antigo nunca
      // sobrescrever a escolha mais recente.
      presetQueueRef.current = presetQueueRef.current
        .catch(() => {})
        .then(async () => {
          setSaveState("saving");
          try {
            await saveProfileStyle({
              accent: nextAccent,
              ...(nextSecondary ? { accent_2: nextSecondary } : {}),
              accent_source: isGamer ? "preset:gamer" : (presetId === "custom" ? "custom" : `preset:${presetId}`),
            });
            applyConfig((c) => ({ ...c, themePreset: presetId }));
            await checkUserAuth().catch(() => {});
            return true;
          } catch {
            setSaveState("error");
            return false;
          }
        });
      return presetQueueRef.current;
    },
    [canEdit, checkUserAuth, applyConfig, saveProfileStyle]
  );

  const playClick = useCallback(() => {
    const url = cfgRef.current.sounds && cfgRef.current.sounds.click;
    if (!url) return;
    try {
      audioRef.current = audioRef.current || new Audio();
      audioRef.current.src = url;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } catch {}
  }, []);

  // Modo edição: intercepta somente elementos editáveis da página. Controles
  // do próprio UI Studio nunca são capturados pelo seletor global.
  useEffect(() => {
    if (!editMode || !canEdit) return undefined;

    const handler = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest("[data-ui-studio-root]")) return;
      const el = target.closest("[data-ui-key]");
      if (!el) return;
      event.preventDefault();
      event.stopPropagation();
      setSelectedKey(el.getAttribute("data-ui-key"));
    };
    const keyHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedKey(null);
        setEditMode(false);
      }
    };

    document.addEventListener("click", handler, true);
    window.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("click", handler, true);
      window.removeEventListener("keydown", keyHandler);
    };
  }, [editMode, canEdit]);

  const element = useCallback((key) => ((config.elements || {})[key] || {}), [config]);

  const value = useMemo(
    () => ({
      nitroActive,
      nitroStatus,
      canEdit,
      editMode,
      setEditMode,
      openEditor,
      refreshEntitlement: syncNitro,
      selectedKey,
      setSelectedKey,
      config,
      element,
      updateElement,
      resetElement,
      moveElement,
      setBackground,
      setClickSound,
      resetAll,
      applyPreset,
      playClick,
      saveState,
      retrySave,
    }),
    [
      nitroActive, nitroStatus, canEdit, editMode, openEditor, syncNitro, selectedKey, config, element, updateElement,
      resetElement, moveElement, setBackground, setClickSound, resetAll,
      applyPreset, playClick, saveState, retrySave,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}