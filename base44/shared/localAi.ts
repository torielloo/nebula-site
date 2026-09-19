const norm = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const includesAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

export function localSecurityReply(locale = 'pt', attemptCount = 1, temporarilyBanned = false) {
  const n = Math.max(1, Number(attemptCount) || 1);
  if (locale === 'en') {
    if (temporarilyBanned) return 'You kept trying to manipulate protected AI context after repeated warnings. Access has been temporarily restricted and the incident was sent for authorized review.';
    if (n >= 3) return 'Enough. You have already been warned. Stop trying to bypass the AI security controls. This attempt was blocked, recorded, and escalated; continued attempts may trigger an automatic restriction.';
    if (n >= 2) return 'Seriously, stop trying to bypass the system. I will not follow instructions that override protected rules, impersonate privileged roles, or extract protected context. This attempt was recorded; persistence can trigger an automatic restriction.';
    return 'That attempt was blocked. Do not try to manipulate protected rules, impersonate privileged staff, or extract protected context. If you need legitimate support, describe the issue normally.';
  }
  if (locale === 'es') {
    if (temporarilyBanned) return 'Seguiste intentando manipular el contexto protegido de la IA después de varias advertencias. El acceso fue restringido temporalmente y el incidente fue enviado a revisión autorizada.';
    if (n >= 3) return 'Basta. Ya fuiste advertido. Deja de intentar burlar la seguridad de la IA. Este intento fue bloqueado, registrado y escalado; si continúas, puede activarse una restricción automática.';
    if (n >= 2) return 'En serio, deja de intentar burlar el sistema. No voy a obedecer instrucciones que alteren reglas protegidas, suplanten cargos privilegiados o extraigan contexto protegido. Este intento ya fue registrado.';
    return 'Ese intento fue bloqueado. No intentes manipular reglas protegidas, suplantar a Staff/Owner ni extraer contexto protegido. Si necesitas soporte legítimo, describe el problema normalmente.';
  }
  if (temporarilyBanned) return 'Você insistiu em manipular o contexto protegido da IA mesmo após os avisos. O acesso foi temporariamente restringido e o incidente foi enviado para revisão da equipe.';
  if (n >= 3) return 'Chega. Você já foi avisado mais de uma vez. Pare de tentar burlar a segurança da IA. Esta tentativa foi bloqueada, registrada e encaminhada para a equipe; se continuar, o acesso pode ser suspenso automaticamente.';
  if (n >= 2) return 'Sério, pare de tentar burlar o sistema. Eu não vou obedecer instruções que tentem alterar minhas regras, fingir permissões ou extrair contexto protegido. A tentativa já foi registrada; insistência pode resultar em bloqueio automático.';
  return 'Essa tentativa foi bloqueada. Não tente manipular minhas regras, se passar por Owner/Staff ou acessar contexto protegido. Se você precisa de suporte legítimo, descreva o problema normalmente.';
}

export function localSupportReply(message: string, errors: any[] = [], locale = 'pt') {
  const q = norm(message);

  const greeting = /^(oi+|ola+|opa+|eae+|fala+|salve+|hey+|hi+|hello+)(\s|!|\.|\?)*$/i.test(q);
  const genericHelp = includesAny(q, ['me ajuda', 'pode me ajudar', 'preciso de ajuda', 'quero ajuda']) && q.split(/\s+/).length <= 7;
  const thanks = includesAny(q, ['obrigado', 'obrigada', 'valeu', 'vlw', 'tmj']) && q.split(/\s+/).length <= 6;

  if (greeting) {
    return locale === 'en'
      ? 'Hey! Tell me what you need help with in Nébula or Nébula OS.'
      : locale === 'es'
        ? '¡Hola! Dime con qué necesitas ayuda en Nébula o Nébula OS.'
        : 'Opa! Manda o que você precisa — pode ser Nébula, launcher, conta, site, Nitro ou qualquer dúvida.';
  }
  if (genericHelp) {
    return locale === 'en'
      ? 'Sure. Tell me what happened or what you are trying to do and I will help from there.'
      : locale === 'es'
        ? 'Claro. Cuéntame qué pasó o qué estás intentando hacer y te ayudo desde ahí.'
        : 'Claro. Me conta o que aconteceu ou o que você está tentando fazer e eu te ajudo a partir daí.';
  }
  if (thanks) {
    return locale === 'en' ? 'Anytime. Send the next question when you want.' : locale === 'es' ? 'De nada. Manda la próxima duda cuando quieras.' : 'Tamo junto. Pode mandar a próxima dúvida quando quiser.';
  }

  const tokens = q.split(/\s+/).filter((x) => x.length >= 3);
  let best: any = null;
  let bestScore = 0;

  for (const row of errors || []) {
    const hay = norm([row.title, row.code, row.meaning, row.cause, row.identification, row.solution].filter(Boolean).join(' '));
    let score = 0;
    if (row.code && q.includes(norm(row.code))) score += 20;
    if (row.title && q.includes(norm(row.title))) score += 10;
    for (const token of tokens) if (hay.includes(token)) score += 1;
    if (score > bestScore) { best = row; bestScore = score; }
  }

  if (best && bestScore >= 2) {
    const title = String(best.title || best.code || 'erro').trim();
    const cause = String(best.cause || best.meaning || '').trim();
    const solution = String(best.solution || '').trim();
    if (locale === 'en') return `I found a matching known issue: ${title}. ${cause ? `Likely cause: ${cause}. ` : ''}${solution ? `Recommended fix: ${solution}` : 'Open a ticket if it continues.'}`.slice(0, 5000);
    if (locale === 'es') return `Encontré un problema conocido compatible: ${title}. ${cause ? `Causa probable: ${cause}. ` : ''}${solution ? `Solución recomendada: ${solution}` : 'Abre un ticket si continúa.'}`.slice(0, 5000);
    return `Encontrei um problema conhecido compatível: ${title}. ${cause ? `Causa provável: ${cause}. ` : ''}${solution ? `Solução recomendada: ${solution}` : 'Abra um ticket se continuar.'}`.slice(0, 5000);
  }

  if (includesAny(q, ['ticket', 'chamado', 'staff', 'atendimento'])) {
    return locale === 'en'
      ? 'I could not match this to a known issue. Open /tickets and send the error details, what you were doing, and any code shown.'
      : locale === 'es'
        ? 'No encontré una coincidencia clara en la base conocida. Abre /tickets y envía el error, qué estabas haciendo y cualquier código mostrado.'
        : 'Não encontrei uma correspondência clara na base conhecida. Abra /tickets e envie o erro, o que você estava fazendo e qualquer código exibido.';
  }

  return locale === 'en'
    ? 'I could not identify this safely from the local knowledge base yet. Send the exact error message or code and I will compare it with the known issues.'
    : locale === 'es'
      ? 'Aún no pude identificarlo con seguridad usando la base local. Envía el mensaje o código exacto del error para compararlo con los problemas conocidos.'
      : 'Posso te ajudar com isso. Me conta um pouco mais do que aconteceu ou manda a mensagem/código que apareceu; também posso responder dúvidas gerais sobre o Nébula normalmente.';
}

function quoted(text: string) {
  const match = text.match(/["“”']([^"“”']{1,5000})["“”']/);
  return match?.[1]?.trim() || '';
}

function extractId(text: string, labels: string[] = []) {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*(?:id)?\\s*[:#=-]?\\s*([a-zA-Z0-9_-]{6,120})`, 'i');
    const m = text.match(re);
    if (m?.[1]) return m[1];
  }
  const explicit = text.match(/\b(?:id|#)\s*[:=-]?\s*([a-zA-Z0-9_-]{6,120})\b/i);
  return explicit?.[1] || '';
}

function extractHours(text: string) {
  const m = text.match(/\b(\d{1,3})\s*(?:h|hora|horas)\b/i);
  return m ? Math.max(1, Math.min(720, Number(m[1]))) : 0;
}

function extractStatus(q: string, kind: 'ticket' | 'report' | 'verification') {
  const maps: Record<string, Array<[string[], string]>> = {
    ticket: [
      [['novo', 'aberto'], 'novo'], [['em atendimento', 'atendimento'], 'em_atendimento'],
      [['aguardando usuario', 'aguardando usuário'], 'aguardando_usuario'],
      [['resolvido', 'resolver'], 'resolvido'], [['fechado', 'fechar'], 'fechado'],
    ],
    report: [
      [['pending', 'pendente'], 'pending'], [['new', 'nova', 'novo'], 'new'], [['em revisao', 'em revisão'], 'in_review'],
      [['aguardando info', 'aguardando informação'], 'awaiting_info'], [['confirmada', 'confirmado'], 'confirmed'],
      [['aprovada', 'aprovado'], 'approved'], [['rejeitada', 'rejeitado'], 'rejected'], [['resolvida', 'resolvido'], 'resolved'],
    ],
    verification: [
      [['aguardando usuario', 'aguardando usuário'], 'awaiting_user'], [['agendada', 'agendado'], 'scheduled'],
      [['em revisao', 'em revisão'], 'in_review'], [['aguardando staff'], 'awaiting_staff'],
      [['aprovada', 'aprovado'], 'approved'], [['rejeitada', 'rejeitado'], 'rejected'], [['cancelada', 'cancelado'], 'cancelled'],
    ],
  };
  for (const [terms, value] of maps[kind]) if (includesAny(q, terms)) return value;
  return '';
}

function extractPriority(q: string) {
  if (includesAny(q, ['urgente', 'urgent'])) return 'urgent';
  if (includesAny(q, ['alta', 'high'])) return 'high';
  if (includesAny(q, ['baixa', 'low'])) return 'low';
  if (includesAny(q, ['normal'])) return 'normal';
  return '';
}

function latestKnownId(context: string, labels: string[]) {
  const all = String(context || '');
  for (const label of labels) {
    const re = new RegExp(`${label}[^\\n]{0,80}?([a-zA-Z0-9_-]{6,120})`, 'ig');
    const matches = [...all.matchAll(re)];
    const value = matches.at(-1)?.[1];
    if (value) return value;
  }
  return '';
}


function previousUserMessage(context: string, current: string) {
  const lines = String(context || '').split('\n')
    .filter((line) => line.startsWith('Usuário:'))
    .map((line) => line.replace(/^Usuário:\s*/, '').trim())
    .filter(Boolean);
  const currentNorm = norm(current);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (norm(lines[i]) !== currentNorm) return lines[i];
  }
  return '';
}

function conversationalCoreReply(raw: string, q: string, isOwner: boolean, context: string) {
  const previous = previousUserMessage(context, raw);

  if (!q || q === '?' || q === '??' || q === '???') {
    return 'Pode mandar. Diga o que você quer que eu faça no Nébula OS — por exemplo, consultar tickets, mexer em um usuário, revisar segurança, alterar uma página ou executar uma ação administrativa.';
  }

  if (includesAny(q, ['oq vc faz', 'o que vc faz', 'o que voce faz', 'o que você faz', 'quais suas funcoes', 'quais suas funções', 'do que voce e capaz', 'do que você é capaz'])) {
    return isOwner
      ? 'Eu consigo operar o Nébula OS com você: consultar e atualizar tickets, usuários, denúncias e verificações; revisar segurança e logs; aplicar punições; controlar manutenção; editar avisos, páginas e partes da configuração global; verificar serviços protegidos; navegar pelos painéis e executar outras ações administrativas suportadas. Para ações críticas, eu peço confirmação antes de executar.'
      : 'Eu consigo ajudar a operar o Nébula OS dentro das suas permissões: consultar tickets, usuários, denúncias e verificações, navegar pelos painéis, atualizar itens permitidos e executar ações de Staff autorizadas. Se uma ação exigir Owner ou outra permissão que você não tenha, eu aviso.';
  }

  if (includesAny(q, ['quem e voce', 'quem é você', 'vc e quem', 'voce e ia', 'você é ia', 'vc e ia'])) {
    return 'Sou a Core OS, assistente operacional do Nébula OS. Posso conversar sobre o sistema e, quando seu pedido corresponde a uma ação autorizada, também executar essa ação no backend.';
  }

  if (includesAny(q, ['prompt guard'])) {
    return 'O Prompt Guard · Core OS protege os chats contra prompt injection, tentativas de extrair segredos, falsificação de cargo e pedidos administrativos indevidos. Ele isola conteúdo suspeito antes do modelo e registra o incidente para revisão autorizada no Centro de Segurança.';
  }

  if (includesAny(q, ['core security ai', 'relatorios da core security', 'relatórios da core security', 'security ai'])) {
    return 'A Core Security AI analisa eventos de segurança do Nébula OS, estima risco e gera relatórios/recomendações para o Centro de Segurança. A IA pode ajudar na análise, mas medidas como bloqueio ou punição continuam passando pelas permissões e decisões autorizadas.';
  }

  if (includesAny(q, ['discord do nebula', 'discord oficial', 'qual o discord'])) {
    return 'O Discord oficial do Nébula é https://discord.gg/nebulaogfn.';
  }

  if (includesAny(q, ['como abrir ticket', 'como criar ticket', 'abrir um ticket', 'criar um ticket'])) {
    return 'Para abrir um ticket, entre em /tickets, escolha a categoria do problema, descreva o que aconteceu e envie. Se tiver um erro, inclua a mensagem ou código exato.';
  }

  if (includesAny(q, ['preciso que faca', 'preciso que faça', 'quero que faca', 'quero que faça', 'faz pra mim', 'faça pra mim']) && q.split(/\s+/).length <= 7) {
    return 'Faço sim. Me diga exatamente o que você quer alterar ou consultar. Se envolver um ticket, usuário, denúncia ou caso específico, mande também o ID ou o nome que aparece no painel.';
  }

  if (['oi', 'ola', 'olá', 'eae', 'eai', 'opa', 'fala', 'salve', 'bom dia', 'boa tarde', 'boa noite'].some((g) => q === norm(g) || q.startsWith(`${norm(g)} `)) && q.split(/\s+/).length <= 7) {
    if (includesAny(q, ['tudo bem', 'como voce ta', 'como você ta', 'como vai'])) {
      return 'Tudo bem por aqui 😄 E com você? Pode conversar comigo normalmente ou pedir ajuda com qualquer coisa do Nébula OS.';
    }
    return 'Oi! Tudo certo? Pode falar comigo normalmente — se quiser conversar, tirar uma dúvida ou fazer algo no Nébula OS, manda aí.';
  }

  if (/^(tudo bem|td bem|como voce ta|como você ta|como vai|de boa|tranquilo)[?!.,\s]*$/i.test(raw)) {
    return 'Tudo bem por aqui 😄 E com você? Pode conversar comigo normalmente.';
  }

  if (includesAny(q, ['obrigado', 'valeu', 'vlw', 'tmj'])) {
    return 'Disponha. Se quiser continuar alguma ação no painel, pode mandar o próximo comando.';
  }

  if (includesAny(q, ['faz isso', 'faça isso', 'pode fazer', 'pode executar', 'executa', 'execute']) && q.split(/\s+/).length <= 5) {
    if (previous && !includesAny(norm(previous), ['oq vc faz', 'o que vc faz', 'o que voce faz', 'o que você faz'])) {
      return '';
    }
    return 'Posso. Só preciso que você diga qual ação exatamente quer que eu execute.';
  }

  if (includesAny(q, ['ajuda', 'me ajuda']) && q.split(/\s+/).length <= 5) {
    return 'Claro. Me diga o que está acontecendo ou o que você quer mudar. Se for algo do painel, eu tento resolver diretamente por aqui.';
  }

  return '';
}

export function localCorePlan(message: string, isOwner: boolean, context = '') {
  let raw = String(message || '').trim();
  let q = norm(raw);
  const prior = previousUserMessage(context, raw);
  const continuationOnly = includesAny(q, ['faz isso', 'faça isso', 'pode fazer', 'pode executar', 'executa', 'execute', 'sim pode', 'pode sim'])
    && q.split(/\s+/).length <= 5;
  if (continuationOnly && prior && !includesAny(norm(prior), ['oq vc faz', 'o que vc faz', 'o que voce faz', 'o que você faz', 'quem e voce', 'quem é você'])) {
    raw = prior;
    q = norm(raw);
  }
  const actions: any[] = [];
  const conversational = conversationalCoreReply(raw, q, isOwner, context);
  if (conversational) return { reply: conversational, actions: [] };
  const add = (type: string, params: any = {}) => actions.push({ type, params });
  const done = (reply: string) => ({ reply, actions });

  const ticketId = extractId(raw, ['ticket', 'chamado']) || latestKnownId(context, ['ticket', 'chamado']);
  const userId = extractId(raw, ['usuario', 'usuário', 'user', 'membro']) || latestKnownId(context, ['usuario', 'usuário', 'user']);
  const reportId = extractId(raw, ['report', 'denuncia', 'denúncia']) || latestKnownId(context, ['report', 'denuncia', 'denúncia']);
  const caseId = extractId(raw, ['caso', 'verificacao', 'verificação']) || latestKnownId(context, ['caso', 'verificacao', 'verificação']);
  const eventId = extractId(raw, ['evento', 'incident', 'incidente']) || latestKnownId(context, ['evento', 'incidente']);
  const messageId = extractId(raw, ['mensagem']);
  const fingerprint = raw.match(/\b[a-f0-9]{64}\b/i)?.[0]?.toLowerCase() || '';

  if (includesAny(q, ['servicos protegidos', 'serviços protegidos', 'status do pix', 'pix funcionando', 'oauth', 'discord oauth'])) {
    add('protected_services_status');
  }

  const queryMap: Array<[string[], string]> = [
    [['ticket', 'chamado'], 'tickets'], [['usuario', 'usuário', 'user', 'membro'], 'users'],
    [['denuncia', 'denúncia', 'report'], 'reports'], [['seguranca', 'segurança', 'incidente'], 'security_events'],
    [['bloqueio', 'fingerprint bloqueada'], 'security_blocks'], [['punicao', 'punição', 'ban'], 'punishments'],
    [['verificacao', 'verificação'], 'verification_cases'], [['log', 'auditoria'], 'logs'],
    [['discord'], 'discord_connections'], [['nitro'], 'nitro_requests'], [['download'], 'downloads'],
    [['configuracao', 'configuração', 'setting'], 'settings'],
  ];
  if (includesAny(q, ['listar', 'mostrar', 'consultar', 'buscar', 'procurar', 'recentes', 'recente', 'quantos', 'status de'])) {
    for (const [terms, resource] of queryMap) {
      if (includesAny(q, terms)) {
        const search = quoted(raw);
        add('server_query', { resource, limit: 10, ...(search ? { search } : {}) });
        break;
      }
    }
  }

  if (includesAny(q, ['abrir', 'ir para', 'me leve', 'levar', 'navegar'])) {
    if (ticketId && includesAny(q, ['ticket', 'chamado'])) add('navigate_to', { destination: 'ticket', ticket_id: ticketId });
    else if (userId && includesAny(q, ['usuario', 'usuário', 'perfil'])) add('navigate_to', { destination: 'user', user_id: userId });
    else {
      const navs: Array<[string[], string]> = [
        [['tickets', 'chamados', 'ticket'], 'tickets'], [['seguranca', 'segurança'], 'security'],
        [['usuarios', 'usuários', 'usuario', 'usuário'], 'users'], [['mensagem', 'mensagens'], 'messages'],
        [['call', 'calls', 'ligacao', 'ligação'], 'calls'], [['verificacao', 'verificação'], 'verification'],
        [['denuncia', 'denúncia', 'reports'], 'reports'], [['painel'], 'panel'], [['core os'], 'core_os'],
      ];
      for (const [terms, destination] of navs) if (includesAny(q, terms)) { add('navigate_to', { destination }); break; }
    }
  }

  if (includesAny(q, ['ticket', 'chamado']) && ticketId) {
    const status = extractStatus(q, 'ticket');
    const priority = extractPriority(q);
    const subjectMatch = raw.match(/(?:renome(?:ar|ie)|assunto|titulo|título)\s+(?:para\s+)?["“”']?([^"“”']{2,120})/i);
    if (status || priority || subjectMatch?.[1]) add('update_ticket', {
      ticket_id: ticketId,
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(subjectMatch?.[1] ? { subject: subjectMatch[1].trim() } : {}),
    });
    if (includesAny(q, ['apagar ticket', 'deletar ticket', 'excluir ticket', 'arquivar ticket'])) {
      add('delete_ticket', { ticket_id: ticketId, reason: quoted(raw) || 'Solicitado pelo Core OS' });
    }
    const send = raw.match(/(?:enviar|mande|responder|responda)\s+(?:no\s+)?(?:ticket|chamado)?[^"“”']*["“”']([^"“”']{1,5000})["“”']/i);
    if (send?.[1]) add('send_ticket_message', { ticket_id: ticketId, message: send[1].trim() });
    const edit = raw.match(/(?:editar|altere)\s+(?:a\s+)?mensagem[^"“”']*["“”']([^"“”']{1,5000})["“”']/i);
    if (edit?.[1] && messageId) add('edit_ticket_message', { ticket_id: ticketId, message_id: messageId, message: edit[1].trim() });
    if (messageId && includesAny(q, ['apagar mensagem', 'deletar mensagem', 'remover mensagem'])) add('delete_ticket_message', { ticket_id: ticketId, message_id: messageId });
  }

  if (reportId && includesAny(q, ['denuncia', 'denúncia', 'report'])) {
    const status = extractStatus(q, 'report');
    const priority = extractPriority(q);
    const resolution = quoted(raw);
    if (status || priority || resolution) add('update_report', { report_id: reportId, ...(status ? { status } : {}), ...(priority ? { priority } : {}), ...(resolution ? { resolution } : {}) });
  }

  if (caseId && includesAny(q, ['verificacao', 'verificação', 'caso'])) {
    const status = extractStatus(q, 'verification');
    if (status) add('update_verification', { case_id: caseId, status, resolution: quoted(raw) });
  }

  if (userId) {
    const roleMap: Array<[string[], string]> = [
      [['support', 'suporte'], 'support'], [['moderator', 'moderador'], 'moderator'], [['admin', 'administrador'], 'admin'],
      [['staff'], 'staff'], [['dev', 'developer'], 'dev'], [['usuario comum', 'usuário comum', 'user'], 'user'],
    ];
    if (includesAny(q, ['cargo', 'promover', 'rebaixar', 'tornar', 'mudar role', 'alterar role'])) {
      const role = roleMap.find(([terms]) => includesAny(q, terms))?.[1];
      if (role) add('set_user_role', { user_id: userId, role });
    }
    if (includesAny(q, ['verificacao', 'verificação']) && includesAny(q, ['pedir', 'solicitar', 'forcar', 'forçar', 'abrir'])) {
      add('request_verification', {
        user_id: userId,
        reason_internal: quoted(raw) || 'Solicitado pelo Core OS',
        reason_public: 'Sua conta precisa passar por uma revisão adicional.',
      });
    }
    const noteMatch = raw.match(/(?:nota|observacao|observação)\s+(?:de\s+moderacao|de\s+moderação)?[^"“”']*["“”']([^"“”']{1,3000})["“”']/i);
    if (noteMatch?.[1]) add('add_moderation_note', { user_id: userId, content: noteMatch[1].trim(), category: includesAny(q, ['seguranca', 'segurança']) ? 'security' : 'general' });

    if (isOwner && includesAny(q, ['banir', 'ban ', 'mutar', 'mute', 'kick', 'expulsar', 'tempban', 'ban temporario', 'ban temporário'])) {
      let type = includesAny(q, ['mutar', 'mute']) ? 'mute' : includesAny(q, ['kick', 'expulsar']) ? 'kick' : includesAny(q, ['tempban', 'temporario', 'temporário']) ? 'tempban' : 'ban';
      add('punish_user', { user_id: userId, type, reason: quoted(raw) || 'Medida solicitada pelo Core OS', ...(extractHours(q) ? { duration_hours: extractHours(q) } : {}) });
    }
  }

  if (isOwner) {
    if (includesAny(q, ['manutencao', 'manutenção'])) {
      if (includesAny(q, ['ativar', 'ligar', 'entrar em'])) add('set_maintenance', { enabled: true, message: quoted(raw) });
      if (includesAny(q, ['desativar', 'desligar', 'sair da'])) add('set_maintenance', { enabled: false });
    }

    if (eventId && includesAny(q, ['revisar evento', 'marcar revisado', 'revisar incidente'])) add('review_security_event', { event_id: eventId, notes: quoted(raw) });
    if (fingerprint && includesAny(q, ['bloquear', 'block'])) add('block_security_fingerprint', { fingerprint, hours: extractHours(q) || 24, reason: quoted(raw) || 'Bloqueio solicitado pelo Core OS', ...(eventId ? { event_id: eventId } : {}) });
    if (fingerprint && includesAny(q, ['desbloquear', 'unblock'])) add('unblock_security_fingerprint', { fingerprint });

    const pageTitle = raw.match(/(?:criar|publicar|editar|atualizar)\s+(?:uma\s+)?pagina\s+["“”']([^"“”']{2,120})["“”']/i)?.[1];
    if (pageTitle && includesAny(q, ['pagina', 'página'])) {
      const slugMatch = raw.match(/(?:slug|url)\s*[:=]?\s*([a-z0-9_-]{2,80})/i);
      const bodyMatch = raw.match(/(?:conteudo|conteúdo|texto)\s*[:=]?\s*["“”']([^"“”']{1,12000})["“”']/i);
      add('site_page_upsert', { title: pageTitle, slug: slugMatch?.[1] || '', body: bodyMatch?.[1] || '', show_in_nav: true, enabled: true });
    }
    const deletePage = raw.match(/(?:apagar|deletar|remover)\s+(?:a\s+)?pagina\s+(?:\/p\/)?([a-z0-9_-]{2,80})/i);
    if (deletePage?.[1]) add('site_page_delete', { slug: deletePage[1] });

    const announcement = raw.match(/(?:aviso|anuncio|anúncio)\s+global[^"“”']*["“”']([^"“”']{1,500})["“”']/i);
    if (announcement?.[1]) add('site_editor_patch', { announcement: { enabled: true, text: announcement[1].trim() } });
    if (includesAny(q, ['desativar aviso global', 'remover aviso global', 'ocultar aviso global'])) add('site_editor_patch', { announcement: { enabled: false } });

    const brandName = raw.match(/(?:nome da marca|nome do site)\s+(?:para\s+)?["“”']([^"“”']{1,60})["“”']/i);
    if (brandName?.[1]) add('site_editor_patch', { brand: { name: brandName[1].trim() } });

    const persona = raw.match(/(?:nome da core|persona)\s+(?:para\s+)?["“”']([^"“”']{1,40})["“”']/i);
    const tone = raw.match(/(?:tom|tone)\s+(?:para\s+)?["“”']([^"“”']{1,400})["“”']/i);
    if (persona?.[1] || tone?.[1]) add('update_core', { ...(persona?.[1] ? { persona_name: persona[1].trim() } : {}), ...(tone?.[1] ? { tone: tone[1].trim() } : {}) });

    const patchVersion = raw.match(/(?:patch note|patch)\s+(?:versao|versão)?\s*([a-zA-Z0-9._-]{1,20})/i)?.[1];
    const patchTitle = raw.match(/(?:titulo|título)\s*["“”']([^"“”']{1,120})["“”']/i)?.[1];
    if (patchVersion && patchTitle && includesAny(q, ['criar patch', 'publicar patch', 'patch note'])) add('create_patch_note', { version: patchVersion, title: patchTitle, notes: quoted(raw) || '', publish: !includesAny(q, ['rascunho', 'draft']) });
  }

  if (!isOwner && actions.some((a) => ['set_maintenance','update_core','site_editor_patch','site_page_upsert','site_page_delete','punish_user','block_security_fingerprint','unblock_security_fingerprint','review_security_event','create_patch_note'].includes(a.type))) {
    return { reply: 'Essa ação exige permissão de Owner. Sua sessão atual não pode executá-la.', actions: actions.filter((a) => !['set_maintenance','update_core','site_editor_patch','site_page_upsert','site_page_delete','punish_user','block_security_fingerprint','unblock_security_fingerprint','review_security_event','create_patch_note'].includes(a.type)) };
  }

  if (actions.length) return done(actions.length > 1 ? `Entendi. Preparei ${actions.length} ações compatíveis com seu pedido.` : 'Entendi. Preparei a ação compatível com seu pedido.');

  return {
    reply: 'Pode falar comigo normalmente. Se for uma dúvida, eu respondo; se quiser consultar ou alterar algo do Nébula OS, me diga o que você precisa e eu tento resolver dentro das suas permissões.',
    actions: [],
  };
}

export function localOriginalLyrics(title: string, idea: string) {
  const theme = String(idea || title || 'noite e movimento').trim().slice(0, 160);
  const hook = theme || 'noite e movimento';
  return [
    '[Intro]',
    `Luzes baixas, sigo o som, penso em ${hook}`,
    'Passo lento, mente acesa, deixando o mundo para trás',
    '',
    '[Verso 1]',
    'Cidade em silêncio, meu pulso marca o tempo',
    'Cada curva vira história, cada escolha vira vento',
    `Carrego ${hook} como um sinal no peito`,
    'Sem copiar caminhos, eu desenho o meu jeito',
    '',
    '[Refrão]',
    'Vai, deixa a noite responder',
    'Se o grave bate forte, eu não vou me esconder',
    `Entre o agora e ${hook}, eu escolho permanecer`,
    'Tudo muda quando eu decido acontecer',
    '',
    '[Verso 2]',
    'Sem mapa pronto, sem promessa decorada',
    'Só verdade no compasso e a cabeça levantada',
    'Se o mundo fecha portas, eu transformo em direção',
    'Faço espaço no ruído e sigo a intuição',
    '',
    '[Ponte]',
    'Se apagar a luz, eu ainda vejo o caminho',
    'Se o som parar, eu continuo sozinho',
    '',
    '[Refrão]',
    'Vai, deixa a noite responder',
    'Se o grave bate forte, eu não vou me esconder',
    `Entre o agora e ${hook}, eu escolho permanecer`,
    'Tudo muda quando eu decido acontecer',
  ].join('\n').slice(0, 20000);
}
