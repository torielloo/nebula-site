import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

function isSafePrivateFileUri(value) {
  const uri = typeof value === 'string' ? value.trim() : '';
  if (!uri || uri.length > 1200 || uri.includes('..') || /[\s<>"'\\]/.test(uri)) return false;
  return /^(mp|b44|base44)(:\/\/|\/)/i.test(uri) || /^private(:\/\/|\/)/i.test(uri);
}

// Assina a URL de um anexo PRIVADO de ticket. Autorização dupla:
// 1) o usuário precisa ter acesso ao ticket (RLS da entidade Ticket);
// 2) o primeiro registro persistido desse file_uri precisa pertencer ao mesmo ticket.
// Assim, copiar um URI vazado para outro ticket não transfere acesso ao arquivo.
// A URL assinada é temporária (15 min).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

    const body = await req.json().catch(() => null);
    await guardRequest(req, base44, { route: 'signAttachmentUrl', user, body, strict: false, limit: 80, windowMs: 60_000, maxBodyBytes: 30000 });
    const fileUri = body && body.file_uri;
    const requestedBatch = Array.isArray(body?.file_uris)
      ? [...new Set(body.file_uris.filter((value) => typeof value === 'string').map((value) => value.trim()))].slice(0, 60)
      : [];
    const ticketId = body && body.ticket_id;
    const conversationId = body && body.conversation_id;
    if (!requestedBatch.length && (typeof fileUri !== 'string' || !isSafePrivateFileUri(fileUri))) {
      return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }
    if (requestedBatch.some((uri) => !isSafePrivateFileUri(uri))) {
      return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    if (typeof ticketId === 'string' && ticketId.length > 0 && ticketId.length <= 120) {
      let ticket = null;
      try {
        const rows = await base44.entities.Ticket.filter({ id: ticketId }, '-created_date', 1);
        ticket = rows?.[0] || null;
      } catch {}
      if (!ticket && ['support','staff','moderator','admin','dev','owner'].includes(String(user.role || ''))) {
        const rows = await base44.asServiceRole.entities.Ticket.filter({ id: ticketId }, '-created_date', 1).catch(() => []);
        ticket = rows?.[0] || null;
      }
      if (!ticket) return Response.json({ error: 'Ticket não encontrado' }, { status: 404 });

      const ticketMessages = await base44.asServiceRole.entities.TicketMessage.filter({ ticket_id: ticketId }, '-created_date', 500).catch(() => []);
      const allowedUris = new Set();
      for (const attachment of ticket.attachments || []) {
        if (attachment?.url && isSafePrivateFileUri(attachment.url)) allowedUris.add(String(attachment.url));
      }
      for (const row of ticketMessages || []) {
        for (const attachment of row.attachments || []) {
          if (attachment?.url && isSafePrivateFileUri(attachment.url)) allowedUris.add(String(attachment.url));
        }
      }

      const requestedUris = requestedBatch.length ? requestedBatch : [String(fileUri || '')];
      const approved = requestedUris.filter((uri) => allowedUris.has(uri));
      if (!approved.length) {
        if (requestedBatch.length) return Response.json({ signed_urls: {} });
        return Response.json({ error: 'Anexo não pertence a este ticket' }, { status: 403 });
      }

      if (requestedBatch.length) {
        const signedUrls = {};
        const chunkSize = 12;
        for (let start = 0; start < approved.length; start += chunkSize) {
          const chunk = approved.slice(start, start + chunkSize);
          const results = await Promise.all(chunk.map(async (uri) => {
            try {
              const result = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 900 });
              return result?.signed_url ? [uri, result.signed_url] : null;
            } catch {
              return null;
            }
          }));
          for (const pair of results) if (pair) signedUrls[pair[0]] = pair[1];
        }
        return Response.json({ signed_urls: signedUrls });
      }
    } else if (typeof conversationId === 'string' && conversationId.length > 0 && conversationId.length <= 120) {
      const ownerAudit = user.role === 'owner';
      const conversations = ownerAudit
        ? await base44.asServiceRole.entities.Conversation.filter({ id: conversationId }, '-updated_date', 1)
        : await base44.entities.Conversation.filter({ id: conversationId }, '-updated_date', 1);
      const conversation = conversations?.[0];
      if (!conversation || (!ownerAudit && !(conversation.participants || []).includes(user.id))) {
        return Response.json({ error: 'Conversa não encontrada' }, { status: 404 });
      }

      const rows = await base44.asServiceRole.entities.DirectMessage.filter({ conversation_id: conversationId }, '-created_date', 500).catch(() => []);
      const allowedUris = new Set();
      for (const row of rows || []) {
        if (!ownerAudit && !(row.participants || []).includes(user.id)) continue;
        for (const attachment of row.attachments || []) {
          if (attachment?.url && isSafePrivateFileUri(attachment.url)) allowedUris.add(String(attachment.url));
        }
      }

      const requestedUris = requestedBatch.length ? requestedBatch : [String(fileUri || '')];
      const approved = requestedUris.filter((uri) => allowedUris.has(uri));
      if (!approved.length) {
        if (requestedBatch.length) return Response.json({ signed_urls: {} });
        return Response.json({ error: 'Anexo não pertence a esta conversa' }, { status: 403 });
      }

      if (requestedBatch.length) {
        const signedUrls = {};
        const chunkSize = 12;
        for (let start = 0; start < approved.length; start += chunkSize) {
          const chunk = approved.slice(start, start + chunkSize);
          const results = await Promise.all(chunk.map(async (uri) => {
            try {
              const result = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 900 });
              return result?.signed_url ? [uri, result.signed_url] : null;
            } catch {
              return null;
            }
          }));
          for (const pair of results) if (pair) signedUrls[pair[0]] = pair[1];
        }
        return Response.json({ signed_urls: signedUrls });
      }
    } else {
      return Response.json({ error: 'Destino inválido' }, { status: 400 });
    }

    const res = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri: fileUri,
      expires_in: 900,
    });
    return Response.json({ signed_url: res.signed_url });
  } catch (error) {
    const blocked = securityResponse(error); if (blocked) return blocked;
    return Response.json({ error: 'Falha ao gerar o link do anexo' }, { status: 500 });
  }
}