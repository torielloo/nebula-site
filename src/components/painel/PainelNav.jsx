import React, { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Crown, Menu, ChevronDown } from "lucide-react";
import { useI18n } from "@/lib/i18n";

function NavButton({ item, active, index, onSelect, layoutKey }) {
  const Icon = item.icon;
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.035, 0.4), duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => onSelect(item.value)}
      className={cn(
        "relative flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors",
        active ? "text-black" : "text-muted-foreground hover:bg-white/[0.045] hover:text-foreground"
      )}
    >
      {active && (
        <motion.span
          layoutId={layoutKey}
          className="absolute inset-0 rounded-xl bg-white shadow-[0_10px_32px_-20px_rgba(255,255,255,0.55)]"
          transition={{ type: "spring", stiffness: 400, damping: 34 }}
        />
      )}
      <Icon className="relative z-10 h-4 w-4 shrink-0" />
      <span className="relative z-10 truncate">{item.label}</span>
      {item.ownerOnly && <Crown className="relative z-10 ml-auto h-3 w-3 shrink-0 text-amber-400" />}
    </motion.button>
  );
}

function NavGroups({ groups, value, onSelect, layoutKey }) {
  let idx = 0;
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p
            className={cn(
              "mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.2em]",
              group.owner ? "text-amber-300/90" : "text-muted-foreground/55"
            )}
          >
            {group.label}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const i = idx++;
              return (
                <NavButton
                  key={item.value}
                  item={item}
                  active={value === item.value}
                  index={i}
                  onSelect={onSelect}
                  layoutKey={layoutKey}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PainelNav({ groups, value, onSelect, title }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const activeItem = groups.flatMap((g) => g.items).find((i) => i.value === value);
  const select = (v) => {
    onSelect(v);
    setOpen(false);
  };

  return (
    <>
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain rounded-3xl border border-white/[0.07] bg-[#070707]/95 p-3 pr-2 shadow-[0_24px_70px_-48px_rgba(0,0,0,1)] backdrop-blur-xl scrollbar-thin">
          <NavGroups groups={groups} value={value} onSelect={onSelect} layoutKey="painel-nav-desktop" />
        </div>
      </aside>

      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-[44px] w-full items-center gap-2.5 rounded-2xl border border-border/40 bg-card/60 px-4 py-3 text-left backdrop-blur-xl transition-colors hover:border-border/60"
        >
          <Menu className="h-4 w-4 shrink-0 text-foreground" />
          <span className="truncate text-sm font-bold">{activeItem ? activeItem.label : t("painel.nav_fallback")}</span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-[min(18rem,calc(100vw-1rem))] overflow-y-auto border-border/40 bg-popover/85 p-4 backdrop-blur-2xl sm:p-6">
            <SheetHeader className="border-b border-border/30 pb-3">
              <SheetTitle className="font-heading text-sm font-extrabold uppercase tracking-[0.2em]">
                {title}
              </SheetTitle>
            </SheetHeader>
            <div className="px-2 pb-4 pt-3">
              <NavGroups groups={groups} value={value} onSelect={select} layoutKey="painel-nav-mobile" />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}