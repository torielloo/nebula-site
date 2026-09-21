const PRIVILEGED_ROLES = new Set(['owner','dev','admin','moderator','support','staff']);
const ROOT_TRUSTED_OWNER_IDS = new Set([
  '6aa8bd709a3f3389263599fc', // spohrerik25
  '6aa871f92fc944843b07b852', // Bernado 3
]);

function nameOf(user:any) {
  return user?.profile?.display_name || user?.profile?.name || user?.full_name || user?.email || user?.id || 'Owner';
}

export async function getOwnerTrustState(base44:any, user:any) {
  if (!user || user.role !== 'owner') return { trusted: true, status: 'not_owner', conversationId: '' };

  // Raízes confiáveis conhecidas nunca entram em quarentena automática.
  if (ROOT_TRUSTED_OWNER_IDS.has(String(user.id || ''))) {
    return { trusted: true, status: 'trusted_root', conversationId: '' };
  }

  const svc = base44.asServiceRole;
  const trustedRows = await svc.entities.OwnerTrustRecord
    .filter({ user_id: user.id, status: 'trusted' }, '-updated_date', 20)
    .catch(() => []);
  const revokedRows = await svc.entities.OwnerTrustRecord
    .filter({ user_id: user.id, status: 'revoked' }, '-updated_date', 20)
    .catch(() => []);

  const latestTrusted = trustedRows?.[0] || null;
  const latestRevoked = revokedRows?.[0] || null;
  const trustedAt = new Date(latestTrusted?.updated_date || latestTrusted?.created_date || latestTrusted?.granted_at || 0).getTime();
  const revokedAt = new Date(latestRevoked?.updated_date || latestRevoked?.created_date || latestRevoked?.reviewed_at || 0).getTime();

  if (latestTrusted && trustedAt >= revokedAt) {
    return { trusted: true, status: 'trusted', record: latestTrusted, conversationId: latestTrusted.incident_conversation_id || '' };
  }

  const quarantinedRows = await svc.entities.OwnerTrustRecord
    .filter({ user_id: user.id, status: 'quarantined' }, '-updated_date', 20)
    .catch(() => []);
  const latest = quarantinedRows?.[0] || null;
  if (latest?.incident_conversation_id) {
    return { trusted: false, status: 'quarantined', record: latest, conversationId: latest.incident_conversation_id };
  }

  const owners = await svc.entities.User.filter({ role: 'owner' }, '-updated_date', 100).catch(() => []);
  const trustRows = await svc.entities.OwnerTrustRecord.list('-created_date', 500).catch(() => []);
  const trustedIds = new Set(
    (trustRows || [])
      .filter((row:any) => row.status === 'trusted')
      .map((row:any) => String(row.user_id || ''))
      .filter(Boolean)
  );

  const trustedOwners = (owners || []).filter((owner:any) => owner.id !== user.id && trustedIds.has(owner.id));
  const participants = [...new Set([user.id, ...trustedOwners.map((owner:any) => owner.id)])];
  const participantMeta = participants.map((id:string) => {
    const owner = (owners || []).find((item:any) => item.id === id) || (id === user.id ? user : null);
    return { id, name: nameOf(owner) };
  });

  let conversation:any = null;
  try {
    conversation = await svc.entities.Conversation.create({
      participants,
      participant_meta: participantMeta,
      last_message: 'Incidente de confiança: conta Owner sem cadeia de autorização verificada.',
      last_sender_id: 'owner-trust-guard',
    });

    await svc.entities.DirectMessage.create({
      conversation_id: conversation.id,
      sender_id: 'owner-trust-guard',
      sender_name: 'Nébula Security',
      content: [
        '⚠️ Incidente de confiança de Owner.',
        `A conta ${nameOf(user)} (${user.id}) está com role=owner, mas não possui uma concessão trusted registrada pelo fluxo oficial de transferência.`,
        'O cargo NÃO foi removido e a conta NÃO foi banida automaticamente.',
        'Ações administrativas sensíveis ficam temporariamente restritas até um Owner confiável revisar o caso.',
        'Owners confiáveis: revisem a origem do cargo e regularizem a cadeia de confiança antes de liberar ações críticas.',
      ].join('\n'),
      participants,
    });
  } catch {}

  const reason = 'Owner detectado sem cadeia de autorização trusted registrada pelo fluxo oficial.';
  let record:any = latest;
  try {
    const data = {
      user_id: user.id,
      status: 'quarantined',
      granted_by_owner_id: '',
      granted_by_owner_name: '',
      grant_source: 'unverified_owner_detected',
      granted_at: new Date().toISOString(),
      reason,
      incident_conversation_id: conversation?.id || latest?.incident_conversation_id || '',
    };
    if (latest?.id) record = await svc.entities.OwnerTrustRecord.update(latest.id, data);
    else record = await svc.entities.OwnerTrustRecord.create(data);
  } catch {}

  const contextUrl = conversation?.id ? `/mensagens?conversation=${encodeURIComponent(conversation.id)}` : '/mensagens';
  const recipients = [...trustedOwners, user];
  await Promise.all(recipients.map((recipient:any) =>
    svc.entities.UserNotification.create({
      recipient_user_id: recipient.id,
      actor_user_id: 'owner-trust-guard',
      actor_name: 'Nébula Security',
      type: 'system',
      title: recipient.id === user.id ? 'Revisão temporária de acesso Owner' : 'Alerta: Owner sem cadeia de confiança',
      body: recipient.id === user.id
        ? 'Seu cargo Owner foi detectado sem uma concessão oficial registrada. Nenhum ban foi aplicado. Abra o chat de incidente para revisão com os Owners.'
        : `A conta ${nameOf(user)} apareceu como Owner sem proveniência oficial registrada. Abra o chat de incidente para revisar.`,
      context_url: contextUrl,
      context_type: 'owner_trust_incident',
      context_id: conversation?.id || user.id,
      read: false,
      dedupe_key: `owner-trust:${user.id}:${recipient.id}`,
    }).catch(() => null)
  ));

  await svc.entities.StaffLog.create({
    actor_name: 'Nébula Owner Trust Guard',
    actor_id: 'owner-trust-guard',
    action: 'owner_quarantined_unverified',
    details: reason,
    target_id: user.id,
  }).catch(() => null);

  return {
    trusted: false,
    status: 'quarantined',
    record,
    conversationId: conversation?.id || latest?.incident_conversation_id || '',
  };
}

export async function recordTrustedOwnerTransfer(svc:any, actor:any, target:any) {
  if (!actor || actor.role !== 'owner' || !target?.id) throw new Error('transferência de confiança inválida');
  const actorTrust = await svc.entities.OwnerTrustRecord.filter({ user_id: actor.id }, '-created_date', 20).catch(() => []);
  if (actorTrust?.[0]?.status !== 'trusted') throw new Error('Owner atual não possui cadeia de confiança validada');

  const existing = await svc.entities.OwnerTrustRecord.filter({ user_id: target.id }, '-created_date', 20).catch(() => []);
  const data = {
    user_id: target.id,
    status: 'trusted',
    granted_by_owner_id: actor.id,
    granted_by_owner_name: nameOf(actor),
    grant_source: 'official_transfer_owner',
    granted_at: new Date().toISOString(),
    reason: 'Cargo Owner concedido por Owner trusted através do fluxo oficial transfer_owner.',
    incident_conversation_id: '',
    reviewed_by_owner_id: actor.id,
    reviewed_at: new Date().toISOString(),
  };
  if (existing?.[0]?.id) await svc.entities.OwnerTrustRecord.update(existing[0].id, data);
  else await svc.entities.OwnerTrustRecord.create(data);

  const old = actorTrust?.[0];
  if (old?.id) {
    await svc.entities.OwnerTrustRecord.update(old.id, {
      status: 'revoked',
      reason: `Owner transferido oficialmente para ${target.id}; conta anterior deixou de ser Owner.`,
      reviewed_by_owner_id: actor.id,
      reviewed_at: new Date().toISOString(),
    }).catch(() => null);
  }
}

export function roleIsPrivileged(role:any) {
  return PRIVILEGED_ROLES.has(String(role || ''));
}
