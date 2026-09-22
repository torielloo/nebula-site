import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ProfileAvatar from "@/components/ProfileAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, ShieldCheck, MessageCircle } from "lucide-react";
import CopyIdButton from "@/components/CopyIdButton";
import NitroBadgeRow from "@/components/nitro/NitroBadgeRow";

export default function UserQuickCard({ userId, children, align = "start" }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dmBusy, setDmBusy] = useState(false);

  useEffect(() => {
    setOpen(false);
    setData(null);
    setLoading(false);
    setDmBusy(false);
  }, [userId]);

  const load = async () => {
    if (loading || !userId) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("userDirectory", { action: "profile", user_id: userId, request_nonce: Date.now() });
      setData(res.data?.profile || null);
    } finally {
      setLoading(false);
    }
  };

  const openDm = async () => {
    if (!data?.id || dmBusy) return;
    setDmBusy(true);
    try {
      const res = await base44.functions.invoke("openDirectConversation", { user_id: data.id });
      const conversationId = res.data?.conversation?.id;
      if (conversationId) {
        setOpen(false);
        navigate(`/mensagens?conversation=${encodeURIComponent(conversationId)}`);
      }
    } finally {
      setDmBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) load(); }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        style={{
          borderColor: data?.accent ? `${data.accent}55` : undefined,
          boxShadow: data?.accent ? `0 24px 70px -28px ${data.accent}66` : undefined,
        }}
        className="w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border-border/50 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl"
      >
        {loading ? (
          <div className="grid min-h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : !data ? (
          <p className="p-5 text-sm text-muted-foreground">Não foi possível carregar este perfil.</p>
        ) : (
          <>
            <div
              className="relative h-28 bg-gradient-to-br from-primary/30 via-card to-card"
              style={data.accent || data.accent_2 ? { background: `linear-gradient(135deg, ${data.accent || "#111827"}55, ${data.accent_2 || data.accent || "#111827"}22)` } : undefined}
            >
              {data.banner_url && <img src={data.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
              <div className="absolute inset-0 bg-gradient-to-t from-popover to-transparent" />
            </div>
            <div className="-mt-7 p-4 pt-0">
              <ProfileAvatar name={data.name} avatar={data.avatar_url} size="lg" status={data.status} frame={data.frame || ""} customFrameUrl={data.custom_frame_url || ""} />
              <div className="mt-2 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-extrabold">{data.name}</p>
                  <div className="flex items-center gap-1"><p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{data.username ? `@${data.username}` : `ID ${data.id}`}</p><CopyIdButton value={data.id} label="ID do usuário" className="h-6 w-6" /></div>
                </div>
                {data.discord_connected && <span title="Discord conectado" className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/10 text-emerald-400"><ShieldCheck className="h-4 w-4" /></span>}
              </div>
              <NitroBadgeRow badges={data.nitro_badges} role={data.role} nitroActive={data.nitro_active} compact className="mt-3" />
              {data.custom_status && (
                <div
                  className="mt-3 rounded-xl border px-3 py-2 text-xs font-semibold"
                  style={{ borderColor: data.accent ? `${data.accent}44` : undefined, background: data.accent ? `${data.accent}12` : undefined }}
                >
                  {data.custom_status}
                </div>
              )}
              {data.bio && <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{data.bio}</p>}
              {data.internal_id && (
                <div className="mt-3 grid gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-[11px]">
                  <div><span className="text-muted-foreground">Nome:</span> <strong>{data.name}</strong></div>
                  <div className="flex items-center gap-1"><span className="text-muted-foreground">ID interno:</span> <span className="min-w-0 flex-1 truncate font-mono">{data.internal_id}</span><CopyIdButton value={data.internal_id} label="ID interno" className="h-6 w-6" /></div>
                  <div><span className="text-muted-foreground">Criado em:</span> <strong>{data.created_date ? new Date(data.created_date).toLocaleDateString("pt-BR") : "—"}</strong></div>
                  <div><span className="text-muted-foreground">Discord:</span> <strong>{data.discord?.username || data.discord?.handle || (data.discord?.connected ? "Conectado" : "Não conectado")}</strong></div>
                  <div className="flex items-center gap-2"><span className="text-muted-foreground">Discord ID:</span> <span className="min-w-0 flex-1 truncate font-mono">{data.discord?.id || (data.discord?.connected ? "Oculto para seu nível" : "—")}</span><CopyIdButton value={data.discord?.id} label="Discord ID" className="h-6 w-6" /></div>
                  {data.report_summary && <div><span className="text-muted-foreground">Denúncias:</span> <strong>{data.report_summary.total || 0}</strong> · {data.report_summary.open || 0} abertas</div>}
                  {data.verification && <div><span className="text-muted-foreground">Verificação:</span> <strong>{data.verification.protocol || data.verification.status || "ativa"}</strong></div>}
                  {data.punishment_summary && <div><span className="text-muted-foreground">Punições:</span> <strong>{data.punishment_summary.total || 0}</strong> · {data.punishment_summary.active || 0} ativas</div>}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.role && data.role !== "user" && (
                  <span
                    className="rounded-full px-2 py-1 text-[10px] font-bold uppercase"
                    style={{ background: data.accent ? `${data.accent}18` : undefined, color: data.accent || undefined }}
                  >
                    {data.role}
                  </span>
                )}
                {(data.badges || []).slice(0, 4).map((b) => <span key={b} className="rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold">{b}</span>)}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button asChild size="sm">
                  <Link to={`/user/${data.id}`}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Ver perfil</Link>
                </Button>
                <Button size="sm" variant="outline" onClick={openDm} disabled={dmBusy}>
                  {dmBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="mr-1.5 h-3.5 w-3.5" />}Mensagem
                </Button>
              </div>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}