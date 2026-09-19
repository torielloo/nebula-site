import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const STAFF_ROLES = new Set(['owner', 'dev', 'admin', 'moderator', 'support', 'staff']);
const OPEN_STATUSES = new Set(['novo', 'em_atendimento', 'aguardando_usuario']);

function clean(value: unknown, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeTranscript(value: string) {
  return clean(value, 1200)
    .replace(/\s+/g, ' ')
    .trim();
}

function transcriptKey(value: string) {
  return normalizeTranscript(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function suspiciousTranscript(value: string) {
  const normalized = transcriptKey(value);
  if (!normalized) return true;
  return /(saudacoes|todos os sistemas|estabilidade|como posso ajudar|nao consigo acessar|nao posso transcrever|como ia|sou uma ia|audio anexado|transcricao do audio|core os esta online)/.test(normalized);
}

function transcriptSimilarity(a: string, b: string) {
  const left = new Set(transcriptKey(a).split(' ').filter(Boolean));
  const right = new Set(transcriptKey(b).split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach((token) => { if (right.has(token)) intersection += 1; });
  return intersection / Math.max(left.size, right.size);
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || !STAFF_ROLES.has(user.role)) {
      return Response.json({ error: 'Acesso restrito à equipe Nébula OS' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action, 40);
    await guardRequest(req, base44, {
      route: 'staffCallAssistant',
      user,
      body,
      strict: true,
      limit: 30,
      windowMs: 60_000,
      maxBodyBytes: 20_000,
    });

    const svc = base44.asServiceRole;

    if (action === 'ticket_count') {
      const rows = await svc.entities.Ticket.list('-created_date', 500).catch(() => []);
      const tickets = (rows || []).filter((ticket: any) => ticket.deleted !== true);
      const open = tickets.filter((ticket: any) => OPEN_STATUSES.has(ticket.status || 'novo'));
      const byStatus = open.reduce((acc: any, ticket: any) => {
        const status = ticket.status || 'novo';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      const novo = byStatus.novo || 0;
      const totalLabel = open.length === 1 ? '1 ticket aberto' : `${open.length} tickets abertos`;
      const novoLabel = novo === 1 ? '1 novo' : `${novo} novos`;
      const reply = `Há ${totalLabel} agora: ${novoLabel}, ${byStatus.em_atendimento || 0} em atendimento e ${byStatus.aguardando_usuario || 0} aguardando usuário.`;
      return Response.json({
        ok: true,
        reply,
        counts: {
          open: open.length,
          novo: byStatus.novo || 0,
          em_atendimento: byStatus.em_atendimento || 0,
          aguardando_usuario: byStatus.aguardando_usuario || 0,
        },
      });
    }

    if (action === 'transcribe') {
      return Response.json({
        ok: false,
        provider: 'local',
        error: 'Transcrição por IA externa está desativada para não consumir créditos. Use texto ou a transcrição nativa do navegador quando disponível.',
      }, { status: 422 });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    const guarded = securityResponse(error);
    if (guarded) return guarded;
    return Response.json({ error: 'Falha na Staff Call' }, { status: 500 });
  }
}
