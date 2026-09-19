import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

const STAFF_ROLES = new Set(['moderator','staff','admin','dev','owner']);
const TYPES = new Set(['ban','tempban','mute','kick']);
const DURATIONS = new Set([0.5,1,24,72,168,720]);
const text = (v:any,max=500)=>String(v||'').trim().slice(0,max);

function nameOf(user:any){
  const p=user?.profile||{};
  return p.display_name||p.name||p.discord_username||user?.full_name||user?.email||user?.id||'Usuário';
}

async function resolveTarget(svc:any, raw:string){
  const q=text(raw,180);
  if(!q) return null;
  const users=await svc.entities.User.list('-created_date',500);
  let target=(users||[]).find((u:any)=>u.id===q || u.email===q || u.email?.toLowerCase()===q.toLowerCase());
  if(!target){
    const lower=q.replace(/^@+/,'').toLowerCase();
    target=(users||[]).find((u:any)=>{
      const p=u.profile||{};
      return [u.full_name,p.display_name,p.name,p.username,p.discord_username,p.discord_handle]
        .filter(Boolean).some((value:any)=>String(value).replace(/^@+/,'').toLowerCase()===lower);
    });
  }
  if(!target && /^\d{8,22}$/.test(q)){
    const accounts=await svc.entities.DiscordAccount.filter({discord_id:q},'-updated_date',3).catch(()=>[]);
    const id=accounts?.[0]?.user_id;
    if(id) target=(users||[]).find((u:any)=>u.id===id);
  }
  return target||null;
}

export default async function(req:Request){
  try{
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me().catch(()=>null);
    if(!user) return Response.json({error:'Não autorizado'},{status:401});
    if(!STAFF_ROLES.has(String(user.role||''))) return Response.json({error:'Sem permissão para aplicar punições'},{status:403});
    const body=await req.json().catch(()=>({}));
    try{
      await guardRequest(req,base44,{route:'punishmentOps',user,body,strict:false,limit:30,windowMs:60000,maxBodyBytes:8000});
    }catch(error){
      const blocked=securityResponse(error); if(blocked) return blocked;
    }
    const svc=base44.asServiceRole;
    const action=text(body.action,40);

    if(action==='list'){
      const rows=await svc.entities.Punishment.list('-created_date',200);
      return Response.json({punishments:rows||[]});
    }

    if(action==='revoke'){
      const id=text(body.punishment_id,120);
      if(!id) return Response.json({error:'Punição inválida'},{status:400});
      const rows=await svc.entities.Punishment.filter({id},'-created_date',1);
      const item=rows?.[0]; if(!item) return Response.json({error:'Punição não encontrada'},{status:404});
      const updated=await svc.entities.Punishment.update(id,{active:false});
      return Response.json({punishment:updated});
    }

    if(action==='delete'){
      if(!['admin','dev','owner'].includes(String(user.role||''))) return Response.json({error:'Somente Admin, Dev ou Owner pode apagar o histórico de uma punição.'},{status:403});
      const id=text(body.punishment_id,120);
      if(!id) return Response.json({error:'Punição inválida'},{status:400});
      const rows=await svc.entities.Punishment.filter({id},'-created_date',1);
      const item=rows?.[0]; if(!item) return Response.json({error:'Punição não encontrada'},{status:404});
      await svc.entities.Punishment.delete(id);
      await svc.entities.StaffLog.create({actor_name:nameOf(user),actor_id:user.id,action:'punicao_log_apagado',details:`Apagou o registro de ${item.type || 'punição'} de ${item.user_name || item.user_id || 'usuário'}`.slice(0,1000),target_id:item.user_id||''}).catch(()=>null);
      return Response.json({ok:true});
    }

    if(action!=='apply') return Response.json({error:'Ação inválida'},{status:400});
    const kind=text(body.type,20);
    if(!TYPES.has(kind)) return Response.json({error:'Tipo de punição inválido'},{status:400});
    const target=await resolveTarget(svc,text(body.user,180));
    if(!target) return Response.json({error:'Usuário não encontrado. Use ID interno, email, @usuário ou Discord ID.'},{status:404});
    if(target.id===user.id) return Response.json({error:'Você não pode aplicar esta punição em si mesmo.'},{status:400});
    if(['owner','dev'].includes(target.role) && !['owner'].includes(user.role)) return Response.json({error:'Seu cargo não pode punir Owner/Dev.'},{status:403});
    const reason=text(body.reason,700);
    if(!reason) return Response.json({error:'Informe o motivo da punição.'},{status:400});

    let hours=0;
    if(kind==='tempban'||kind==='mute'){
      hours=Number(body.duration_hours);
      if(!DURATIONS.has(hours)) return Response.json({error:'Duração inválida'},{status:400});
    }
    if(kind==='kick') hours=1/40; // 90 segundos: derruba o acesso atual e permite retornar logo depois.

    const data:any={
      user_id:target.id,
      user_name:nameOf(target),
      type:kind,
      reason,
      staff_name:nameOf(user),
      active:true,
      public_message: kind==='kick'
        ? 'Sua sessão foi encerrada pela moderação. Você poderá entrar novamente em instantes.'
        : kind==='mute'
          ? 'Sua conta está temporariamente impedida de enviar mensagens e interagir em áreas moderadas.'
          : 'Seu acesso ao Nébula OS está bloqueado pela moderação. Consulte o suporte se precisar solicitar revisão.'
    };
    if(kind==='tempban'||kind==='mute'||kind==='kick'){
      data.expires_at=new Date(Date.now()+hours*3600_000).toISOString();
    }
    const created=await svc.entities.Punishment.create(data);
    await svc.entities.StaffLog.create({
      actor_name:nameOf(user),actor_id:user.id,action:'punicao_aplicada',
      details:`${kind} em ${nameOf(target)} (${target.id}) — ${reason}${data.expires_at?` — expira ${data.expires_at}`:''}`.slice(0,1000),
      target_id:target.id
    }).catch(()=>null);
    return Response.json({punishment:created,target:{id:target.id,name:nameOf(target)}});
  }catch(error:any){
    const blocked=securityResponse(error); if(blocked) return blocked;
    return Response.json({error:'Falha ao aplicar punição'},{status:500});
  }
}