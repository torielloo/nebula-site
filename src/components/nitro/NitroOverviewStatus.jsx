import React from "react";
import { BadgeCheck, CalendarDays, Clock3, CreditCard, RefreshCw } from "lucide-react";
import { moment, parseDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const PLAN_LABELS = {
  nitro_mensal: "Mensal · 30 dias",
  nitro_anual: "Anual · 365 dias",
  nitro_90: "90 dias",
  nitro_custom: "Personalizado",
};

const SOURCE_LABELS = {
  purchase: "Compra",
  nitro_code: "Código Nitro",
  manual: "Ativação manual",
};

export default function NitroOverviewStatus({ active, validUntil, requests = [] }) {
  const approved = (requests || [])
    .filter((row) => row.status === "approved")
    .sort((a, b) => new Date(b.approved_at || b.updated_date || b.created_date || 0) - new Date(a.approved_at || a.updated_date || a.created_date || 0));

  const latest = approved[0] || null;
  const pending = (requests || []).find((row) => row.status === "pending" || row.status === "code_issued") || null;
  const hadNitro = approved.length > 0;
  const remainingDays = active && validUntil
    ? Math.max(0, Math.ceil(validUntil.diff(moment(), "hours", true) / 24))
    : 0;
  const statusLabel = active ? "Ativo" : hadNitro ? "Expirado" : "Inativo";
  const statusClass = active
    ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
    : hadNitro
      ? "text-amber-300 bg-amber-500/10 border-amber-500/20"
      : "text-muted-foreground bg-white/[0.035] border-border/40";

  const cells = [
    {
      icon: BadgeCheck,
      label: "Status",
      value: statusLabel,
      extra: active ? "Recursos Nitro liberados" : hadNitro ? "Renove para reativar os recursos" : "Nenhuma assinatura ativa",
    },
    {
      icon: CreditCard,
      label: "Plano",
      value: latest ? (PLAN_LABELS[latest.plan] || "Nébula Nitro") : "—",
      extra: latest ? (SOURCE_LABELS[latest.source] || "Nitro") : "Sem plano ativo",
    },
    {
      icon: CalendarDays,
      label: "Validade",
      value: active && validUntil ? validUntil.format("DD/MM/YYYY") : "—",
      extra: active ? `${remainingDays} ${remainingDays === 1 ? "dia restante" : "dias restantes"}` : "Sem validade ativa",
    },
    {
      icon: Clock3,
      label: "Ativação",
      value: latest ? parseDate(latest.approved_at || latest.created_date).format("DD/MM/YYYY") : "—",
      extra: latest ? (SOURCE_LABELS[latest.source] || "Nitro") : "Ainda não ativado",
    },
  ];

  return (
    <section id="status-nitro" className="scroll-mt-24 rounded-2xl border border-border/40 bg-card/35 p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Assinatura</p>
          <h2 className="mt-1 font-heading text-lg font-extrabold">Status do Nébula Nitro</h2>
        </div>
        <span className={cn("rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em]", statusClass)}>
          {statusLabel}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {cells.map((item) => (
          <div key={item.label} className="rounded-xl border border-border/30 bg-background/30 p-3.5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <item.icon className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.14em]">{item.label}</span>
            </div>
            <p className="mt-2 text-sm font-extrabold">{item.value}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{item.extra}</p>
          </div>
        ))}
      </div>

      {pending && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5 text-xs text-amber-200">
          <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {pending.status === "code_issued"
              ? "Sua renovação foi aprovada e o código Nitro está aguardando resgate."
              : "Você tem uma solicitação Nitro em análise. Não é necessário enviar outra enquanto ela estiver pendente."}
          </span>
        </div>
      )}
    </section>
  );
}
