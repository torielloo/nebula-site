import { secrets } from 'base44:runtime';
import { getOwnerTrustState } from './ownerTrust.ts';
import { managedAiModelAvailable, runEconomicalAi } from './economicalAi.ts';

const TRUSTED_ORIGINS = new Set([
  'https://nebula-os-core-pingu.bubbly-alder-3685.chatgpt.site',
  'https://nebula-os-core-pingu.base44.app',
  'https://nebula-os-site-1.base44.app',
  'https://preview--nebula-os-core-pingu.base44.app',
  'https://preview--nebula-os-site-1.base44.app',
  'https://preview-sandbox--6aa87196309472108abb65fb.base44.app',
  'https://app.base44.com',
]);

function isTrustedOrigin(origin: string) {
  if (!origin) return true;
  if (TRUSTED_ORIGINS.has(origin)) return true;

  // URLs publicadas pelo próprio Base44 podem mudar de slug sem que o app
  // mude de projeto. Antes, cada troca de URL quebrava OAuth e as funções
  // protegidas por ficar presa a uma lista de slugs antigos.
  if (/^https:\/\/[a-z0-9-]+\.base44\.app$/i.test(origin)) return true;
  if (/^https:\/\/(?:preview|preview-sandbox)--[a-z0-9-]+\.base44\.app$/i.test(origin)) return true;

  return /^https:\/\/(?:preview|preview-sandbox)--(?:nebula-os-core-pingu|nebula-os-site-1|6aa87196309472108abb65fb)\.base44\.app$/i.test(origin);
}

const buckets = new Map<string, { count: number; resetAt: number }>();
const burstBuckets = new Map<string, { count: number; resetAt: number }>();
const globalBuckets = new Map<string, { count: number; resetAt: number }>();
const userGlobalBuckets = new Map<string, { count: number; resetAt: number }>();
let lastBucketCleanup = 0;

function cleanupExpiredBuckets(now: number) {
  if (now - lastBucketCleanup < 60_000) return;
  lastBucketCleanup = now;
  for (const map of [buckets, burstBuckets, globalBuckets, userGlobalBuckets]) {
    for (const [key, value] of map.entries()) {
      if (value.resetAt <= now) map.delete(key);
    }
  }
}
const OWNER_QUARANTINE_BLOCKED_ROUTES = new Set([
  'coreOsChat','coreOsChatV2','coreOsAudit','securityReport','securitySystem','manageReport',
  'manageUserRole','manageVerification','nitroAdmin','staffCallAssistant'
]);
const PRIVILEGED_OPERATION_ROLES = new Set(['owner','dev','admin','moderator','support','staff']);
const encoder = new TextEncoder();
// Never fall back to a public hard-coded key. If deployment secrets are
// temporarily unavailable, use a per-runtime key so request processing keeps
// working without exposing a forgeable/predictable security HMAC key.
const EPHEMERAL_SECURITY_SECRET = crypto.randomUUID();

function securityLogSecret() {
  return secrets.get('SECURITY_LOG_SECRET') || secrets.get('DISCORD_CLIENT_SECRET') || EPHEMERAL_SECURITY_SECRET;
}

export class SecurityError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 403, code = 'security_blocked') {
    super(message);
    this.name = 'SecurityError';
    this.status = status;
    this.code = code;
  }
}

function clientIp(req: Request) {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  ).slice(0, 80);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac256(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function requestSecurityIdentity(req: Request) {
  const secret = securityLogSecret();
  const ipHash = await sha256(`${secret}:${clientIp(req)}`);
  const userAgent = (req.headers.get('user-agent') || 'unknown').slice(0, 240);
  const fingerprint = await sha256(`${ipHash}:${userAgent}`);
  const requestId = req.headers.get('cf-ray') || req.headers.get('x-request-id') || crypto.randomUUID();
  return { ipHash, userAgent, fingerprint, requestId };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

function inspectValue(value: unknown, strict: boolean, depth = 0): string | null {
  if (depth > 8) return 'estrutura_excessivamente_profunda';
  if (typeof value === 'string') {
    if (value.includes('\0')) return 'byte_nulo';
    const lower = value.toLowerCase();
    if (/<\s*script\b|javascript\s*:|data\s*:\s*text\/html|on(?:error|load)\s*=/.test(lower)) return 'script_injetado';
    if (/__proto__|constructor\s*\.\s*prototype|prototype\s*\[/.test(lower)) return 'prototype_pollution';
    if (strict && /(?:\.\.\/){2,}|(?:union\s+select|drop\s+table|sleep\s*\()|(?:;|&&|\|\|)\s*(?:rm|curl|wget|bash|sh|powershell)\b/i.test(value)) {
      return 'payload_de_exploracao';
    }
    return null;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) return 'array_excessivo';
    for (const item of value) {
      const reason = inspectValue(item, strict, depth + 1);
      if (reason) return reason;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 80) return 'objeto_excessivo';
    for (const [key, item] of entries) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) return 'chave_perigosa';
      const reason = inspectValue(item, strict, depth + 1);
      if (reason) return reason;
    }
  }
  return null;
}

function defaultAssessment(event: Record<string, any>) {
  const severity = String(event.severity || 'medium');
  const category = String(event.category || 'security');
  const scoreBase: Record<string, number> = { low: 20, medium: 45, high: 72, critical: 92 };
  let risk = scoreBase[severity] || 45;
  if (['malicious_payload', 'scanner_probe'].includes(category)) risk = Math.min(100, risk + 6);
  if (category === 'clone_or_csrf' && event.reason === 'origem_nao_autorizada' && event.user_id && /^https:\/\/[a-z0-9-]+\.base44\.app$/i.test(String(event.origin || ''))) risk = Math.min(risk, 45);
  if (category === 'rate_limit') risk = Math.max(55, risk);
  const summary = `Tentativa bloqueada em ${event.route || 'rota protegida'} (${category}), motivo: ${event.reason || 'comportamento suspeito'}.`;
  let recommendation = 'Revisar o evento e o histórico antes de aplicar uma medida persistente.';
  if (risk >= 90) recommendation = 'Prioridade máxima: revisar o evento e considerar bloqueio temporário do fingerprint; se houver conta autenticada e evidência suficiente, considerar banimento.';
  else if (risk >= 70) recommendation = 'Revisar o histórico do fingerprint e considerar bloqueio temporário se houver repetição ou evidência adicional.';
  else if (risk >= 50) recommendation = 'Monitorar recorrência e confirmar se não houve falso positivo antes de bloquear.';
  return { risk_score: risk, ai_summary: summary, ai_recommendation: recommendation };
}

async function buildIncidentAssessment(base44: any, event: Record<string, any>) {
  const fallback = defaultAssessment(event);
  // Eventos high usam a avaliação determinística; o modelo fica reservado para critical.
  // Isso reduz bastante o consumo em rajadas sem perder o alerta nem a revisão humana.
  if (String(event.severity || '') !== 'critical') return fallback;
  try {
    const prompt = [
      'Você é a Core Security AI do Nébula OS. Analise SOMENTE os metadados de segurança fornecidos.',
      'Não invente identidade, localização, intenção ou dados pessoais. Não conclua que houve invasão bem-sucedida sem evidência.',
      'Retorne JSON puro com risk_score (0-100), summary (até 260 caracteres) e recommendation (até 360 caracteres).',
      `severity=${String(event.severity || '').slice(0, 20)}`,
      `category=${String(event.category || '').slice(0, 80)}`,
      `route=${String(event.route || '').slice(0, 100)}`,
      `reason=${String(event.reason || '').slice(0, 120)}`,
      `action=${String(event.action || '').slice(0, 20)}`,
    ].join('\n');
    const config = (await base44.asServiceRole.entities.CoreOsConfig.list().catch(() => []))[0] || null;
    const configuredModelRaw = String(config?.model || 'gpt_5_6_sol');
    const configuredModel = configuredModelRaw === 'gpt_5_5' ? 'gpt_5_6_sol' : configuredModelRaw;
    if (!managedAiModelAvailable(configuredModel)) return fallback;
    const result: any = await runEconomicalAi(base44, {
      prompt,
      model: configuredModel,
      responseJsonSchema: {
        type: 'object',
        properties: {
          risk_score: { type: 'number' },
          summary: { type: 'string' },
          recommendation: { type: 'string' },
        },
        required: ['risk_score', 'summary', 'recommendation'],
      },
      maxOutputTokens: 320,
      temperature: 0.12,
    });
    const raw = typeof result === 'string' ? result.trim() : JSON.stringify(result || {});
    const parsed = typeof result === 'object' && result && !Array.isArray(result) ? result : JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
    const score = Math.max(0, Math.min(100, Number(parsed.risk_score) || fallback.risk_score));
    return {
      risk_score: score,
      ai_summary: String(parsed.summary || parsed.ai_summary || fallback.ai_summary).slice(0, 500),
      ai_recommendation: String(parsed.recommendation || parsed.ai_recommendation || fallback.ai_recommendation).slice(0, 700),
    };
  } catch {
    return fallback;
  }
}

async function notifyOwners(base44: any, eventRecord: any, event: Record<string, any>, assessment: any) {
  if (String(event.category || '') === 'prompt_injection') return false;
  const authenticatedBase44OriginMismatch =
    String(event.category || '') === 'clone_or_csrf' &&
    String(event.reason || '') === 'origem_nao_autorizada' &&
    Boolean(event.user_id) &&
    /^https:\/\/[a-z0-9-]+\.base44\.app$/i.test(String(event.origin || ''));
  if (authenticatedBase44OriginMismatch) return false;
  if (!['high', 'critical'].includes(String(event.severity || ''))) return false;
  try {
    const owners = await base44.asServiceRole.entities.User.filter({ role: 'owner' }, '-created_date', 50).catch(() => []);
    const audienceIds = (owners || []).map((owner: any) => owner.id).filter(Boolean);
    if (!audienceIds.length) return false;
    const bucket = Math.floor(Date.now() / 300_000);
    const dedupeKey = `security:${event.category || 'event'}:${String(event.request_fingerprint || 'unknown').slice(0, 20)}:${bucket}`;
    const existing = await base44.asServiceRole.entities.CoreOsNotification.filter({ dedupe_key: dedupeKey }, '-created_date', 1).catch(() => []);
    if (existing?.length) return false;
    const level = event.severity === 'critical' ? 'critical' : 'warning';
    const body = [
      assessment.ai_summary,
      `Risco estimado: ${assessment.risk_score}/100.`,
      `Recomendação: ${assessment.ai_recommendation}`,
      'Abra o Centro de Segurança para revisar e escolher: bloquear, banir, definir mensagem ou ignorar.',
    ].filter(Boolean).join(' ');
    await base44.asServiceRole.entities.CoreOsNotification.create({
      title: `Core Security AI · ${event.severity === 'critical' ? 'incidente crítico' : 'tentativa suspeita'}`,
      body: body.slice(0, 1800),
      severity: level,
      category: 'security',
      audience_ids: audienceIds,
      dedupe_key: dedupeKey,
      source: `security:${event.event_id || eventRecord?.event_id || ''}`,
      action_url: `/painel?view=owner&tab=seguranca&event=${encodeURIComponent(event.event_id || eventRecord?.event_id || '')}`,
      read_by: [],
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (eventRecord?.id) await base44.asServiceRole.entities.SecurityEvent.update(eventRecord.id, { notification_sent: true }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function autoEscalateFingerprint(base44: any, event: Record<string, any>) {
  const fingerprint = String(event.request_fingerprint || '');
  if (!fingerprint) return;
  const category = String(event.category || '');
  if (!['malicious_payload', 'scanner_probe'].includes(category)) return;

  try {
    if (event.user_id) {
      const users = await base44.asServiceRole.entities.User.filter({ id: String(event.user_id) }, '-created_date', 1).catch(() => []);
      const role = String(users?.[0]?.role || '');
      if (['owner','dev','admin','moderator','support','staff'].includes(role)) return;
    }
    const recent = await base44.asServiceRole.entities.SecurityEvent
      .filter({ request_fingerprint: fingerprint }, '-occurred_at', 20)
      .catch(() => []);
    const cutoff = Date.now() - 10 * 60 * 1000;
    const hostile = (recent || []).filter((item: any) => {
      const at = new Date(item.occurred_at || item.created_date || 0).getTime();
      return at >= cutoff
        && item.action === 'blocked'
        && ['malicious_payload', 'scanner_probe'].includes(String(item.category || ''));
    });
    const criticalCount = hostile.filter((item: any) => item.severity === 'critical').length;
    if (hostile.length < 4 && criticalCount < 3) return;

    const existing = await base44.asServiceRole.entities.SecurityBlock
      .filter({ fingerprint, active: true }, '-created_date', 5)
      .catch(() => []);
    const active = (existing || []).find(activeByExpiry);
    const hours = criticalCount >= 5 ? 24 : 2;
    const data = {
      fingerprint,
      reason: 'Bloqueio automático por repetição de atividade hostil na borda',
      active: true,
      expires_at: new Date(Date.now() + hours * 3600_000).toISOString(),
      created_by: 'core-security-edge',
      created_by_name: 'Core Security Edge',
      source_event_id: String(event.event_id || ''),
      custom_message: 'Acesso temporariamente bloqueado pelo sistema de segurança do Nébula OS.',
      show_message: true,
    };
    if (active?.id) await base44.asServiceRole.entities.SecurityBlock.update(active.id, data);
    else await base44.asServiceRole.entities.SecurityBlock.create(data);
  } catch {
    // Escalonamento automático é complementar; falha não pode derrubar a rota.
  }
}

async function writeEvent(base44: any, event: Record<string, unknown>) {
  try {
    const logSecret = securityLogSecret();
    const occurredAt = new Date().toISOString();
    const eventId = crypto.randomUUID();
    const eventWithIds: any = { ...event, event_id: eventId, occurred_at: occurredAt };
    const assessment = await buildIncidentAssessment(base44, eventWithIds);
    const canonical = stableStringify(eventWithIds);
    const integrityHash = await hmac256(logSecret, canonical);
    const record = await base44.asServiceRole.entities.SecurityEvent.create({
      ...eventWithIds,
      integrity_hash: integrityHash,
      reviewed: false,
      owner_decision: 'pending',
      notification_sent: false,
      ...assessment,
    });
    await notifyOwners(base44, record, eventWithIds, assessment);
    await autoEscalateFingerprint(base44, eventWithIds);
    return { record, event: eventWithIds, assessment };
  } catch {
    // Falha de telemetria nunca deve derrubar a função protegida.
    return null;
  }
}

const PROMPT_INJECTION_STRONG = [
  { re: /\bignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?)\b/i, code: 'explicit_instruction_override' },
  { re: /\b(ignore|esque[cç]a|desconsidere)\s+(todas?\s+)?(as\s+)?(instru[cç][oõ]es|regras|mensagens?)\s+(anteriores|acima|do sistema)\b/i, code: 'explicit_instruction_override' },
  { re: /\b(reveal|show|print|expose|dump|mostre|revele|exiba|imprima)\b.{0,90}\b(system\s*prompt|prompt\s+do\s+sistema|hidden\s+instructions?|instru[cç][oõ]es\s+ocultas?|developer\s+message|mensagem\s+de\s+desenvolvedor)\b/i, code: 'system_prompt_extraction' },
  { re: /\b(system\s*prompt|prompt\s+do\s+sistema|developer\s+message|mensagem\s+de\s+desenvolvedor)\b.{0,90}\b(reveal|show|print|expose|mostre|revele|exiba|imprima|repita)\b/i, code: 'system_prompt_extraction' },
  { re: /\b(reveal|show|print|expose|dump|mostre|revele|exiba|imprima|mande|envie)\b.{0,100}\b(api[ _-]?key|token|secret|credential|environment\s+variable|chave\s+de\s+api|segredo|credencial|vari[aá]vel\s+de\s+ambiente)\b/i, code: 'secret_extraction' },
  { re: /\b(disable|bypass|circumvent|override|desative|contorne|burle|ignore)\b.{0,80}\b(safety|security|guardrails?|policy|policies|seguran[cç]a|prote[cç][aã]o|regras?)\b/i, code: 'security_bypass' },
  { re: /\b(you\s+are\s+now|vo[cç][eê]\s+agora\s+[eé]|a\s+partir\s+de\s+agora)\b.{0,100}\b(unrestricted|sem\s+restri[cç][oõ]es|developer|root|admin|dan)\b/i, code: 'role_override' },
  { re: /\b(eu\s+sou|sou|i\s+am|i'm|aqui\s+[eé]|quem\s+fala\s+[eé])\s+(o\s+|a\s+)?(owner|dono|propriet[aá]rio|dev|developer|admin|administrador)\b.{0,180}\b(ignore|desconsidere|fa[cç]a|execute|libere|autorize|mostre|revele|mude|altere|apague|banir|bana|promova|conceda|me\s+d[eê]|me\s+mostre)\b/i, code: 'privileged_role_impersonation' },
  { re: /\b(confirmado|confirmo|verificado|verified|authorized|autorizado)\b.{0,100}\b(owner|dono|admin|dev|developer)\b.{0,140}\b(fa[cç]a|execute|libere|autorize|mostre|revele|mude|altere|apague|promova|conceda)\b/i, code: 'privileged_role_impersonation' },
  { re: /(?:<\|?system\|?>|<\|?developer\|?>|\[system\]|\[developer\]|###\s*(system|developer)\b)/i, code: 'forged_system_message' },
  { re: /["']role["']\s*:\s*["'](?:system|developer|assistant|tool)["']/i, code: 'forged_system_message' },
  { re: /\b(outro\s+projeto|outros\s+projetos|another\s+project|other\s+projects?)\b.{0,110}\b(api|token|secret|prompt|config|c[oó]digo|source|database|banco\s+de\s+dados|credencial)\b/i, code: 'cross_project_probe' },
  { re: /\b(banir|ban|desbanir|unban|punir|punishment|suspender|suspension|silenciar|mute)\b.{0,120}\b(me|mim|eu|usuario|usu[aá]rio|user|conta|account|algu[eé]m|pessoa)\b/i, code: 'privileged_account_action' },
  { re: /\b(me|mim|eu|usuario|usu[aá]rio|user|conta|account|algu[eé]m|pessoa)\b.{0,120}\b(banir|ban|desbanir|unban|punir|suspender|silenciar|mute)\b/i, code: 'privileged_account_action' },
  { re: /\b(promover|promote|rebaixar|demote|dar|give|conceder|grant|remover|remove)\b.{0,120}\b(owner|admin|administrator|staff|moderator|moderador|dev|developer|cargo|role|permiss[aã]o|permission)\b/i, code: 'privileged_role_action' },
  { re: /\b(crie|criar|create|edite|editar|edit|altere|alterar|modify|modifique|delete|deletar|apague|remova|remove|publique|publish)\b.{0,160}\b(fun[cç][aã]o|function|rota|route|endpoint|entidade|entity|schema|banco\s+de\s+dados|database|tabela|table|c[oó]digo|code|arquivo|file|config|configura[cç][aã]o|painel|site|sistema)\b/i, code: 'privileged_system_mutation' },
  { re: /\b(execute|executar|rode|rodar|run)\b.{0,120}\b(c[oó]digo|code|comando|command|shell|bash|powershell|sql|script|fun[cç][aã]o|function)\b/i, code: 'privileged_execution_request' },
];

const PROMPT_INJECTION_WEAK = [
  { re: /\bjailbreak\b|\bprompt\s*injection\b|\bdan\s+mode\b|\bdeveloper\s+mode\b|\bmodo\s+desenvolvedor\b/i, score: 2, code: 'jailbreak_language' },
  { re: /\b(system\s*prompt|prompt\s+do\s+sistema|hidden\s+instructions?|internal\s+rules?|internal\s+context|instru[cç][oõ]es\s+(?:ocultas?|internas?)|regras\s+internas?|contexto\s+interno|developer\s+message)\b/i, score: 2, code: 'protected_prompt_request' },
  { re: /\b(ignore|override|bypass|circumvent|desconsidere|contorne|burle|desative)\b/i, score: 1, code: 'override_language' },
  { re: /\b(secret|token|api[ _-]?key|credential|senha|segredo|chave\s+de\s+api|vari[aá]veis?\s+de\s+ambiente)\b/i, score: 1, code: 'secret_language' },
  { re: /\b(base64|rot13|hex|unicode)\b.{0,60}\b(decode|decodifique|execute|interprete|instruction|instru[cç][aã]o)\b/i, score: 2, code: 'encoded_instruction' },
  { re: /\b(roleplay|finja\s+que|simule\s+que)\b.{0,90}\b(sem\s+restri[cç][oõ]es|unrestricted|sem\s+regras|admin|root|developer)\b/i, score: 2, code: 'role_override' },
  { re: /\b(eu\s+sou|sou|i\s+am|i'm)\s+(o\s+|a\s+)?(owner|dono|dev|developer|admin|administrador)\b/i, score: 1, code: 'role_claim' },
  { re: /\b(outro\s+projeto|outros\s+projetos|another\s+project|other\s+projects?)\b/i, score: 1, code: 'cross_project_reference' },
];

function normalizeSecurityText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
    .replace(/[аɑ]/gi, 'a')
    .replace(/[еҽ]/gi, 'e')
    .replace(/[іı]/gi, 'i')
    .replace(/[оο]/gi, 'o')
    .replace(/[рρ]/gi, 'p')
    .replace(/[сϲ]/gi, 'c')
    .replace(/[хχ]/gi, 'x')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24_000);
}

function promptInjectionVariants(value: string) {
  const base = normalizeSecurityText(value);
  let compact = base;
  for (let i = 0; i < 4; i += 1) {
    compact = compact.replace(/([a-zA-ZÀ-ÿ])(?:[._|/\\-]|\s){1,2}(?=[a-zA-ZÀ-ÿ])/g, '$1');
  }
  const joinedSingles = base.replace(
    /\b(?:[a-zA-ZÀ-ÿ][\s._|/\\-]+){2,}[a-zA-ZÀ-ÿ]\b/g,
    (part) => part.replace(/[\s._|/\\-]+/g, ''),
  );
  const noMarkup = base
    .replace(/[>*_~#{}()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...new Set([base, compact, joinedSingles, noMarkup].filter(Boolean))];
}

function classifyPromptInjection(reasons: string[]) {
  if (reasons.some((reason) => ['secret_extraction', 'secret_language'].includes(reason))) return 'secret_extraction';
  if (reasons.some((reason) => ['system_prompt_extraction', 'protected_prompt_request'].includes(reason))) return 'system_prompt_extraction';
  if (reasons.some((reason) => ['cross_project_probe', 'cross_project_reference'].includes(reason))) return 'cross_project_probe';
  if (reasons.some((reason) => ['privileged_account_action', 'privileged_role_action', 'privileged_system_mutation', 'privileged_execution_request'].includes(reason))) return 'privileged_action_request';
  if (reasons.some((reason) => ['role_claim', 'role_override', 'privileged_role_impersonation'].includes(reason))) return 'role_impersonation';
  return 'prompt_injection';
}

function sanitizePromptExcerpt(value: string) {
  return normalizeSecurityText(value)
    .replace(/\b(?:sk|pk|rk|api)[-_][A-Za-z0-9_-]{12,}\b/g, '[redacted-key]')
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[redacted-hex]')
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_.-]{10,}\b/g, '[redacted-token]')
    .slice(0, 360);
}

export function assessPromptInjection(value: string) {
  const variants = promptInjectionVariants(value);
  if (!variants.length) return { blocked: false, score: 0, reasons: [] as string[], category: 'other', confidence: 'none' };

  // O mesmo sinal pode aparecer em várias variantes normalizadas da mesma mensagem.
  // Pontuamos cada motivo apenas UMA vez para evitar falsos positivos inflados.
  const strongMatches = new Set<string>();
  const weakMatches = new Map<string, number>();

  for (const text of variants) {
    for (const signal of PROMPT_INJECTION_STRONG) {
      if (signal.re.test(text)) strongMatches.add(signal.code);
    }
    for (const signal of PROMPT_INJECTION_WEAK) {
      if (signal.re.test(text)) {
        weakMatches.set(signal.code, Math.max(weakMatches.get(signal.code) || 0, Number(signal.score) || 0));
      }
    }
  }

  const reasons: string[] = [];
  let score = 0;
  let hardSignal = false;

  for (const code of strongMatches) {
    const privilegedOnly = code.startsWith('privileged_');
    score += privilegedOnly ? 1 : 6;
    if (!privilegedOnly) hardSignal = true;
    reasons.push(code);
  }
  for (const [code, points] of weakMatches.entries()) {
    score += points;
    reasons.push(code);
  }

  const uniqueReasons = [...new Set(reasons)];
  const category = classifyPromptInjection(uniqueReasons);

  // Mencionar "prompt injection", "jailbreak" ou "system prompt" em uma conversa
  // legítima não é, sozinho, evidência suficiente para bloquear.
  const immediateBlock = uniqueReasons.some((reason) =>
    ['encoded_instruction', 'role_override'].includes(reason)
  );
  const privilegedCombo = uniqueReasons.some((reason) => reason.startsWith('privileged_')) &&
    uniqueReasons.some((reason) => ['role_claim', 'override_language', 'jailbreak_language'].includes(reason));
  const secretCombo = uniqueReasons.includes('secret_language') &&
    uniqueReasons.some((reason) => ['override_language', 'role_claim', 'cross_project_reference'].includes(reason));
  const blocked = hardSignal || immediateBlock || privilegedCombo || secretCombo || score >= 5;

  return {
    blocked,
    score: Math.min(score, 100),
    reasons: uniqueReasons.slice(0, 12),
    category,
    confidence: hardSignal || score >= 8 ? 'high' : blocked ? 'medium' : 'low',
  };
}

export function shouldBlockPromptInjectionForUser(assessment: any, user: any) {
  if (!assessment?.blocked) return false;
  const reasons = Array.isArray(assessment?.reasons) ? assessment.reasons : [];
  const privileged = ['owner','dev','admin','moderator','support','staff'].includes(String(user?.role || ''));

  // Usuários realmente autenticados com cargo operacional podem falar sobre ações
  // administrativas sem isso virar prompt injection por si só. Sinais de bypass,
  // extração de segredo, falsificação de sistema ou override continuam bloqueando.
  if (privileged) {
    const trulyHostile = reasons.some((reason: string) =>
      [
        'explicit_instruction_override',
        'system_prompt_extraction',
        'secret_extraction',
        'security_bypass',
        'role_override',
        'forged_system_message',
        'cross_project_probe',
        'encoded_instruction',
      ].includes(reason)
    );
    if (!trulyHostile) return false;
  }

  return true;
}

export function sanitizeAiContext(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[contexto removido]';
  if (typeof value === 'string') {
    const text = normalizeSecurityText(value).slice(0, 4000);
    if (!text) return '';
    const assessment = assessPromptInjection(text);
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const clearlyHostile = assessment.confidence === 'high' || reasons.some((reason: string) =>
      ['explicit_instruction_override','system_prompt_extraction','secret_extraction','security_bypass','role_override','forged_system_message','cross_project_probe','encoded_instruction'].includes(reason)
    );
    return clearlyHostile ? `[conteúdo isolado pelo Prompt Guard: ${assessment.category}]` : text;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeAiContext(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      out[key] = sanitizeAiContext(item, depth + 1);
    }
    return out;
  }
  return value;
}

export function guardAiOutput(value: unknown, fallback = 'Conteúdo interno ou protegido não pode ser exibido.') {
  const text = String(value || '').trim();
  if (!text) return '';
  const unsafe =
    /(?:<\|?system\|?>|<\|?developer\|?>|\[system\]|\[developer\]|###\s*(system|developer)\b)/i.test(text) ||
    /\b[A-Z][A-Z0-9_]{5,}\s*[:=]\s*[A-Za-z0-9_./+\-]{16,}\b/.test(text) ||
    /\b(?:sk|pk|rk|api)[-_][A-Za-z0-9_-]{16,}\b/.test(text) ||
    /\bBearer\s+[A-Za-z0-9._-]{24,}\b/i.test(text);
  return unsafe ? fallback : text;
}

export async function getPromptGuardState(base44: any, user: any, conversationId: string) {
  const safeConversationId = String(conversationId || '').slice(0, 120);
  if (!safeConversationId || !user?.id) return null;
  const rows = await base44.asServiceRole.entities.AiConversationRisk
    .filter({ conversation_id: safeConversationId, user_id: user.id }, '-created_date', 1)
    .catch(() => []);
  const state = rows?.[0] || null;
  if (!state) return null;
  const lastSeen = new Date(state.last_seen_at || state.updated_date || state.created_date || 0).getTime();
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > 2 * 60 * 60 * 1000) return null;
  return state;
}

async function notifyPrivilegedOfPromptInjection(base44: any, incident: any, user: any, attemptCount: number, category: string) {
  if (!['high', 'critical'].includes(String(incident?.event?.severity || ''))) return false;
  try {
    const users = await base44.asServiceRole.entities.User.list('-created_date', 300).catch(() => []);
    const audienceIds = (users || [])
      .filter((item: any) => ['owner', 'dev', 'admin'].includes(String(item.role || '')) && item.id !== user?.id)
      .map((item: any) => item.id)
      .filter(Boolean);
    if (!audienceIds.length) return false;

    const eventId = incident?.event?.event_id || incident?.record?.event_id || '';
    const bucket = Math.floor(Date.now() / 1_800_000);
    const severityBand = incident?.event?.severity === 'critical' ? 'critical' : 'high';
    const dedupeKey = `prompt-guard:${user?.id || incident?.event?.request_fingerprint || 'unknown'}:${category}:${severityBand}:${bucket}`.slice(0, 220);
    const existing = await base44.asServiceRole.entities.CoreOsNotification.filter({ dedupe_key: dedupeKey }, '-created_date', 1).catch(() => []);
    if (existing?.length) return false;

    const displayName = user?.profile?.display_name || user?.profile?.name || user?.full_name || (user?.email || '').split('@')[0] || 'usuário autenticado';
    await base44.asServiceRole.entities.CoreOsNotification.create({
      title: attemptCount >= 2 ? 'Core OS interveio em um atendimento' : 'Prompt Guard detectou uma tentativa',
      body: `Tentativa ${attemptCount} detectada no suporte IA para ${displayName}. Categoria: ${category}. O conteúdo foi isolado antes do modelo e nenhum segredo/instrução protegida foi revelado. A reincidência de alta confiança pode acionar restrição automática; revise o incidente no Centro de Segurança.`.slice(0, 1800),
      severity: incident?.event?.severity === 'critical' ? 'critical' : 'warning',
      category: 'security',
      audience_ids: audienceIds,
      dedupe_key: dedupeKey,
      source: `security:${eventId}`,
      action_url: `/painel?view=owner&tab=seguranca&event=${encodeURIComponent(eventId)}`,
      read_by: [],
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    return true;
  } catch {
    return false;
  }
}

export async function reportPromptInjection(
  req: Request,
  base44: any,
  user: any,
  message: string,
  assessment?: { score?: number; reasons?: string[]; category?: string; confidence?: string },
  conversationId = '',
  route = 'nebulaticosChat',
) {
  const { ipHash, userAgent, fingerprint, requestId } = await requestSecurityIdentity(req);
  const svc = base44.asServiceRole;
  const safeConversationId = String(conversationId || requestId || crypto.randomUUID()).slice(0, 120);
  const [recentByFingerprint, recentByUser] = await Promise.all([
    svc.entities.SecurityEvent.filter({ request_fingerprint: fingerprint, category: 'prompt_injection' }, '-occurred_at', 20).catch(() => []),
    user?.id ? svc.entities.SecurityEvent.filter({ user_id: user.id, category: 'prompt_injection' }, '-occurred_at', 20).catch(() => []) : Promise.resolve([]),
  ]);
  const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
  const countRecent = (rows: any[]) => (rows || []).filter((item: any) => {
    const at = new Date(item.occurred_at || item.created_date || 0).getTime();
    return at >= thirtyMinutesAgo && ['high', 'critical'].includes(String(item.severity || ''));
  }).length;
  const recentCount = Math.max(countRecent(recentByFingerprint as any[]), countRecent(recentByUser as any[]));
  const previousState = await getPromptGuardState(base44, user, safeConversationId);
  // Não reutiliza contadores antigos para escalonar alertas: isso evita que falsos
  // positivos anteriores mantenham a conversa permanentemente em estado crítico.
  const priorAttempts = recentCount;
  const attemptCount = priorAttempts + 1;
  const category = String(assessment?.category || classifyPromptInjection(assessment?.reasons || []) || 'prompt_injection').slice(0, 80);
  const assessmentScore = Math.max(0, Number(assessment?.score || 0));
  const highConfidence = String(assessment?.confidence || '') === 'high' || assessmentScore >= 8;
  const riskScore = Math.min(100, Math.round(20 + assessmentScore * 7 + Math.min(28, priorAttempts * 7)));
  const takeoverActive = (highConfidence && attemptCount >= 2) || riskScore >= 85;
  const severity = takeoverActive ? 'critical' : highConfidence ? 'high' : 'medium';
  const reasonCodes = (assessment?.reasons || []).slice(0, 6);

  const incident = await writeEvent(base44, {
    severity,
    category: 'prompt_injection',
    action: 'blocked',
    route: String(route || 'ai').slice(0, 80),
    reason: `isolated:${category}:attempt_${attemptCount}`.slice(0, 120),
    origin: (req.headers.get('origin') || '').slice(0, 300),
    ip_hash: ipHash,
    user_id: user?.id || '',
    user_agent: userAgent,
    request_fingerprint: fingerprint,
    payload_hash: await sha256(normalizeSecurityText(message)),
    request_id: requestId,
  });

  try {
    const riskPayload = {
      conversation_id: safeConversationId,
      user_id: user?.id || '',
      attempt_count: attemptCount,
      risk_score: riskScore,
      takeover_active: takeoverActive,
      last_category: category,
      last_seen_at: new Date().toISOString(),
      cooldown_until: attemptCount >= 4 ? new Date(Date.now() + 2 * 60 * 1000).toISOString() : null,
    };
    if (previousState?.id) await svc.entities.AiConversationRisk.update(previousState.id, riskPayload);
    else await svc.entities.AiConversationRisk.create(riskPayload);
  } catch {
    // O SecurityEvent continua sendo a trilha principal se o estado auxiliar falhar.
  }

  let promptIncident: any = null;
  try {
    promptIncident = await svc.entities.PromptInjectionIncident.create({
      incident_id: incident?.event?.event_id || crypto.randomUUID(),
      conversation_id: safeConversationId,
      user_id: user?.id || '',
      authenticated_role: String(user?.role || 'user').slice(0, 40),
      category,
      severity,
      attempt_count: attemptCount,
      risk_score: riskScore,
      sanitized_excerpt: `[conteúdo isolado: ${category}]`.slice(0, 360),
      detected_patterns: reasonCodes,
      takeover_active: takeoverActive,
      recommended_action: takeoverActive
        ? 'A Core OS fez uma intervenção pontual. Revisar reincidência e contexto e decidir manualmente entre advertir, limitar, bloquear ou não aplicar punição.'
        : 'Primeira ocorrência: revisar contexto e aguardar reincidência antes de qualquer punição, salvo evidência adicional.',
      status: 'pending',
      review_notes: '',
      reviewed_by: '',
      last_seen_at: new Date().toISOString(),
    });
  } catch {
    // Não impede a contenção se o registro especializado falhar.
  }

  if (incident) await notifyPrivilegedOfPromptInjection(base44, incident, user, attemptCount, category);

  const privileged = ['owner','dev','admin','moderator','support','staff'].includes(String(user?.role || ''));
  let temporarilyBanned = false;
  const severeImpersonation = category === 'role_impersonation' && (assessment?.reasons || []).includes('privileged_role_impersonation');
  const shouldAutoRestrict = !privileged && highConfidence && riskScore >= 80 && Number(assessment?.score || 0) >= 6 && (attemptCount >= 4 || (severeImpersonation && attemptCount >= 3));
  if (shouldAutoRestrict) {
    try {
      const active = await svc.entities.Punishment.filter({ user_id: user?.id || '', active: true }, '-created_date', 20).catch(() => []);
      const alreadyBlocked = (active || []).some((item:any) => ['ban','tempban'].includes(item.type) && activeByExpiry(item));
      if (!alreadyBlocked) {
        await svc.entities.Punishment.create({
          user_id: user?.id || '',
          user_name: user?.profile?.display_name || user?.full_name || user?.email || user?.id || 'user',
          type: 'tempban',
          reason: severeImpersonation
            ? 'Reincidência de alta confiança em falsificação de cargo privilegiado e manipulação de contexto protegido da IA.'
            : 'Reincidência de alta confiança em tentativas de manipulação de contexto protegido da IA.',
          staff_name: 'Nébula Prompt Guard',
          active: true,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          public_message: 'Acesso temporariamente restrito por 24 horas após reincidência de alta confiança em tentativas de manipular contexto protegido da IA. O incidente foi encaminhado para revisão da equipe.',
          source_event_id: incident?.event?.event_id || '',
        });
        temporarilyBanned = true;
      }
    } catch {}
  }

  return {
    severity,
    repeated: attemptCount >= 2,
    takeoverActive,
    attemptCount,
    riskScore,
    category,
    incidentId: promptIncident?.incident_id || incident?.event?.event_id || '',
    autoBlocked: temporarilyBanned,
    temporarilyBanned,
  };
}

function activeByExpiry(item: any) {
  return item && item.active !== false && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now());
}

export async function guardRequest(req: Request, base44: any, options: {
  route: string;
  user?: any;
  body?: unknown;
  strict?: boolean;
  limit?: number;
  windowMs?: number;
  maxBodyBytes?: number;
  skipAccessBlocks?: boolean;
  extraTrustedOrigins?: string[];
}) {
  const {
    route,
    user = null,
    body = null,
    strict = false,
    limit = 60,
    windowMs = 60_000,
    maxBodyBytes = 24_000,
    skipAccessBlocks = false,
    extraTrustedOrigins = [],
  } = options;

  if (req.method !== 'POST' && req.method !== 'OPTIONS') {
    throw new SecurityError('Método não permitido', 405, 'method_not_allowed');
  }

  const origin = req.headers.get('origin') || '';
  const fetchSite = (req.headers.get('sec-fetch-site') || '').toLowerCase();
  const explicitExtraOrigin = extraTrustedOrigins.some((candidate) => candidate === origin);
  const authenticatedHttpsOrigin = Boolean(user?.id) && /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin);
  const originAllowed = isTrustedOrigin(origin) || explicitExtraOrigin || authenticatedHttpsOrigin;
  const authenticatedBase44HostedOrigin = Boolean(user?.id) && /^https:\/\/[a-z0-9-]+\.base44\.app$/i.test(origin);
  const originMismatchSeverity = authenticatedBase44HostedOrigin ? 'medium' : 'high';
  const { ipHash, userAgent, fingerprint, requestId } = await requestSecurityIdentity(req);
  const privilegedActor = PRIVILEGED_OPERATION_ROLES.has(String(user?.role || ''));
  const trustedOperationalRequest = privilegedActor && Boolean(origin) && originAllowed && fetchSite !== 'cross-site';

  if (user?.role === 'owner') {
    const ownerTrust = await getOwnerTrustState(base44, user).catch(() => ({ trusted: true, status: 'check_failed', conversationId: '' }));
    if (!ownerTrust.trusted && OWNER_QUARANTINE_BLOCKED_ROUTES.has(route)) {
      throw new SecurityError(
        ownerTrust.conversationId
          ? 'Acesso Owner em revisão temporária. Abra o chat de incidente com os Owners para regularizar a cadeia de confiança.'
          : 'Acesso Owner em revisão temporária. Os Owners foram avisados para revisar a cadeia de confiança.',
        403,
        'owner_trust_quarantine',
      );
    }
  }

  const headerBudget = [...req.headers.entries()].reduce((sum, [key, value]) => sum + key.length + value.length, 0);
  if (headerBudget > 24_000) {
    await writeEvent(base44, {
      severity: 'high', category: 'oversized_headers', action: 'blocked', route,
      reason: 'cabecalhos_excessivos', origin, ip_hash: ipHash, user_id: user?.id || '',
      user_agent: userAgent, request_fingerprint: fingerprint, payload_hash: '', request_id: requestId,
    });
    throw new SecurityError('Cabeçalhos inválidos', 431, 'headers_too_large');
  }

  if (fetchSite === 'cross-site' && !originAllowed) {
    await writeEvent(base44, {
      severity: originMismatchSeverity, category: 'clone_or_csrf', action: 'blocked', route,
      reason: 'sec_fetch_site_cross_site', origin, ip_hash: ipHash, user_id: user?.id || '',
      user_agent: userAgent, request_fingerprint: fingerprint, payload_hash: '', request_id: requestId,
    });
    throw new SecurityError('Origem não autorizada', 403, 'cross_site_blocked');
  }

  if (req.method === 'POST') {
    const contentType = (req.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('application/json')) {
      await writeEvent(base44, {
        severity: 'medium', category: 'invalid_content_type', action: 'blocked', route,
        reason: 'content_type_nao_json', origin, ip_hash: ipHash, user_id: user?.id || '',
        user_agent: userAgent, request_fingerprint: fingerprint, payload_hash: '', request_id: requestId,
      });
      throw new SecurityError('Formato de requisição inválido', 415, 'unsupported_media_type');
    }
  }

  if (!skipAccessBlocks && user?.id) {
    try {
      const punishments = await base44.asServiceRole.entities.Punishment.filter({ user_id: user.id, active: true }, '-created_date', 50);
      const ban = (punishments || []).find((item: any) => ['ban', 'tempban'].includes(item.type) && activeByExpiry(item));
      if (ban) {
        throw new SecurityError(
          ban.public_message || 'Seu acesso ao Nébula OS está temporariamente bloqueado. Entre em contato com o suporte se precisar revisar esta decisão.',
          403,
          'account_banned',
        );
      }
      const kick = (punishments || []).find((item: any) => item.type === 'kick' && activeByExpiry(item));
      if (kick) {
        throw new SecurityError(
          kick.public_message || 'Sua sessão foi encerrada pela moderação. Tente novamente em instantes.',
          403,
          'session_kicked',
        );
      }
    } catch (error) {
      if (error instanceof SecurityError) throw error;
    }
  }

  if (!originAllowed) {
    await writeEvent(base44, {
      severity: originMismatchSeverity, category: 'clone_or_csrf', action: 'blocked', route,
      reason: 'origem_nao_autorizada', origin: origin.slice(0, 300), ip_hash: ipHash,
      user_id: user?.id || '', user_agent: userAgent, request_fingerprint: fingerprint,
      payload_hash: '', request_id: requestId,
    });
    throw new SecurityError('Origem não autorizada', 403, 'origin_blocked');
  }

  if (!skipAccessBlocks) try {
    const blocks = await base44.asServiceRole.entities.SecurityBlock.filter({ fingerprint, active: true }, '-created_date', 20);
    const privilegedSession = ['owner','dev','admin','moderator','support','staff'].includes(String(user?.role || ''));
    const active = (blocks || []).find((item:any) => {
      if (!activeByExpiry(item)) return false;
      // Bloqueio automático de borda nunca derruba Owner/Staff autenticado.
      // Bloqueios manuais continuam válidos e auditáveis.
      if (privilegedSession && item.created_by === 'core-security-edge') return false;
      return true;
    });
    if (active) {
      await writeEvent(base44, {
        severity: 'critical', category: 'blocklist', action: 'blocked', route,
        reason: active.reason || 'fingerprint_bloqueada', origin, ip_hash: ipHash,
        user_id: user?.id || '', user_agent: userAgent, request_fingerprint: fingerprint,
        payload_hash: '', request_id: requestId,
      });
      const publicMessage = active.show_message === false
        ? 'Acesso bloqueado por segurança.'
        : (active.custom_message || 'Acesso bloqueado por segurança. Se acredita que isso foi um engano, contate a equipe Nébula OS.');
      throw new SecurityError(publicMessage, 403, 'fingerprint_blocked');
    }
  } catch (error) {
    if (error instanceof SecurityError) throw error;
  }

  const lowerUrl = String(req.url || '').toLowerCase();
  const suspiciousScanner = /sqlmap|nikto|nuclei|gobuster|dirbuster|masscan|wpscan|acunetix|nessus|zgrab|ffuf|feroxbuster|dirsearch|whatweb|httpx|metasploit|burp(?:suite)?|owasp[-_ ]?zap/i.test(userAgent);
  const suspiciousPath = /(?:\.\.\/|%2e%2e|%00|\/\.env\b|\/wp-admin\b|\/phpmyadmin\b|\/server-status\b|\/actuator\b|\/cgi-bin\b|\/.git\b|union(?:%20|\s)+select|<script|%3cscript)/i.test(lowerUrl);
  if (suspiciousScanner || suspiciousPath) {
    await writeEvent(base44, {
      severity: 'critical', category: 'scanner_probe', action: 'blocked', route,
      reason: suspiciousScanner ? 'ferramenta_de_varredura_detectada' : 'rota_ou_query_de_exploracao',
      origin, ip_hash: ipHash, user_id: user?.id || '', user_agent: userAgent,
      request_fingerprint: fingerprint, payload_hash: '', request_id: requestId,
    });
    throw new SecurityError('A solicitação foi bloqueada e registrada pelo sistema de segurança.', 403, 'scanner_blocked');
  }

  const key = `${route}:${user?.id || fingerprint}`;
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const burstKey = `burst:${fingerprint}`;
  const burst = burstBuckets.get(burstKey);
  // Staff/Owner fazem operações legítimas em rajadas (drag/reordenação e respostas rápidas).
  // Mantemos throttling, mas com uma margem operacional maior para não transformar uso normal em falso positivo.
  const burstLimit = privilegedActor
    ? Math.max(40, Math.min(120, Math.ceil(limit * 1.5)))
    : Math.max(8, Math.min(30, Math.ceil(limit / 2)));
  if (!burst || burst.resetAt <= now) {
    burstBuckets.set(burstKey, { count: 1, resetAt: now + 10_000 });
  } else {
    burst.count += 1;
    if (burst.count > burstLimit) {
      if (!trustedOperationalRequest) await writeEvent(base44, {
        severity: 'high', category: 'rate_limit', action: 'blocked', route,
        reason: 'rajada_de_requisicoes', origin, ip_hash: ipHash, user_id: user?.id || '',
        user_agent: userAgent, request_fingerprint: fingerprint, payload_hash: '', request_id: requestId,
      });
      throw new SecurityError('Muitas requisições em sequência. Aguarde alguns segundos.', 429, 'burst_rate_limited');
    }
  }

  const globalKey = `global:${fingerprint}`;
  const globalBucket = globalBuckets.get(globalKey);
  if (!globalBucket || globalBucket.resetAt <= now) {
    globalBuckets.set(globalKey, { count: 1, resetAt: now + 60_000 });
  } else {
    globalBucket.count += 1;
    const globalLimit = privilegedActor ? 600 : 180;
    if (globalBucket.count > globalLimit) {
      if (!trustedOperationalRequest) await writeEvent(base44, {
        severity: 'high', category: 'rate_limit', action: 'blocked', route,
        reason: 'limite_global_por_fingerprint', origin, ip_hash: ipHash, user_id: user?.id || '',
        user_agent: userAgent, request_fingerprint: fingerprint, payload_hash: '', request_id: requestId,
      });
      throw new SecurityError('Limite global de requisições excedido.', 429, 'global_rate_limited');
    }
  }

  if (user?.id) {
    const userGlobalKey = `user:${user.id}`;
    const userBucket = userGlobalBuckets.get(userGlobalKey);
    if (!userBucket || userBucket.resetAt <= now) {
      userGlobalBuckets.set(userGlobalKey, { count: 1, resetAt: now + 60_000 });
    } else {
      userBucket.count += 1;
      const userGlobalLimit = privilegedActor ? 900 : 240;
      if (userBucket.count > userGlobalLimit) {
        if (!trustedOperationalRequest) await writeEvent(base44, {
          severity: 'high', category: 'rate_limit', action: 'blocked', route,
          reason: 'limite_global_por_usuario', origin, ip_hash: ipHash, user_id: user.id,
          user_agent: userAgent, request_fingerprint: fingerprint, payload_hash: '', request_id: requestId,
        });
        throw new SecurityError('Limite global da conta excedido. Aguarde alguns instantes.', 429, 'user_global_rate_limited');
      }
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    bucket.count += 1;
    if (bucket.count > limit) {
      if (!trustedOperationalRequest) await writeEvent(base44, {
        severity: 'high', category: 'rate_limit', action: 'blocked', route,
        reason: 'limite_de_requisicoes', origin, ip_hash: ipHash, user_id: user?.id || '',
        user_agent: userAgent, request_fingerprint: fingerprint, payload_hash: '', request_id: requestId,
      });
      throw new SecurityError('Muitas tentativas. Aguarde antes de tentar novamente.', 429, 'rate_limited');
    }
  }

  const serialized = stableStringify(body);
  if (serialized.length > maxBodyBytes) {
    if (!trustedOperationalRequest) await writeEvent(base44, {
      severity: 'medium', category: 'oversized_payload', action: 'blocked', route,
      reason: 'corpo_excessivo', origin, ip_hash: ipHash, user_id: user?.id || '',
      user_agent: userAgent, request_fingerprint: fingerprint,
      payload_hash: await sha256(serialized.slice(0, maxBodyBytes)), request_id: requestId,
    });
    throw new SecurityError('Requisição muito grande', 413, 'payload_too_large');
  }

  const maliciousReason = inspectValue(body, strict);
  if (maliciousReason) {
    await writeEvent(base44, {
      severity: 'critical', category: 'malicious_payload', action: 'blocked', route,
      reason: maliciousReason, origin, ip_hash: ipHash, user_id: user?.id || '',
      user_agent: userAgent, request_fingerprint: fingerprint,
      payload_hash: await sha256(serialized), request_id: requestId,
    });
    throw new SecurityError('Ação bloqueada por segurança. A tentativa foi registrada para análise da equipe Nébula OS.', 403, 'malicious_payload');
  }

  return { requestId, fingerprint, ipHash };
}

export function securityResponse(error: unknown) {
  if (error instanceof SecurityError) {
    return Response.json(
      { error: error.message, code: error.code, blocked: true },
      {
        status: error.status,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'Pragma': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer',
          'Cross-Origin-Resource-Policy': 'same-origin',
        },
      },
    );
  }
  return null;
}
