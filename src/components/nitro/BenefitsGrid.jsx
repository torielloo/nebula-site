import React from "react";
import { Link } from "react-router-dom";
import { Diamond, Palette, Sparkles, Crown, ShieldCheck, Tag, Sticker, Camera, Plus } from "lucide-react";
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
  { icon: Camera, title: "nitro.b8t", desc: "nitro.b8d" },
];

export default function BenefitsGrid() {
  const { t } = useI18n();
  return (
    <section id="beneficios">
      <h2 className="font-heading text-lg font-bold">{t("nitro.benefits_title")}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {BENEFITS.map((b) => (
          <div key={b.title} className="rounded-xl border border-border/40 bg-secondary/40 p-4">
            <b.icon className="h-5 w-5 text-primary" />
            <h3 className="mt-2 font-heading text-sm font-bold">{t(b.title)}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t(b.desc)}</p>
          </div>
        ))}
      </div>
      <Button asChild variant="secondary" className="mt-4 w-full justify-between">
        <Link to="/perfil">
          {t("nitro.customize_profile")} <Plus className="h-4 w-4" />
        </Link>
      </Button>
    </section>
  );
}