export const UI_DEFAULTS = {
  backgrounds: {},
  sounds: { click: "" },
  elements: {},
  themePreset: null,
};

export const UI_ELEMENTS = {
  "nav.home": { name: "Menu — Início", type: "nav", group: "nav", order: 0 },
  "nav.solucoes": { name: "Menu — Soluções", type: "nav", group: "nav", order: 1 },
  "nav.tickets": { name: "Menu — Tickets", type: "nav", group: "nav", order: 2 },
  "nav.calls": { name: "Menu — Calls", type: "nav", group: "nav", order: 3 },
  "nav.mensagens": { name: "Menu — Mensagens", type: "nav", group: "nav", order: 4 },
  "home.hero.title": { name: "Banner — Título", type: "text" },
  "home.hero.subtitle": { name: "Banner — Descrição", type: "text" },
  "home.badge.status": { name: "Card Início — Badge de status", type: "text" },
  "home.cta.solucoes": { name: "Botão — Explorar soluções", type: "button" },
  "home.cta.calls": { name: "Botão — Entrar em call", type: "button" },
  "home.group.0": { name: "Card — Atendimento", type: "card", group: "homeGroup", order: 0 },
  "home.group.1": { name: "Card — Tempo Real", type: "card", group: "homeGroup", order: 1 },
  "home.group.2": { name: "Card — Conteúdo", type: "card", group: "homeGroup", order: 2 },
  "home.group.3": { name: "Card — Sua Conta", type: "card", group: "homeGroup", order: 3 },
};

export const UI_BACKGROUNDS = [
  { key: "home", label: "Início" },
  { key: "calls", label: "Calls" },
  { key: "perfil", label: "Perfil" },
];

export const UI_PRESETS = [
  { id: "cyber-red", name: "Cyber Red", accent: "#ff263b", secondary: "#7f1d1d", swatch: "#ff263b", desc: "Preto, vermelho neon e brilho." },
  { id: "minimal-ios", name: "Minimal iOS", accent: "#8fa3bf", secondary: "#dbeafe", swatch: "#8fa3bf", desc: "Vidro, limpo e suave." },
  { id: "gamer", name: "Gamer RGB", accent: "#8b5cf6", secondary: "#06b6d4", swatch: "#8b5cf6", desc: "Tipografia e ícones em RGB dinâmico, suave e contínuo." },
  { id: "deep-midnight", name: "Deep Midnight", accent: "#6366f1", secondary: "#111827", swatch: "#20244a", desc: "Azul profundo com contraste premium." },
  { id: "discord-blurple", name: "Blurple", accent: "#5865f2", secondary: "#eb459e", swatch: "#5865f2", desc: "Visual inspirado no blurple moderno." },
  { id: "emerald-matrix", name: "Emerald Matrix", accent: "#10b981", secondary: "#052e16", swatch: "#10b981", desc: "Verde esmeralda, preto e brilho digital." },
  { id: "cyberpunk-neon", name: "Cyberpunk Neon", accent: "#22d3ee", secondary: "#eb459e", swatch: "#eb459e", desc: "Magenta elétrico com atmosfera cyberpunk." },
];

export function deepMerge(base, over) {
  if (!over || typeof over !== "object") return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over)) {
    const b = base ? base[k] : undefined;
    const o = over[k];
    out[k] =
      o && typeof o === "object" && !Array.isArray(o) && b && typeof b === "object" && !Array.isArray(b)
        ? deepMerge(b, o)
        : o;
  }
  return out;
}

export function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}