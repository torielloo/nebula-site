import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const STAFF_ROLES = new Set(['owner', 'dev', 'admin', 'moderator', 'support', 'staff']);
const VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);
const CORE_DEFAULTS = {
  enabled: true,
  model: 'browser-speech',
  voice: 'cedar',
  instructions: 'Voz GPT natural, conversacional, calma e confiante. Fale como numa conversa real, com dicção clara e ritmo humano, sem tom de locutor, sem teatralidade e sem exagerar na entonação.',
  autoSpeak: true,
};

const SUPPORT_DEFAULTS = {
  enabled: true,
  model: 'browser-speech',
  voice: 'cedar',
  instructions: 'Voz GPT natural, prestativa, clara e conversacional. Fale no mesmo idioma da resposta, com ritmo humano e sem tom robótico.',
  autoSpeak: true,
};

// Perfil isolado da Core OS operacional. Não lê configuração privada, persona,
// regras, conhecimento ou qualquer outro dado da Core OS Staff/Owner.
const SECURITY_DEFAULTS = {
  enabled: true,
  model: 'browser-speech',
  voice: 'cedar',
  instructions: 'Voz GPT curta, calma e objetiva. Leia somente o aviso de segurança recebido, mantendo a mesma voz natural das demais IAs. Não acrescente nomes, dados pessoais, contexto, explicações internas ou qualquer informação que não esteja no texto.',
  autoSpeak: true,
};

const NATURAL_SPEECH_RULES = [
  'Leia exatamente o texto fornecido, sem acrescentar, remover ou reformular palavras.',
  'Mantenha o mesmo idioma do texto recebido. Não force português quando o texto estiver em inglês ou espanhol.',
  'Use uma voz humana e conversacional, com ritmo natural e pausas discretas de acordo com a pontuação.',
  'Evite tom de locutor, anúncio, personagem de ficção científica, robô, central de comando ou dramatização.',
  'Soar clara, segura e próxima é mais importante do que soar grandiosa ou artificial.',
].join(' ');

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isAllowedSecurityInterventionText(value: string) {
  const text = value.trim();
  return (
    /^Core OS Security interveio\b/i.test(text)
    || /^Core OS Security intervened\b/i.test(text)
    || /^Core OS Security intervino\b/i.test(text)
  ) && /Nebulaticos/i.test(text);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

async function readVoiceConfig(svc: any, assistant = 'core_os') {
  if (assistant === 'core_security') {
    return { ...SECURITY_DEFAULTS, assistant: 'core_security' };
  }
  const rows = await svc.entities.CoreOsConfig.list('-created_date', 1).catch(() => []);
  const config = rows?.[0] || {};
  if (assistant === 'nebulaticos') {
    return {
      enabled: config.support_voice_enabled !== false,
      model: 'browser-speech',
      voice: VOICES.has(config.support_voice_name) ? config.support_voice_name : SUPPORT_DEFAULTS.voice,
      instructions: cleanText(config.support_voice_instructions, 900) || SUPPORT_DEFAULTS.instructions,
      autoSpeak: config.support_voice_auto_speak !== false,
      assistant: 'nebulaticos',
    };
  }
  return {
    enabled: config.voice_enabled !== false,
    model: 'browser-speech',
    voice: VOICES.has(config.voice_name) ? config.voice_name : CORE_DEFAULTS.voice,
    instructions: cleanText(config.voice_instructions, 900) || CORE_DEFAULTS.instructions,
    autoSpeak: config.voice_auto_speak !== false,
    assistant: 'core_os',
  };
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = cleanText(body?.action, 32) || 'config';
    const requestedAssistant = cleanText(body?.assistant, 40);
    const assistant = requestedAssistant === 'nebulaticos'
      ? 'nebulaticos'
      : requestedAssistant === 'core_security'
        ? 'core_security'
        : 'core_os';
    const isStaff = STAFF_ROLES.has(user.role);

    // Usuário comum nunca obtém nem usa o perfil operacional da Core OS.
    // Para o suporte público, só existem Nebulaticos IA e o perfil isolado
    // de intervenção Core Security.
    if (assistant === 'core_os' && !isStaff) {
      return Response.json({ error: 'Perfil de voz restrito à equipe Nébula OS' }, { status: 403 });
    }
    const isTranscription = action === 'transcribe_public' || action === 'transcribe_private' || action === 'transcribe' || action === 'voice_transcribe';

    if (isTranscription && !isStaff) {
      return Response.json({ error: 'Transcrição de voz restrita à equipe Nébula OS' }, { status: 403 });
    }

    await guardRequest(req, base44, {
      route: 'coreOsVoice',
      user,
      body,
      strict: isTranscription,
      limit: isTranscription ? 12 : (isStaff ? 30 : 12),
      windowMs: 60_000,
      maxBodyBytes: 16_000,
    });

    const config = await readVoiceConfig(base44.asServiceRole, assistant);

    if (action === 'config') {
      return Response.json({ ok: true, config });
    }

    if (action === 'transcribe_public' || action === 'transcribe_private' || action === 'transcribe' || action === 'voice_transcribe') {
      return Response.json({
        ok: false,
        provider: 'local',
        error: 'Transcrição por modelo externo foi desativada para não consumir créditos. Use entrada de texto ou transcrição nativa do navegador quando disponível.',
      }, { status: 422 });
    }

    if (action !== 'synthesize') {
      return Response.json({ error: 'Ação de voz inválida' }, { status: 400 });
    }

    if (!config.enabled) {
      return Response.json({ ok: false, disabled: true, provider: 'gpt', config });
    }

    const text = cleanText(body?.text, 2200);
    if (!text) return Response.json({ error: 'Texto vazio' }, { status: 400 });
    if (assistant === 'core_security' && !isAllowedSecurityInterventionText(text)) {
      return Response.json({ error: 'Core OS Security só pode reproduzir avisos de intervenção' }, { status: 403 });
    }

    let voice = config.voice;
    let customInstructions = config.instructions;
    const requestedVoice = cleanText(body?.voice, 32);
    if (assistant !== 'core_security' && VOICES.has(requestedVoice)) voice = requestedVoice;
    if (body?.preview === true && user.role === 'owner') {
      const requestedInstructions = cleanText(body?.instructions, 900);
      if (requestedInstructions) customInstructions = requestedInstructions;
    }
    const instructions = `${NATURAL_SPEECH_RULES}\nInstrução adicional de estilo: ${customInstructions}`.slice(0, 1800);

    return Response.json({
      ok: true,
      provider: 'browser',
      text,
      config: { ...config, voice, model: 'browser-speech' },
    });
  } catch (error) {
    const guarded = securityResponse(error);
    if (guarded) return guarded;
    return Response.json({ error: 'Não foi possível sintetizar a voz da IA' }, { status: 500 });
  }
}
