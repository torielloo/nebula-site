import { base44 } from "@/api/base44Client";

export const DISCORD_REDIRECT_URI =
  typeof window !== "undefined" && window.location?.origin
    ? `${window.location.origin}/discord-callback`
    : "https://preview--nebula-os-site-1.base44.app/discord-callback";
const FLOW_KEY = "nebula_discord_flow";
const FLOW_TTL_MS = 10 * 60 * 1000;

function rememberFlow(flow) {
  const raw = JSON.stringify(flow);
  try { sessionStorage.setItem(FLOW_KEY, raw); } catch {}
  // localStorage is shared with the OAuth popup after it returns to our origin.
  // The record is short-lived and contains no secret/token, only state + return path.
  try { localStorage.setItem(FLOW_KEY, raw); } catch {}
}

export function readDiscordFlow(expectedState = "") {
  const sources = [];
  try { sources.push(sessionStorage.getItem(FLOW_KEY)); } catch {}
  try { sources.push(localStorage.getItem(FLOW_KEY)); } catch {}

  for (const raw of sources) {
    if (!raw) continue;
    try {
      const flow = JSON.parse(raw);
      if (!flow || typeof flow !== "object") continue;
      if (expectedState && flow.state !== expectedState) continue;
      if (Date.now() - Number(flow.createdAt || 0) > FLOW_TTL_MS) continue;
      return flow;
    } catch {}
  }
  return null;
}

export function clearDiscordFlow() {
  try { sessionStorage.removeItem(FLOW_KEY); } catch {}
  try { localStorage.removeItem(FLOW_KEY); } catch {}
}

function popupFeatures() {
  const width = 560;
  const height = 780;
  const left = Math.max(0, Math.round((window.screenX || 0) + ((window.outerWidth || screen.width) - width) / 2));
  const top = Math.max(0, Math.round((window.screenY || 0) + ((window.outerHeight || screen.height) - height) / 2));
  return [
    "popup=yes",
    "resizable=yes",
    "scrollbars=yes",
    "toolbar=no",
    "menubar=no",
    "location=no",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
  ].join(",");
}

// Inicia o OAuth sem tirar o usuário da janela principal do Nébula.
// O popup é criado antes do await para não ser bloqueado pelo navegador/PWA.
// Se o ambiente bloquear popups, fazemos fallback para navegação normal.
export async function startDiscordLogin(returnTo = "/") {
  if (typeof window === "undefined") throw new Error("Login do Discord indisponível neste ambiente");

  const state = crypto.randomUUID();
  const redirectUri = `${window.location.origin}/discord-callback`;
  const flow = { state, returnTo, redirectUri, createdAt: Date.now() };
  rememberFlow(flow);

  let popup = null;
  try {
    popup = window.open("about:blank", "nebulaDiscordAuth", popupFeatures());
    if (popup && !popup.closed) {
      try {
        popup.document.title = "Nébula · Discord";
        popup.document.body.innerHTML =
          '<div style="font-family:system-ui;background:#050505;color:#fff;min-height:100vh;display:grid;place-items:center;margin:0"><div style="text-align:center"><div style="font-size:18px;font-weight:700">Nébula</div><div style="opacity:.65;margin-top:8px">Abrindo autenticação do Discord…</div></div></div>';
      } catch {}
    }
  } catch {}

  const onComplete = (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "NEBULA_DISCORD_AUTH_COMPLETE") return;
    window.removeEventListener("message", onComplete);
    clearDiscordFlow();
    const destination = typeof event.data.returnTo === "string" ? event.data.returnTo : returnTo;
    window.location.replace(destination || "/");
  };
  window.addEventListener("message", onComplete);

  try {
    const res = await base44.functions.invoke("discordAuth", {
      action: "start",
      redirect_uri: redirectUri,
      state,
    });
    const authorizeUrl = res?.data?.authorize_url || res?.authorize_url;
    if (typeof authorizeUrl !== "string" || !authorizeUrl.startsWith("https://discord.com/")) {
      throw new Error("Não foi possível iniciar a autorização do Discord");
    }

    if (popup && !popup.closed) {
      popup.location.replace(authorizeUrl);
      popup.focus();
      return;
    }

    window.removeEventListener("message", onComplete);
    window.location.assign(authorizeUrl);
  } catch (error) {
    window.removeEventListener("message", onComplete);
    try { if (popup && !popup.closed) popup.close(); } catch {}
    throw error;
  }
}
