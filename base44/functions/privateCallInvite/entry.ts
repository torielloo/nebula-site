import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';
import { findActiveMute } from '../../shared/activeMute.ts';

const text = (v:any,max=180)=>String(v||'').trim().slice(0,max);
const nameOf=(u:any)=>u?.profile?.display_name||u?.profile?.name||u?.full_name||'Usuário';

export default async function(req:Request){
  try{
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me().catch(()=>null);
    if(!user) return Response.json({error:'Não autorizado'},{status:401});
    const body=await req.json().catch(()=>({}));
    await guardRequest(req,base44,{route:'privateCallInvite',user,body,strict:true,limit:40,windowMs:60000,maxBodyBytes:5000});
    const svc=base44.asServiceRole;
    const action=text(body.action,40);

    if(action==='ring'){
      const mute=await findActiveMute(svc,user);
      if(mute) return Response.json({error:'Você está silenciado e não pode iniciar ligações privadas.',code:'muted',muted:true,reason:mute.reason||'',expires_at:mute.expires_at||null},{status:403});
      const calleeId=text(body.callee_id,120), conversationId=text(body.conversation_id,120), channelCode=text(body.channel_code,180);
      if(!calleeId||calleeId===user.id||!conversationId||!channelCode) return Response.json({error:'Convite inválido'},{status:400});
      const convs=await svc.entities.Conversation.filter({id:conversationId},'-updated_date',1);
      const conv=convs?.[0];
      if(!conv||(conv.participants||[]).length!==2||!(conv.participants||[]).includes(user.id)||!(conv.participants||[]).includes(calleeId)) return Response.json({error:'Conversa inválida'},{status:403});
      const targets=await svc.entities.User.filter({id:calleeId},'-created_date',1);
      const target=targets?.[0]; if(!target) return Response.json({error:'Usuário não encontrado'},{status:404});
      const old=await svc.entities.PrivateCallInvite.filter({caller_id:user.id,callee_id:calleeId,status:'ringing'},'-created_date',20).catch(()=>[]);
      await Promise.all((old||[]).map((x:any)=>svc.entities.PrivateCallInvite.update(x.id,{status:'cancelled',responded_at:new Date().toISOString()}).catch(()=>null)));
      const invite=await svc.entities.PrivateCallInvite.create({
        caller_id:user.id, caller_name:nameOf(user), caller_avatar:user?.profile?.avatar_url||'',
        callee_id:calleeId, callee_name:nameOf(target), conversation_id:conversationId, channel_code:channelCode,
        status:'ringing', expires_at:new Date(Date.now()+60000).toISOString()
      });
      const content=`📞 ${nameOf(user)} iniciou uma call privada.`;
      const callMessage=await svc.entities.DirectMessage.create({
        conversation_id:conversationId,sender_id:user.id,sender_name:nameOf(user),sender_avatar:user?.profile?.avatar_url||'',
        content,attachments:[],participants:conv.participants||[],edited:false,deleted:false
      }).catch(()=>null);
      await svc.entities.Conversation.update(conversationId,{last_message:content,last_sender_id:user.id}).catch(()=>null);
      return Response.json({invite,message:callMessage});
    }

    if(action==='respond'){
      const inviteId=text(body.invite_id,120), status=text(body.status,20);
      if(!['accepted','declined','cancelled'].includes(status)) return Response.json({error:'Resposta inválida'},{status:400});
      const rows=await svc.entities.PrivateCallInvite.filter({id:inviteId},'-created_date',1);
      const invite=rows?.[0]; if(!invite) return Response.json({error:'Convite não encontrado'},{status:404});
      const allowed=status==='cancelled'?invite.caller_id===user.id:invite.callee_id===user.id;
      if(!allowed) return Response.json({error:'Sem permissão'},{status:403});
      if(status==='accepted'){
        const mute=await findActiveMute(svc,user);
        if(mute) return Response.json({error:'Você está silenciado e não pode entrar em ligações privadas.',code:'muted',muted:true,reason:mute.reason||'',expires_at:mute.expires_at||null},{status:403});
      }
      const respondedAt = new Date().toISOString();
      const updated=await svc.entities.PrivateCallInvite.update(invite.id,{status,responded_at:respondedAt});
      if (status === "accepted" || status === "declined") {
        const content = status === "accepted"
          ? `✅ ${nameOf(user)} aceitou a ligação privada.`
          : `❌ ${nameOf(user)} recusou a ligação privada.`;
        await svc.entities.DirectMessage.create({
          conversation_id: invite.conversation_id,
          sender_id: user.id,
          sender_name: nameOf(user),
          sender_avatar: user?.profile?.avatar_url || "",
          content,
          attachments: [],
          participants: [invite.caller_id, invite.callee_id],
          edited: false,
          deleted: false,
        }).catch(()=>null);
        await svc.entities.Conversation.update(invite.conversation_id, {
          last_message: content,
          last_sender_id: user.id,
        }).catch(()=>null);
      }
      return Response.json({invite:updated});
    }

    if(action==='incoming'){
      const rows=await svc.entities.PrivateCallInvite.filter({callee_id:user.id,status:'ringing'},'-created_date',20).catch(()=>[]);
      const now=Date.now(); const active:any[]=[];
      for(const invite of rows||[]){
        const exp=new Date(invite.expires_at||0).getTime();
        if(exp && exp<=now){ await svc.entities.PrivateCallInvite.update(invite.id,{status:'expired',responded_at:new Date().toISOString()}).catch(()=>null); continue; }
        active.push(invite);
      }
      return Response.json({invites:active});
    }

    return Response.json({error:'Ação inválida'},{status:400});
  }catch(error:any){
    const blocked=securityResponse(error); if(blocked) return blocked;
    return Response.json({error:'Falha no convite de chamada privada'},{status:500});
  }
}