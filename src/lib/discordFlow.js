import { base44, base44LatestFunctions } from "@/api/base44Client";
import { safeReturnTo } from "@/lib/authReturnTo";

export const DISCORD_REDIRECT_URI = "https://nebula-os-core-pingu.base44.app/discord-callback";
export const DISCORD_REDIRECT_ORIGIN = "https://nebula-os-core-pingu.base44.app";
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

function requestStatus(error) {
  return Number(error?.status || error?.response?.status || error?.response?.data?.status || 0);
}

export async function invokeDiscordAuth(payload) {
  let firstError = null;
  const attempts = [
    [base44, "discordAuth"],
    [base44LatestFunctions, "discordAuth"],
    [base44LatestFunctions, "discordOAuth"],
    [base44, "discordOAuth"],
  ];

  for (const [client, functionName] of attempts) {
    try {
      return await client.functions.invoke(functionName, payload);
    } catch (error) {
      firstError ||= error;
      const status = requestStatus(error);
      // 404/405 aqui é rota/versionamento de função. Tenta outra combinação
      // de versão/nome sem transformar um deploy parcial em falha de login.
      if (status && status !== 404 && status !== 405) throw error;
    }
  }

  const error = firstError || new Error("Serviço de autenticação do Discord indisponível.");
  if (!error.message || /status code 404/i.test(error.message)) {
    error.message = "O login do Discord está atualizando. Tente novamente em alguns segundos.";
  }
  throw error;
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
  const redirectUri = DISCORD_REDIRECT_URI;
  const flow = {
    state,
    returnTo,
    redirectUri,
    sourceOrigin: window.location.origin,
    createdAt: Date.now(),
  };
  rememberFlow(flow);

  // No aplicativo desktop, o OAuth acontece na própria janela principal.
  // Assim não existe popup/janelinha intermediária. No navegador comum,
  // preservamos o popup para não tirar o usuário da página.
  const embeddedDesktop = /Electron|NebulaOS-Desktop/i.test(String(navigator?.userAgent || ""));
  let popup = null;
  if (!embeddedDesktop) {
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
  }

  const cleanupMessageListeners = () => {
    window.removeEventListener("message", onComplete);
    window.removeEventListener("message", onFlowRequest);
  };

  const onFlowRequest = (event) => {
    if (event.data?.type !== "NEBULA_DISCORD_FLOW_REQUEST") return;
    if (event.data?.state !== state) return;
    if (popup && event.source !== popup) return;
    try {
      event.source?.postMessage(
        { type: "NEBULA_DISCORD_FLOW_RESPONSE", state, flow },
        event.origin
      );
    } catch {}
  };

  const onComplete = (event) => {
    const validOrigin =
      event.origin === DISCORD_REDIRECT_ORIGIN ||
      event.origin === window.location.origin;
    if (!validOrigin) return;
    if (event.data?.type !== "NEBULA_DISCORD_AUTH_COMPLETE") return;
    if (popup && event.source !== popup) return;
    cleanupMessageListeners();
    if (typeof event.data.access_token === "string" && event.data.access_token) {
      try { base44.auth.setToken(event.data.access_token); } catch {}
    }
    clearDiscordFlow();
    const destination = safeReturnTo(
      typeof event.data.returnTo === "string" ? event.data.returnTo : returnTo
    );
    window.location.replace(destination || "/");
  };
  window.addEventListener("message", onComplete);
  window.addEventListener("message", onFlowRequest);

  try {
    const res = await invokeDiscordAuth({
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

    cleanupMessageListeners();
    window.location.assign(authorizeUrl);
  } catch (error) {
    cleanupMessageListeners();
    try { if (popup && !popup.closed) popup.close(); } catch {}
    throw error;
  }
}
