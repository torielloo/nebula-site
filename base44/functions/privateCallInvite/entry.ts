import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';
import { findActiveMute } from '../../shared/activeMute.ts';

const text = (v:any,max=180)=>String(v||'').trim().slice(0,max);
const nameOf=(u:any)=>u?.profile?.display_name||u?.profile?.name||u?.full_name||'Usuário';

async function getConversationForUser(svc:any,id:string,userId:string){
  if(!id||!userId) return null;
  for(let attempt=0;attempt<3;attempt+=1){
    const direct=await svc.entities.Conversation.get(id).catch(()=>null);
    if(direct&&(direct.participants||[]).includes(userId)) return direct;

    const rows=await svc.entities.Conversation.filter({id},'-updated_date',1).catch(()=>[]);
    const filtered=rows?.[0]||null;
    if(filtered&&(filtered.participants||[]).includes(userId)) return filtered;

    if(attempt===1){
      const recent=await svc.entities.Conversation.list('-updated_date',250).catch(()=>[]);
      const listed=(recent||[]).find((row:any)=>row?.id===id&&(row.participants||[]).includes(userId));
      if(listed) return listed;
    }
    if(attempt<2) await new Promise((resolve)=>setTimeout(resolve,100*(attempt+1)));
  }
  return null;
}

async function getInvite(svc:any,id:string){
  if(!id) return null;
  const direct=await svc.entities.PrivateCallInvite.get(id).catch(()=>null);
  if(direct) return direct;
  const rows=await svc.entities.PrivateCallInvite.filter({id},'-updated_date',1).catch(()=>[]);
  if(rows?.[0]) return rows[0];
  const recent=await svc.entities.PrivateCallInvite.list('-updated_date',120).catch(()=>[]);
  return (recent||[]).find((row:any)=>row?.id===id)||null;
}

async function listConversationInvites(svc:any,conversationId:string){
  const [filtered,listed]=await Promise.all([
    svc.entities.PrivateCallInvite.filter({conversation_id:conversationId},'-updated_date',40).catch(()=>[]),
    svc.entities.PrivateCallInvite.list('-updated_date',120).catch(()=>[]),
  ]);
  return Array.from(new Map([
    ...(filtered||[]),
    ...(listed||[]).filter((row:any)=>row?.conversation_id===conversationId),
  ].map((row:any)=>[row.id,row])).values());
}

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
      const mute=await findActiveMute(svc,user).catch(()=>null);
      if(mute) return Response.json({error:'Você está silenciado e não pode iniciar ligações privadas.',code:'muted',muted:true,reason:mute.reason||'',expires_at:mute.expires_at||null},{status:403});

      const conversationId=text(body.conversation_id,120);
      if(!conversationId) return Response.json({error:'Conversa inválida.',code:'invalid_conversation'},{status:400});

      const conv=await getConversationForUser(svc,conversationId,user.id);
      const participants=Array.isArray(conv?.participants) ? [...new Set(conv.participants.filter(Boolean))] : [];
      if(!conv||participants.length!==2||!participants.includes(user.id)){
        return Response.json({error:'Esta conversa privada não está disponível para ligação.',code:'invalid_conversation'},{status:403});
      }

      // A outra ponta é derivada da própria conversa autenticada. Não confiamos
      // no callee_id enviado pelo frontend, que pode ficar desatualizado no cache.
      const calleeId=participants.find((id:string)=>id!==user.id)||'';
      if(!calleeId||calleeId==='core-os'){
        return Response.json({error:'Não foi possível identificar a outra pessoa desta conversa.',code:'invalid_callee'},{status:400});
      }

      const channelCode=`DM-${conversationId}`;
      const meta=(Array.isArray(conv.participant_meta)?conv.participant_meta:[]).find((item:any)=>item?.id===calleeId);
      const targets=await svc.entities.User.filter({id:calleeId},'-created_date',1).catch(()=>[]);
      const target=targets?.[0]||null;
      const calleeName=text(meta?.name||nameOf(target)||'Usuário',120)||'Usuário';

      // Uma conversa privada só pode ter UMA tentativa ativa por vez.
      // Se a outra ponta já estiver ligando e este usuário clicar em "Ligar",
      // isso vira uma aceitação da MESMA chamada, em vez de criar uma segunda sala.
      const now=Date.now();
      const allInvites=await listConversationInvites(svc,conversationId);
      const ringing=(allInvites||[]).filter((x:any)=>{
        const exp=new Date(x?.expires_at||0).getTime();
        return x?.status==='ringing' && (!exp || exp>now);
      });
      const reverse=ringing.find((x:any)=>x?.caller_id===calleeId&&x?.callee_id===user.id);
      if(reverse){
        const updated=await svc.entities.PrivateCallInvite.update(reverse.id,{
          status:'accepted',
          responded_at:new Date().toISOString(),
          channel_code:channelCode,
        }).catch(()=>({...reverse,status:'accepted',channel_code:channelCode}));
        return Response.json({ok:true,invite:updated,reused:true,joined_existing:true,peer_user_id:calleeId});
      }

      const reusable=ringing.find((x:any)=>x?.caller_id===user.id&&x?.callee_id===calleeId);
      if(reusable){
        return Response.json({ok:true,invite:reusable,reused:true,peer_user_id:calleeId});
      }

      await Promise.all(ringing.map((x:any)=>svc.entities.PrivateCallInvite.update(x.id,{
        status:'cancelled',
        responded_at:new Date().toISOString()
      }).catch(()=>null)));

      let invite:any=null;
      try{
        invite=await svc.entities.PrivateCallInvite.create({
          caller_id:user.id,
          caller_name:nameOf(user),
          caller_avatar:user?.profile?.avatar_url||'',
          callee_id:calleeId,
          callee_name:calleeName,
          conversation_id:conversationId,
          channel_code:channelCode,
          status:'ringing',
          expires_at:new Date(Date.now()+60000).toISOString()
        });
      }catch{
        return Response.json({error:'Não foi possível criar o convite da ligação agora.',code:'invite_create_failed'},{status:503});
      }

      const content=`📞 ${nameOf(user)} iniciou uma call privada.`;
      const callMessage=await svc.entities.DirectMessage.create({
        conversation_id:conversationId,
        sender_id:user.id,
        sender_name:nameOf(user),
        sender_avatar:user?.profile?.avatar_url||'',
        content,
        attachments:[],
        participants,
        edited:false,
        deleted:false
      }).catch(()=>null);
      await svc.entities.Conversation.update(conversationId,{last_message:content,last_sender_id:user.id}).catch(()=>null);
      return Response.json({ok:true,invite,message:callMessage,peer_user_id:calleeId});
    }

    if(action==='respond'){
      const inviteId=text(body.invite_id,120), status=text(body.status,20);
      if(!['accepted','declined','cancelled'].includes(status)) return Response.json({error:'Resposta inválida'},{status:400});
      const invite=await getInvite(svc,inviteId);
      if(!invite) return Response.json({error:'Convite não encontrado',code:'invite_not_found'},{status:404});
      const allowed=status==='cancelled'?invite.caller_id===user.id:invite.callee_id===user.id;
      if(!allowed) return Response.json({error:'Sem permissão',code:'forbidden'},{status:403});
      if(status==='accepted'&&invite.status==='accepted'){
        return Response.json({invite:{...invite,channel_code:`DM-${invite.conversation_id}`},reused:true,peer_user_id:invite.caller_id});
      }
      if(status==='accepted'&&invite.status!=='ringing'){
        return Response.json({error:'Esta ligação não está mais chamando.',code:'invite_not_ringing'},{status:409});
      }
      if(status==='accepted'){
        const mute=await findActiveMute(svc,user).catch(()=>null);
        if(mute) return Response.json({error:'Você está silenciado e não pode entrar em ligações privadas.',code:'muted',muted:true,reason:mute.reason||'',expires_at:mute.expires_at||null},{status:403});
      }
      const respondedAt = new Date().toISOString();
      const canonicalChannelCode = status === 'accepted'
        ? `DM-${invite.conversation_id}`
        : text(invite.channel_code,180);
      // Aceitar/recusar não pode falhar por uma leitura/gravação transitória.
      // O CallRoom valida novamente a identidade e a conversa ao conectar.
      const updated=await svc.entities.PrivateCallInvite.update(invite.id,{
        status,
        responded_at:respondedAt,
        channel_code:canonicalChannelCode
      }).catch(()=>({
        ...invite,
        status,
        responded_at:respondedAt,
        channel_code:canonicalChannelCode,
      }));
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
      return Response.json({ok:true,invite:updated,peer_user_id:status==='accepted'?invite.caller_id:null});
    }

    if(action==='incoming'){
      const [filtered,listed]=await Promise.all([
        svc.entities.PrivateCallInvite.filter({callee_id:user.id,status:'ringing'},'-updated_date',30).catch(()=>[]),
        svc.entities.PrivateCallInvite.list('-updated_date',120).catch(()=>[]),
      ]);
      const rows=Array.from(new Map([
        ...(filtered||[]),
        ...(listed||[]).filter((row:any)=>row?.callee_id===user.id&&row?.status==='ringing'),
      ].map((row:any)=>[row.id,row])).values());
      const now=Date.now(); const active:any[]=[];
      for(const invite of rows||[]){
        const exp=new Date(invite.expires_at||0).getTime();
        if(exp && exp<=now){ await svc.entities.PrivateCallInvite.update(invite.id,{status:'expired',responded_at:new Date().toISOString()}).catch(()=>null); continue; }
        active.push(invite);
      }
      active.sort((a:any,b:any)=>new Date(b.created_date||0).getTime()-new Date(a.created_date||0).getTime());
      return Response.json({invites:active});
    }

    return Response.json({error:'Ação inválida'},{status:400});
  }catch(error:any){
    const blocked=securityResponse(error); if(blocked) return blocked;
    return Response.json({error:'Falha no convite de chamada privada'},{status:500});
  }
}