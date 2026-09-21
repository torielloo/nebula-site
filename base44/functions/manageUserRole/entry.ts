import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';
import { recordTrustedOwnerTransfer } from '../../shared/ownerTrust.ts';

const OWNER_ASSIGNABLE = new Set(['dev', 'admin', 'moderator', 'support', 'staff', 'user']);
const DEV_ASSIGNABLE = new Set(['admin', 'moderator', 'support', 'staff', 'user']);
const ADMIN_ASSIGNABLE = new Set(['moderator', 'support', 'staff', 'user']);

async function staffLog(svc: any, actor: any, action: string, details: string, targetId = '') {
  try {
    await svc.entities.StaffLog.create({
      actor_name: actor.full_name || actor.email || actor.id,
      actor_id: actor.id,
      action,
      details: details.slice(0, 1000),
      target_id: targetId,
    });
  } catch {
    // O log não deve impedir uma alteração válida de cargo.
  }
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me().catch(() => null);
    if (!actor) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, {
      route: 'manageUserRole',
      user: actor,
      body,
      strict: body.action !== 'list_users',
      limit: 12,
      windowMs: 60_000,
      maxBodyBytes: 4_000,
    });

    if (!['owner', 'dev', 'admin'].includes(actor.role)) {
      return Response.json({ error: 'Sem permissão para gerenciar cargos' }, { status: 403 });
    }

    const svc = base44.asServiceRole;

    if (body.action === 'list_users') {
      const rows = await svc.entities.User.list('-created_date', 500);
      const users = (rows || []).map((item: any) => ({
        id: item.id,
        full_name: item.full_name || '',
        email: item.email || '',
        role: item.role || 'user',
        profile: item.profile || null,
        created_date: item.created_date || null,
      }));
      return Response.json({ ok: true, users });
    }

    const targetId = typeof body.target_user_id === 'string' ? body.target_user_id.trim() : '';
    if (!targetId) return Response.json({ error: 'Usuário de destino inválido' }, { status: 400 });

    const targets = await svc.entities.User.filter({ id: targetId }, '-created_date', 1);
    const target = targets?.[0];
    if (!target) return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });

    if (body.action === 'transfer_owner') {
      if (actor.role !== 'owner') {
        return Response.json({ error: 'Somente o owner atual pode transferir a propriedade' }, { status: 403 });
      }
      if (target.id === actor.id) {
        return Response.json({ error: 'Você já é o owner' }, { status: 400 });
      }
      if (target.role === 'owner') {
        return Response.json({ error: 'O usuário selecionado já é owner' }, { status: 400 });
      }

      const previousTargetRole = target.role || 'user';
      await svc.entities.User.update(target.id, { role: 'owner' });
      try {
        await svc.entities.User.update(actor.id, { role: 'dev' });
        await recordTrustedOwnerTransfer(svc, actor, target);
      } catch (error) {
        await svc.entities.User.update(target.id, { role: previousTargetRole }).catch(() => {});
        await svc.entities.User.update(actor.id, { role: 'owner' }).catch(() => {});
        throw error;
      }

      await staffLog(
        svc,
        actor,
        'transferiu_owner',
        `Owner transferido para ${target.email || target.full_name || target.id}; owner anterior passou para dev.`,
        target.id,
      );
      return Response.json({ ok: true, action: 'transfer_owner', new_owner_id: target.id, previous_owner_role: 'dev' });
    }

    if (body.action !== 'change_role') {
      return Response.json({ error: 'Ação inválida' }, { status: 400 });
    }

    const nextRole = typeof body.role === 'string' ? body.role : '';
    const allowed = actor.role === 'owner' ? OWNER_ASSIGNABLE : actor.role === 'dev' ? DEV_ASSIGNABLE : ADMIN_ASSIGNABLE;
    if (!allowed.has(nextRole)) {
      return Response.json({ error: 'Cargo não permitido para seu nível de acesso' }, { status: 403 });
    }
    if (target.role === 'owner') {
      return Response.json({ error: 'O cargo owner só pode ser alterado por transferência de propriedade' }, { status: 403 });
    }
    if (target.id === actor.id) {
      return Response.json({ error: 'Você não pode alterar o próprio cargo por esta ação' }, { status: 403 });
    }
    if (actor.role === 'admin' && ['admin', 'dev', 'owner'].includes(target.role || 'user')) {
      return Response.json({ error: 'Administrador não pode alterar cargos do mesmo nível ou superiores' }, { status: 403 });
    }
    if (actor.role === 'dev' && ['dev', 'owner'].includes(target.role || 'user')) {
      return Response.json({ error: 'DEV não pode alterar outro DEV ou o Owner por este fluxo' }, { status: 403 });
    }

    const previousRole = target.role || 'user';
    if (previousRole === nextRole) return Response.json({ ok: true, unchanged: true });
    await svc.entities.User.update(target.id, { role: nextRole });
    const refreshedRows = await svc.entities.User.filter({ id: target.id }, '-updated_date', 1);
    const refreshed = refreshedRows?.[0];
    if (!refreshed || (refreshed.role || 'user') !== nextRole) {
      return Response.json({ error: 'O cargo não foi persistido. Tente novamente.' }, { status: 409 });
    }
    await staffLog(
      svc,
      actor,
      'alterou_cargo',
      `${target.email || target.full_name || target.id}: ${previousRole} → ${nextRole}`,
      target.id,
    );
    return Response.json({ ok: true, previous_role: previousRole, role: refreshed.role || nextRole, user_id: target.id });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao atualizar cargo' }, { status: 500 });
  }
}
