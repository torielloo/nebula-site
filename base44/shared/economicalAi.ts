type ManagedAiOptions = {
  prompt: string;
  model?: string;
  responseJsonSchema?: any;
  maxOutputTokens?: number;
  temperature?: number;
};

export type ManagedAiResult = {
  output: any;
  provider: "base44_original" | "base44_original_user_fallback";
  fallback_used: boolean;
};

const AI_TIMEOUT_MS = 35_000;

function compactPrompt(value: unknown) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 24000);
}

function buildPayload(options: ManagedAiOptions) {
  const payload: any = {
    prompt: compactPrompt(options.prompt),
  };
  if (options.responseJsonSchema) payload.response_json_schema = options.responseJsonSchema;
  return payload;
}

function shouldTryUserFallback(error: any) {
  const message = String(error?.message || error?.error || error || '').toLowerCase();
  // Não refaz uma chamada potencialmente cobrada quando o problema é quota,
  // créditos, rate limit ou timeout. Nesses casos o chamador usa seu fallback local.
  return !/(credit|credits|quota|billing|payment|insufficient|exhausted|rate.?limit|\b429\b|timeout|timed.?out)/i.test(message);
}

async function withTimeout<T>(promise: Promise<T>, ms = AI_TIMEOUT_MS): Promise<T> {
  let timer: any;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('ai_timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function validateOutput(value: any) {
  if (value == null) throw new Error('ai_empty_output');
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) throw new Error('ai_empty_output');
    if (trimmed.length > 120_000) throw new Error('ai_oversized_output');
    return value;
  }
  if (typeof value === 'object') return value;
  throw new Error('ai_invalid_output');
}

async function callOriginalBase44(base44: any, options: ManagedAiOptions) {
  const payload = buildPayload(options);

  // Mantém o roteamento nativo da Base44. O timeout evita requests presos
  // bloqueando a UI; em timeout não fazemos retry para não duplicar custo/ações.
  if (base44?.asServiceRole?.integrations?.Core?.InvokeLLM) {
    return validateOutput(await withTimeout(base44.asServiceRole.integrations.Core.InvokeLLM(payload)));
  }
  return validateOutput(await withTimeout(base44.integrations.Core.InvokeLLM(payload)));
}

export async function runEconomicalAiDetailed(base44: any, options: ManagedAiOptions): Promise<ManagedAiResult> {
  try {
    return {
      output: await callOriginalBase44(base44, options),
      provider: "base44_original",
      fallback_used: false,
    };
  } catch (primaryError) {
    // Se o service-role estiver indisponível, tenta uma única vez o mesmo
    // InvokeLLM original no escopo da sessão. Continua sem escolher modelo manual.
    if (base44?.integrations?.Core?.InvokeLLM && shouldTryUserFallback(primaryError)) {
      console.error("[ai-runtime] Base44 original via service role falhou; tentando sessão uma única vez", primaryError);
      return {
        output: validateOutput(await withTimeout(base44.integrations.Core.InvokeLLM(buildPayload(options)))),
        provider: "base44_original_user_fallback",
        fallback_used: true,
      };
    }
    throw primaryError;
  }
}

export async function runEconomicalAi(base44: any, options: ManagedAiOptions) {
  return (await runEconomicalAiDetailed(base44, options)).output;
}

export function managedAiModelAvailable(_model: string) {
  // Valores antigos de configuração são aceitos e todos convergem para
  // o InvokeLLM original da Base44.
  return true;
}
