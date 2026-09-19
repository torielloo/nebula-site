import React from "react";
import { ShieldAlert, LogOut, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SecurityAccessNotice({ state, onLogout }) {
  if (!state?.blocked) return null;
  const expires = state.expires_at ? new Date(state.expires_at) : null;
  const expiresLabel = expires && !Number.isNaN(expires.getTime())
    ? expires.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "Sem expiração automática";

  return (
    <div className="fixed inset-0 z-[100] grid min-h-screen place-items-center bg-black px-4 py-8 text-white">
      <div className="w-full max-w-xl rounded-3xl border border-red-500/25 bg-[#070707] p-6 shadow-2xl md:p-9">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-red-500/25 bg-red-500/10 text-red-400">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div className="mt-5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-red-300/80">Nébula Security</p>
          <h1 className="mt-2 font-heading text-2xl font-extrabold">Acesso restringido</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/70">
            {state.message || "Seu acesso foi restringido pelo sistema de segurança."}
          </p>
        </div>

        <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/65">
          <div className="flex items-center gap-2"><Clock3 className="h-4 w-4" /><span>{expiresLabel}</span></div>
          {state.source_event_id ? <p className="font-mono text-[10px] text-white/40">Referência: {String(state.source_event_id).slice(0, 18)}</p> : null}
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-white/45">
          A interface não libera o acesso por conta própria. A restrição é validada novamente no servidor nas rotas protegidas.
        </p>

        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={onLogout} className="rounded-full border-white/15 bg-transparent text-white hover:bg-white/10">
            <LogOut className="mr-2 h-4 w-4" /> Sair da conta
          </Button>
        </div>
      </div>
    </div>
  );
}
