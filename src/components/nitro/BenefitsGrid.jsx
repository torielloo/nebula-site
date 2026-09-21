import React from "react";
import { Link } from "react-router-dom";
import { Diamond, Palette, Sparkles, Crown, ShieldCheck, Tag, Sticker, SlidersHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

const BENEFITS = [
  { icon: Diamond, title: "nitro.b1t", desc: "nitro.b1d" },
  { icon: Palette, title: "nitro.b2t", desc: "nitro.b2d" },
  { icon: Sparkles, title: "nitro.b3t", desc: "nitro.b3d" },
  { icon: Crown, title: "nitro.b4t", desc: "nitro.b4d" },
  { icon: ShieldCheck, title: "nitro.b5t", desc: "nitro.b5d" },
  { icon: Tag, title: "nitro.b6t", desc: "nitro.b6d" },
  { icon: Sticker, title: "nitro.b7t", desc: "nitro.b7d" },
  { icon: SlidersHorizontal, title: "nitro.b8t", desc: "nitro.b8d" },
];

export default function BenefitsGrid() {
  const { t } = useI18n();
  return (
    <section id="beneficios" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Tudo incluso</p>
          <h2 className="mt-1 font-heading text-xl font-extrabold">{t("nitro.benefits_title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">Recursos extras para perfil, música e experiência dentro do Nébula.</p>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link to="/perfil">
            {t("nitro.customize_profile")} <Plus className="ml-2 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {BENEFITS.map((b) => (
          <div key={b.title} className="group rounded-2xl border border-border/40 bg-card/35 p-4 transition hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card/55">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-primary/15 bg-primary/[0.08] text-primary transition group-hover:scale-105">
              <b.icon className="h-4 w-4" />
            </div>
            <h3 className="mt-3 font-heading text-sm font-bold">{t(b.title)}</h3>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t(b.desc)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}