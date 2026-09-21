import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { findActiveMute } from '../../shared/activeMute.ts';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const txt = (value:any, max=4000) => String(value ?? '').trim().slice(0, max);
const ATTACHMENT_TYPES = new Set(['image', 'video', 'audio', 'file']);

function safeAttachmentUrl(value:any) {
  const url = txt(value, 1200);
  if (!url || url.includes('..') || /[\s<>"'\\]/.test(url)) return '';
  if (/^https:\/\//i.test(url)) return url;
  if (/^(mp|b44|base44|private)(:\/\/|\/)/i.test(url)) return url;
  return '';
}

function sanitizeAttachments(value:any) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((item:any) => {
    const type = ATTACHMENT_TYPES.has(String(item?.type || '')) ? String(item.type) : 'file';
    const url = safeAttachmentUrl(item?.url);
    const name = txt(item?.name, 180).replace(/[\u0000-\u001f\u007f]/g, '');
    return url ? { type, url, ...(name ? { name } : {}) } : null;
  }).filter(Boolean);
}

const activeMutePayload = (mute:any) => ({
  error: 'Você está silenciado e não pode enviar ou editar mensagens privadas enquanto a punição estiver ativa.',
  code: 'muted',
  muted: true,
  reason: mute?.reason || '',
  expires_at: mute?.expires_at || null,
});

async function getConversation(svc:any, id:string, userId:string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const direct = await svc.entities.Conversation.get(id).catch(() => null);
    if (direct && (direct.participants || []).includes(userId)) return direct;

    const rows = await svc.entities.Conversation.filter({ id }, '-updated_date', 1).catch(() => []);
    const conv = rows?.[0] || null;
    if (conv && (conv.participants || []).includes(userId)) return conv;

    if (attempt === 1) {
      const recent = await svc.entities.Conversation.list('-updated_date', 200).catch(() => []);
      const listed = (recent || []).find((row:any) => row?.id === id && (row.participants || []).includes(userId));
      if (listed) return listed;
    }

    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
  }
  return null;
}

async function findSentMessage(svc:any, userId:string, conversationId:string, requestId:string) {
  if (!requestId) return null;
  const rows = await svc.entities.DirectMessage
    .filter({ client_request_id: requestId, sender_id: userId, conversation_id: conversationId }, '-created_date', 1)
    .catch(() => []);
  if (rows?.[0]) return rows[0];

  const recent = await svc.entities.DirectMessage
    .filter({ conversation_id: conversationId, sender_id: userId }, '-created_date', 40)
    .catch(() => []);
  return (recent || []).find((row:any) => row?.client_request_id === requestId) || null;
}

export default async function(req:Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autorizado', code: 'unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, {
      route: 'directMessageOps',
      user,
      body,
      strict: false,
      limit: 60,
      windowMs: 60_000,
      maxBodyBytes: 40_000,
    });

    const svc = base44.asServiceRole;
    const action = txt(body.action, 20);

    if (action === 'send') {
      const mute = await findActiveMute(svc, user);
      if (mute) return Response.json(activeMutePayload(mute), { status: 403 });

      const conversationId = txt(body.conversation_id, 120);
      const conv = await getConversation(svc, conversationId, user.id);
      if (!conv) return Response.json({ error: 'Conversa inválida', code: 'invalid_conversation' }, { status: 403 });

      const content = txt(body.content, 8000);
      const stickerUrl = txt(body.sticker_url, 2048);
      const attachments = sanitizeAttachments(body.attachments);
      const clientRequestId = txt(body.client_request_id, 120);
      if (!content && !stickerUrl && attachments.length === 0) {
        return Response.json({ error: 'Mensagem vazia', code: 'empty_message' }, { status: 400 });
      }

      const mentions = Array.isArray(body.mentions)
        ? body.mentions.slice(0, 20).map((m:any) => ({ id: txt(m?.id, 120), name: txt(m?.name, 120) })).filter((m:any) => m.id && m.name)
        : [];

      if (clientRequestId) {
        const existing = await findSentMessage(svc, user.id, conversationId, clientRequestId);
        if (existing) return Response.json({ message: existing, deduplicated: true }, { headers: { 'Cache-Control': 'no-store' } });
      }

      const payload:any = {
        conversation_id: conversationId,
        sender_id: user.id,
        sender_name: user?.profile?.display_name || user?.profile?.name || user?.full_name || (user?.email || '').split('@')[0] || 'Usuário',
        sender_avatar: user?.profile?.avatar_url || '',
        content,
        sticker_url: stickerUrl,
        attachments,
        participants: conv.participants || [],
        mentions,
        client_request_id: clientRequestId,
        edited: false,
        deleted: false,
      };

      if (body.reply_to_id) {
        payload.reply_to_id = txt(body.reply_to_id, 120);
        payload.reply_author_name = txt(body.reply_author_name, 120);
        payload.reply_preview = txt(body.reply_preview, 180);
      }

      let created:any = null;
      let createError:any = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          created = await svc.entities.DirectMessage.create(payload);
          break;
        } catch (error:any) {
          createError = error;
          // A criação pode ter sido aceita mesmo se a resposta caiu. Confere a
          // chave idempotente antes de tentar novamente para não duplicar DM.
          if (clientRequestId) {
            const existing = await findSentMessage(svc, user.id, conversationId, clientRequestId);
            if (existing) {
              created = existing;
              break;
            }
          }
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 140 * (attempt + 1)));
        }
      }
      if (!created) throw createError || new Error('Falha ao criar mensagem privada');

      const summary = content || (stickerUrl ? 'Figurinha' : String(attachments.length) + ' anexo(s)');
      await svc.entities.Conversation.update(conversationId, {
        last_message: summary,
        last_sender_id: user.id,
      }).catch(() => null);

      return Response.json({ message: created }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'edit') {
      const mute = await findActiveMute(svc, user);
      if (mute) return Response.json(activeMutePayload(mute), { status: 403 });

      const id = txt(body.message_id, 120);
      const content = txt(body.content, 8000);
      if (!id || !content) return Response.json({ error: 'Mensagem inválida', code: 'invalid_message' }, { status: 400 });
      const rows = await svc.entities.DirectMessage.filter({ id }, '-created_date', 1).catch(() => []);
      const message = rows?.[0];
      if (!message || message.sender_id !== user.id) return Response.json({ error: 'Sem permissão', code: 'forbidden' }, { status: 403 });
      const conv = await getConversation(svc, message.conversation_id, user.id);
      if (!conv) return Response.json({ error: 'Conversa inválida', code: 'invalid_conversation' }, { status: 403 });
      const updated = await svc.entities.DirectMessage.update(id, {
        content,
        edited: true,
        edited_at: new Date().toISOString(),
      });
      await svc.entities.Conversation.update(message.conversation_id, {
        last_message: content,
        last_sender_id: user.id,
      }).catch(() => null);
      return Response.json({ message: updated });
    }

    if (action === 'delete') {
      const id = txt(body.message_id, 120);
      const rows = await svc.entities.DirectMessage.filter({ id }, '-created_date', 1).catch(() => []);
      const message = rows?.[0];
      if (!message || message.sender_id !== user.id) return Response.json({ error: 'Sem permissão', code: 'forbidden' }, { status: 403 });
      const conv = await getConversation(svc, message.conversation_id, user.id);
      if (!conv) return Response.json({ error: 'Conversa inválida', code: 'invalid_conversation' }, { status: 403 });
      const updated = await svc.entities.DirectMessage.update(id, {
        content: '[Mensagem removida]',
        sticker_url: '',
        attachments: [],
        deleted: true,
        deleted_at: new Date().toISOString(),
      });
      await svc.entities.Conversation.update(message.conversation_id, {
        last_message: 'Mensagem removida',
        last_sender_id: user.id,
      }).catch(() => null);
      return Response.json({ message: updated });
    }

    return Response.json({ error: 'Ação inválida', code: 'invalid_action' }, { status: 400 });
  } catch (error:any) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao processar mensagem privada', code: 'dm_error' }, { status: 500 });
  }
}