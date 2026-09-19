import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { fetchNitroStatus } from "@/lib/nitro";
import { UI_DEFAULTS, UI_ELEMENTS, deepMerge } from "./defaults";

const Ctx = createContext(null);
export const useUiStudio = () => useContext(Ctx);

const orderOf = (key, cfg) => {
  const el = (cfg.elements || {})[key] || {};
  return el.order !== undefined ? el.order : (UI_ELEMENTS[key] ? UI_ELEMENTS[key].order : 0);
};

export default function UiStudioProvider({ children }) {
  const { user, checkUserAuth } = useAuth();
  const [nitroActive, setNitroActive] = useState(false);
  const [config, setConfig] = useState(UI_DEFAULTS);
  const [editMode, setEditMode] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const recordRef = useRef(null);
  const cfgRef = useRef(UI_DEFAULTS);
  const saveTimer = useRef(null);
  const audioRef = useRef(null);
  const presetQueueRef = useRef(Promise.resolve());

  // Carrega e mantém o status Nitro sincronizado em tempo real.
  // Assim o botão "Editar UI" aparece/desaparece sem exigir F5 após
  // aprovação, expiração ou qualquer alteração da assinatura.
  useEffect(() => {
    let alive = true;
    if (!user || !user.id) return undefined;

    const syncNitro = async () => {
      try {
        const st = await fetchNitroStatus(user.id);
        if (!alive) return;
        setNitroActive(Boolean(st.active));

        if (!st.active) {
          const defaults = JSON.parse(JSON.stringify(UI_DEFAULTS));
          cfgRef.current = defaults;
          setConfig(defaults);
          recordRef.current = null;
          if (st.reset) await checkUserAuth().catch(() => {});
          return;
        }

        const list = await base44.entities.UiSetting.list().catch(() => []);
        if (!alive) return;
        if (!list.length) {
          recordRef.current = null;
          return;
        }
        recordRef.current = list[0].id;
        const merged = deepMerge(UI_DEFAULTS, list[0].data || {});
        cfgRef.current = merged;
        setConfig(merged);
      } catch {}
    };

    syncNitro();

    const unsubscribe = base44.entities.NitroRequest.subscribe((event) => {
      const row = event?.data;
      if (!row || row.user_id !== user.id) return;
      syncNitro();
    });

    const onFocus = () => syncNitro();
    window.addEventListener("focus", onFocus);

    return () => {
      alive = false;
      unsubscribe?.();
      window.removeEventListener("focus", onFocus);
    };
  }, [user && user.id, checkUserAuth]);

  const persist = useCallback((next) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        if (recordRef.current) {
          await base44.entities.UiSetting.update(recordRef.current, { data: next });
        } else {
          const rec = await base44.entities.UiSetting.create({ data: next });
          recordRef.current = rec.id;
        }
        setSaveState("saved");
        setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1600);
      } catch {
        setSaveState("idle");
      }
    }, 600);
  }, []);

  const applyConfig = useCallback(
    (fn) => {
      const next = fn(cfgRef.current);
      cfgRef.current = next;
      setConfig(next);
      persist(next);
    },
    [persist]
  );

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

  const resetAll = useCallback(() => {
    applyConfig(() => JSON.parse(JSON.stringify(UI_DEFAULTS)));
    setSelectedKey(null);
  }, [applyConfig]);

  const applyPreset = useCallback(
    async (preset) => {
      if (!nitroActive || !preset || !preset.accent) return;
      const profile = (user && user.profile) || {};
      const presetId = preset.id || "custom";
      const isGamer = presetId === "gamer";

      // Presets são mutuamente exclusivos. Primeiro troca o preset localmente para
      // remover imediatamente qualquer classe/efeito do anterior (especialmente RGB),
      // depois sincroniza a cor de destaque correspondente ao preset escolhido.
      applyConfig((c) => ({
        ...c,
        themePreset: presetId,
      }));

      const nextAccent = isGamer ? "#f5f5f5" : preset.accent;
      // Serializa trocas rápidas de tema: uma resposta antiga nunca pode chegar
      // depois de uma nova seleção e restaurar a cor/preset anterior.
      presetQueueRef.current = presetQueueRef.current
        .catch(() => {})
        .then(async () => {
          await base44.auth.updateMe({
            profile: {
              ...profile,
              accent: nextAccent,
              accent_source: isGamer ? "preset:gamer" : (presetId === "custom" ? "custom" : `preset:${presetId}`),
            },
          });
          await checkUserAuth();
        });
      await presetQueueRef.current;
    },
    [nitroActive, user, checkUserAuth, applyConfig]
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

  // Modo edição: intercepta cliques em qualquer elemento marcado com data-ui-key
  useEffect(() => {
    if (!editMode) return;
    const handler = (e) => {
      const el = e.target.closest ? e.target.closest("[data-ui-key]") : null;
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        setSelectedKey(el.getAttribute("data-ui-key"));
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [editMode]);

  const element = useCallback((key) => ((config.elements || {})[key] || {}), [config]);

  const value = useMemo(
    () => ({
      nitroActive,
      editMode,
      setEditMode,
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
    }),
    [
      nitroActive, editMode, selectedKey, config, element, updateElement,
      resetElement, moveElement, setBackground, setClickSound, resetAll,
      applyPreset, playClick, saveState,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}