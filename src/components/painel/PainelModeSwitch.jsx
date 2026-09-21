import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Crown, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function PainelModeSwitch({ ownerMode, onChange }) {
  const { t } = useI18n();
  const options = [
    { value: "staff", label: t("painel.title_staff"), icon: ShieldCheck, active: !ownerMode },
    { value: "owner", label: t("painel.title_owner"), icon: Crown, active: ownerMode },
  ];
  return (
    <div className="flex w-full rounded-full border border-white/[0.08] bg-[#080808]/90 p-1 shadow-[0_14px_40px_-30px_rgba(0,0,0,1)] backdrop-blur-xl sm:w-auto">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "relative flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-bold transition-colors sm:flex-none sm:px-4",
            o.active ? "text-black" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.active && (
            <motion.span
              layoutId="painel-mode-pill"
              className="absolute inset-0 rounded-full bg-white shadow-[0_10px_28px_-18px_rgba(255,255,255,0.6)]"
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
            />
          )}
          <o.icon className="relative z-10 h-3.5 w-3.5" />
          <span className="relative z-10">{o.label}</span>
        </button>
      ))}
    </div>
  );
}