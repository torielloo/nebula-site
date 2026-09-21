import React, { useMemo, useState } from "react";
import { Check, Crown, Gem, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLANS = {
  mensal: {
    name: "Nitro Mensal",
    monthly: 6.99,
    yearlyEquivalent: null,
    badge: "Flexível",
    icon: Gem,
    features: [
      "Nitro Studio e UI Studio",
      "Tags e molduras premium",
      "Banner, avatar e perfil avançado",
      "Temas e cores personalizadas",
      "Nébula Mixer e perks Nitro",
    ],
  },
  anual: {
    name: "Nitro Anual",
    monthly: 25.5 / 12,
    fullPrice: 25.5,
    badge: "Melhor valor",
    icon: Crown,
    features: [
      "Todos os recursos do Nitro Mensal",
      "365 dias de acesso",
      "Menos renovações durante o ano",
      "Todas as molduras e temas premium",
      "Acesso contínuo ao Nitro Studio",
    ],
  },
};

export default function NitroPlansShowcase({ active, onChoose }) {
  const [billing, setBilling] = useState("mensal");
  const annualSaving = useMemo(() => {
    const mensalYear = 6.99 * 12;
    return Math.max(0, Math.round((1 - 25.5 / mensalYear) * 100));
  }, []);

  return (
    <section id="planos-nitro" className="scroll-mt-24 overflow-hidden rounded-3xl border border-border/40 bg-card/35">
      <div className="border-b border-border/35 p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Planos Nitro</p>
            <h2 className="mt-1 font-heading text-xl font-extrabold md:text-2xl">Escolha como quer usar o Nébula Nitro</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Mesmos recursos premium, com opção mensal ou anual. O plano anual reduz o custo equivalente por mês.
            </p>
          </div>
          <div className="flex rounded-full border border-border/50 bg-background/40 p-1">
            {[
              ["mensal", "Mensal"],
              ["anual", "Anual"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setBilling(id)}
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-bold transition",
                  billing === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-2 md:p-6">
        {Object.entries(PLANS).map(([id, plan]) => {
          const Icon = plan.icon;
          const selected = billing === id;
          const yearly = id === "anual";
          return (
            <article
              key={id}
              className={cn(
                "relative overflow-hidden rounded-3xl border p-5 transition duration-300 md:p-6",
                selected
                  ? "border-primary/55 bg-primary/[0.07] shadow-[0_0_44px_-24px_hsl(var(--primary)/0.7)]"
                  : "border-border/40 bg-background/30 hover:border-border"
              )}
            >
              {yearly && (
                <div className="absolute right-4 top-4 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-extrabold text-emerald-300">
                  ECONOMIZE ~{annualSaving}%
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{plan.badge}</p>
                  <h3 className="font-heading text-lg font-extrabold">{plan.name}</h3>
                </div>
              </div>

              <div className="mt-5 flex items-end gap-2">
                <span className="font-display text-3xl font-black">
                  R$ {yearly ? plan.fullPrice.toFixed(2).replace(".", ",") : plan.monthly.toFixed(2).replace(".", ",")}
                </span>
                <span className="pb-1 text-xs text-muted-foreground">/{yearly ? "ano" : "mês"}</span>
              </div>
              {yearly && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Equivale a ~R$ {plan.monthly.toFixed(2).replace(".", ",")} por mês.
                </p>
              )}

              <div className="mt-5 space-y-2.5">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                size="lg"
                variant={selected ? "default" : "outline"}
                className="mt-6 w-full rounded-2xl"
                onClick={() => {
                  setBilling(id);
                  onChoose?.(id);
                  document.getElementById("renovar")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {active ? <Zap className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {active ? "Renovar Nitro" : "Escolher este plano"}
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
