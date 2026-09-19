import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VerificationBanner({ item }) {
  if (!item) return null;
  return (
    <div className="mx-auto mb-4 flex w-full max-w-[1600px] flex-wrap items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm">
      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-amber-200">Verificação de conta em andamento</p>
        <p className="truncate text-xs text-muted-foreground">Protocolo {item.protocol || item.id} · algumas funções podem estar temporariamente limitadas.</p>
      </div>
      <Button asChild variant="outline" size="sm" className="rounded-full border-amber-500/30"><Link to="/verificacao">Ver processo</Link></Button>
    </div>
  );
}

export function VerificationBlocked({ item, reason }) {
  return (
    <div className="mx-auto grid min-h-[55vh] max-w-2xl place-items-center">
      <div className="w-full rounded-3xl border border-amber-500/25 bg-card/70 p-7 text-center shadow-[0_28px_90px_-50px_rgba(0,0,0,0.95)] md:p-10">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-400"><ShieldAlert className="h-7 w-7" /></div>
        <h1 className="mt-5 font-heading text-2xl font-extrabold">Função temporariamente limitada</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{reason || "Esta função está temporariamente indisponível enquanto sua conta passa por verificação."}</p>
        <p className="mt-3 font-mono text-xs text-muted-foreground">{item?.protocol || item?.id}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild className="rounded-full"><Link to="/verificacao">Acompanhar verificação</Link></Button>
          <Button asChild variant="outline" className="rounded-full"><Link to="/tickets">Falar com o suporte</Link></Button>
        </div>
      </div>
    </div>
  );
}
