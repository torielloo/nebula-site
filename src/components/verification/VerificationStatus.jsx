import React from "react";
import { BadgeCheck, Clock3, ShieldAlert, XCircle, Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS = {
  requested: ["Solicitada", Clock3, "text-amber-400 bg-amber-500/10"],
  awaiting_user: ["Aguardando você", ShieldAlert, "text-amber-400 bg-amber-500/10"],
  scheduled: ["Agendada", Clock3, "text-blue-400 bg-blue-500/10"],
  in_review: ["Em análise", Clock3, "text-blue-400 bg-blue-500/10"],
  awaiting_staff: ["Aguardando equipe", Clock3, "text-blue-400 bg-blue-500/10"],
  approved: ["Aprovada", BadgeCheck, "text-emerald-400 bg-emerald-500/10"],
  rejected: ["Rejeitada", XCircle, "text-destructive bg-destructive/10"],
  cancelled: ["Cancelada", XCircle, "text-muted-foreground bg-secondary"],
};

export default function VerificationStatus({ item, onBegin, beginning = false }) {
  const [label, Icon, style] = STATUS[item.status] || [item.status, ShieldAlert, "text-muted-foreground bg-secondary"];
  const restrictions = Object.entries(item.restrictions || {}).filter(([, enabled]) => enabled);
  return (
    <section className="rounded-3xl border border-border/50 bg-card/60 p-5 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Protocolo</p><h2 className="mt-1 font-mono text-lg font-bold">{item.protocol}</h2></div>
        <span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${style}`}><Icon className="h-4 w-4" />{label}</span>
      </div>
      <div className="mt-6 rounded-2xl border border-border/40 bg-secondary/30 p-4"><p className="text-xs font-bold text-muted-foreground">Motivo informado</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{item.reason_public}</p></div>
      {restrictions.length > 0 && <div className="mt-5"><p className="text-xs font-bold text-muted-foreground">Restrições temporárias</p><div className="mt-2 flex flex-wrap gap-2">{restrictions.map(([key]) => <span key={key} className="rounded-full border border-border/50 bg-secondary px-3 py-1 text-xs font-semibold">{key === "messages" ? "Mensagens" : key === "posts" ? "Publicações" : key === "interactions" ? "Interações" : "Análise manual"}</span>)}</div></div>}
      {['requested', 'awaiting_user'].includes(item.status) && onBegin && (
        <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs font-bold text-foreground">Iniciar conscientemente o processo</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Nenhuma tela, câmera ou microfone será capturado automaticamente. Se a Staff solicitar telagem, você entra na sessão e inicia manualmente o compartilhamento.</p>
          <Button type="button" onClick={onBegin} disabled={beginning} className="mt-3 rounded-full">
            {beginning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
            Iniciar verificação
          </Button>
        </div>
      )}
      {item.status === 'awaiting_staff' && <p className="mt-5 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs font-semibold text-blue-300">Processo iniciado. Aguardando orientação da Staff antes de qualquer compartilhamento de tela.</p>}
      {item.resolution && <div className="mt-5"><p className="text-xs font-bold text-muted-foreground">Resolução</p><p className="mt-1 text-sm">{item.resolution}</p></div>}
    </section>
  );
}