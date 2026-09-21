import React from "react";
import { CreditCard, Gift, History, RefreshCw } from "lucide-react";
import { parseDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const STATUS = {
  pending: { label: "Em análise", cls: "bg-amber-500/10 text-amber-300" },
  code_issued: { label: "Código emitido", cls: "bg-cyan-500/10 text-cyan-300" },
  approved: { label: "Ativo", cls: "bg-emerald-500/10 text-emerald-300" },
  rejected: { label: "Rejeitado", cls: "bg-red-500/10 text-red-300" },
  expired: { label: "Expirado", cls: "bg-white/5 text-muted-foreground" },
};

const PLAN = {
  nitro_mensal: "Mensal · 30 dias",
  nitro_anual: "Anual · 365 dias",
  nitro_90: "90 dias",
  nitro_custom: "Personalizado",
};

const SOURCE = {
  purchase: "Compra",
  nitro_code: "Código Nitro",
  manual: "Ativação manual",
};

export default function NitroHistory({ requests = [] }) {
  return (
    <section id="historico" className="scroll-mt-24 rounded-2xl border border-border/40 bg-card/35 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <History className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Sua conta</p>
          <h2 className="mt-1 font-heading text-lg font-extrabold">Histórico Nitro</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Compras, ativações, renovações e códigos vinculados à sua conta.
          </p>
        </div>
      </div>

      {!requests?.length ? (
        <div className="mt-4 rounded-xl border border-dashed border-border/40 bg-background/20 px-4 py-7 text-center text-sm text-muted-foreground">
          Nenhuma movimentação Nitro ainda.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {requests.slice(0, 12).map((row) => {
            const meta = STATUS[row.status] || STATUS.pending;
            const SourceIcon = row.source === "nitro_code" ? Gift : row.source === "purchase" ? CreditCard : RefreshCw;

            return (
              <div key={row.id} className="flex flex-col gap-3 rounded-xl border border-border/35 bg-background/25 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.035] text-muted-foreground">
                    <SourceIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{PLAN[row.plan] || "Nébula Nitro"}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {SOURCE[row.source] || "Nitro"} · {parseDate(row.created_date).format("DD/MM/YYYY HH:mm")}
                    </p>
                    {row.status === "rejected" && row.rejection_reason && (
                      <p className="mt-1 text-[11px] text-red-300">Motivo: {row.rejection_reason}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  {row.expires_at && row.status === "approved" && (
                    <span className="text-[10px] text-muted-foreground">
                      até {parseDate(row.expires_at).format("DD/MM/YYYY")}
                    </span>
                  )}
                  <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold", meta.cls)}>{meta.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
