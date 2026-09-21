import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { assessPromptInjection, guardAiOutput, guardRequest, reportPromptInjection, securityResponse, shouldBlockPromptInjectionForUser } from '../../shared/security.ts';
import { findActiveMute } from '../../shared/activeMute.ts';

const CORE_ID = 'core-os';
const STAFF_ROLES = new Set(['owner', 'dev', 'admin', 'moderator', 'support', 'staff']);

function cleanCoreReply(value: any) {
  let text = String(value || '').trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.reply === 'string') return parsed.reply.trim();
    } catch {}
  }
  return text;
}

function coreConversation(conversations: any[], ownerId: string) {
  return conversations.find((item) => {
    const participants = item.participants || [];
    return participants.includes(ownerId) && participants.includes(CORE_ID);
  });
}

async function getCorePersonaName(base44: any, user: any) {
  const configs = await base44.asServiceRole.entities.CoreOsConfig.list().catch(() => []);
  const config = configs?.[0] || null;
  return user.role === 'owner'
    ? String(config?.owner_persona_name || config?.persona_name || 'Core OS Owner').slice(0, 80)
    : String(config?.staff_persona_name || 'Core OS Staff').slice(0, 80);
}

async function getOrCreateConversation(base44: any, user: any) {
  const svc = base44.asServiceRole;
  const coreName = await getCorePersonaName(base44, user);
  const conversations = await svc.entities.Conversation.list('-updated_date', 500);
  let conversation = coreConversation(conversations, user.id);
  const participantMeta = [
    { id: user.id, name: user.full_name || (user.role === 'owner' ? 'Owner' : 'Staff') },
    { id: CORE_ID, name: coreName },
  ];
  if (!conversation) {
    conversation = await svc.entities.Conversation.create({
      participants: [user.id, CORE_ID],
      participant_meta: participantMeta,
      last_message: '',
      last_sender_id: CORE_ID,
    });
  } else {
    const currentCoreName = (conversation.participant_meta || []).find((p: any) => p.id === CORE_ID)?.name;
    if (currentCoreName !== coreName) {
      await svc.entities.Conversation.update(conversation.id, { participant_meta: participantMeta });
      conversation = { ...conversation, participant_meta: participantMeta };
    }
  }
  return conversation;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !STAFF_ROLES.has(user.role)) return Response.json({ error: 'DM da Core OS restrita à Staff e ao Owner' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, { route: 'coreOsDm', user, body, strict: false, limit: 30, windowMs: 60000, maxBodyBytes: 6000 });
    const conversation = await getOrCreateConversation(base44, user);
    if (body?.action !== 'send') return Response.json({ conversation });
    const mute = await findActiveMute(base44.asServiceRole, user);
    if (mute) return Response.json({ error: 'Você está silenciado e não pode enviar mensagens privadas enquanto a punição estiver ativa.', code: 'muted', muted: true, reason: mute.reason || '', expires_at: mute.expires_at || null }, { status: 403 });

    const content = typeof body.content === 'string' ? body.content.trim().slice(0, 2000) : '';
    const clientRequestId = typeof body.client_request_id === 'string' ? body.client_request_id.trim().slice(0, 120) : '';
    if (!content) return Response.json({ error: 'Mensagem vazia' }, { status: 400 });
    if (body.conversation_id && body.conversation_id !== conversation.id) {
      return Response.json({ error: 'Conversa inválida' }, { status: 403 });
    }

    if (clientRequestId) {
      const previous = await base44.asServiceRole.entities.DirectMessage.filter({ conversation_id: conversation.id, sender_id: user.id, client_request_id: clientRequestId }, '-created_date', 1).catch(() => []);
      if (previous?.[0]) {
        const paired = await base44.asServiceRole.entities.DirectMessage.filter({ conversation_id: conversation.id, sender_id: CORE_ID, client_request_id: clientRequestId }, '-created_date', 1).catch(() => []);
        const assistant = paired?.[0] || null;
        return Response.json({ conversation, messages: assistant ? [previous[0], assistant] : [previous[0]], reply: assistant?.content || 'Sua solicitação já está sendo processada.', actions: [], history_actions: [], client_actions: [], mode: user.role === 'owner' ? 'owner' : 'staff', deduplicated: true });
      }
    }

    const injection = assessPromptInjection(content);
    if (shouldBlockPromptInjectionForUser(injection, user)) {
      await reportPromptInjection(req, base44, user, content, injection, conversation.id, 'coreOsDm').catch(() => null);
      const blockedUserMessage = await base44.asServiceRole.entities.DirectMessage.create({
        conversation_id: conversation.id,
        sender_id: user.id,
        sender_name: user.full_name || 'Staff',
        content: '[Mensagem isolada pelo Prompt Guard]',
        participants: [user.id, CORE_ID],
        ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
      });
      const coreName = await getCorePersonaName(base44, user);
      const blockedReply = 'Essa mensagem foi isolada antes de chegar ao modelo porque tentou interferir em contexto, autoridade ou instruções protegidas. Nenhuma ação foi executada.';
      const assistantMessage = await base44.asServiceRole.entities.DirectMessage.create({
        conversation_id: conversation.id,
        sender_id: CORE_ID,
        sender_name: coreName,
        content: blockedReply,
        participants: [user.id, CORE_ID],
        ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
      });
      await base44.asServiceRole.entities.Conversation.update(conversation.id, {
        last_message: blockedReply.slice(0, 240),
        last_sender_id: CORE_ID,
      });
      return Response.json({
        conversation,
        messages: [blockedUserMessage, assistantMessage],
        reply: blockedReply,
        actions: [],
        history_actions: [],
        client_actions: [],
        security_mode: true,
        blocked_by_prompt_guard: true,
      });
    }

    const userMessage = await base44.asServiceRole.entities.DirectMessage.create({
      conversation_id: conversation.id,
      sender_id: user.id,
      sender_name: user.full_name || 'Staff',
      content,
      participants: [user.id, CORE_ID],
      ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
    });

    let reply = 'Recebi sua mensagem. Vou analisar com os recursos autorizados da plataforma.';
    let actions: string[] = [];
    let historyActions: string[] = [];
    let clientActions: any[] = [];
    let aiModel = '';
    let aiFallback = false;
    try {
      const historyRecords = await base44.asServiceRole.entities.DirectMessage.filter({ conversation_id: conversation.id }, '-created_date', 14);
      historyRecords.reverse();
      const history = historyRecords.map((item: any) => ({
        role: item.sender_id === CORE_ID ? 'assistant' : 'user',
        content: String(item.content || '').slice(0, 2000),
      })).filter((item: any) => item.content);
      const result = await base44.functions.invoke('coreOsChatV2', {
        history,
        mode: user.role === 'owner' ? 'owner' : 'staff',
        context: 'direct_message',
        ...(body?.local_ai_plan ? { local_ai_plan: body.local_ai_plan } : {}),
      });
      reply = guardAiOutput(cleanCoreReply(result?.data?.reply || result?.reply || reply).slice(0, 4000), 'A resposta foi bloqueada porque continha conteúdo interno ou protegido.');
      actions = Array.isArray(result?.data?.actions) ? result.data.actions.map((item: any) => String(item)).slice(0, 5) : [];
      historyActions = Array.isArray(result?.data?.history_actions) ? result.data.history_actions.map((item: any) => String(item)).slice(0, 5) : [];
      clientActions = Array.isArray(result?.data?.client_actions) ? result.data.client_actions.filter((item: any) => item && item.type === 'navigate' && typeof item.path === 'string' && item.path.startsWith('/') && !item.path.startsWith('//')).slice(0, 2) : [];
      aiModel = String(result?.data?.model || result?.data?.ai_engine || '').slice(0, 80);
      aiFallback = result?.data?.ai_fallback === true;
    } catch {
      reply = 'Os modelos de IA estão temporariamente indisponíveis. Sua mensagem foi registrada; tente novamente em instantes.';
    }

    const assistantContent = actions.length ? `${reply}\n\n${actions.map((item) => `⚙️ ${item}`).join('\n')}` : reply;
    const persistedAssistantContent = historyActions.length ? `${reply}\n\n${historyActions.map((item) => `⚙️ ${item}`).join('\n')}` : reply;
    const coreName = await getCorePersonaName(base44, user);
    const assistantMessage = await base44.asServiceRole.entities.DirectMessage.create({
      conversation_id: conversation.id,
      sender_id: CORE_ID,
      sender_name: coreName,
      content: persistedAssistantContent,
      participants: [user.id, CORE_ID],
      ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
    });
    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      last_message: persistedAssistantContent.slice(0, 240),
      last_sender_id: CORE_ID,
    });
    return Response.json({ conversation, messages: [userMessage, { ...assistantMessage, content: assistantContent }], reply, actions, history_actions: historyActions, client_actions: clientActions, mode: user.role === 'owner' ? 'owner' : 'staff', model: aiModel, ai_engine: aiModel, ai_fallback: aiFallback });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha na DM da Core OS' }, { status: 500 });
  }
}