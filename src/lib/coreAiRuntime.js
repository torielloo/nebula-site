import { base44 } from "@/api/base44Client";

export async function prepareCoreAiPlan() {
  // Compatibilidade com DMs antigas: no modo gerenciado econômico o backend
  // é o cérebro principal e nenhum modelo local pesado é carregado no navegador.
  return {
    localAiPlan: null,
    siteContext: null,
    agentProfile: null,
    personality: null,
  };
}

function runFrontendSafeFallback({ history, mode, context }) {
  const lastUser = [...(Array.isArray(history) ? history : [])]
    .reverse()
    .find((m) => m?.role === "user" && String(m?.content || "").trim());
  const message = String(lastUser?.content || "").trim().toLowerCase();
  const casual = /^(oi+|olá+|ola+|opa+|e+a+e+|eai+|fala+|salve+|hey+|hi+|hello+|bom dia|boa tarde|boa noite|valeu|obrigad[oa])[?!.,\s]*$/i.test(message);
  const persona = context === "security"
    ? "Core OS Segurança"
    : mode === "owner" ? "Core OS Owner" : "Core OS Staff";
  const reply = casual
    ? `${persona} online. Pode mandar o que você precisa.`
    : "A Core OS continua online, mas o endpoint operacional ficou indisponível nesta tentativa. Reenvie a mensagem em instantes; nenhuma ação foi executada nem houve uma segunda chamada paga de IA no navegador.";
  return Promise.resolve({
    reply,
    raw_reply: reply,
    actions: [],
    history_actions: [],
    client_actions: [],
    mode,
    model: "local_safe_fallback",
    ai_engine: "local_safe_fallback",
    ai_fallback: true,
    frontend_fallback: true,
    ai_context: null,
    agent_profile: null,
    personality: null,
    local_ai_plan: null,
  });
}

export async function runCoreAiTurn({
  history = [],
  mode = "staff",
  context = "general",
  pathname = "/",
  search = "",
}) {
  try {
    const response = await base44.functions.invoke("coreOsChatV2", {
      history: (Array.isArray(history) ? history : []).slice(-8),
      mode,
      context,
      page_context: { pathname, search },
    });

    const data = response.data || {};
    return {
      ...data,
      reply: String(data.reply || "").trim(),
      raw_reply: String(data.reply || "").trim(),
      ai_context: null,
      agent_profile: data.agent_profile || null,
      personality: data.personality || null,
      local_ai_plan: null,
    };
  } catch (backendError) {
    console.warn("[coreAiRuntime] backend indisponível; usando fallback local sem segunda cobrança de IA", backendError);
    return runFrontendSafeFallback({ history, mode, context });
  }
}
