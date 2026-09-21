import React, { lazy, Suspense, useEffect, useState } from "react";
import { Bot, Minus, Sparkles, X } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { isStaffUser } from "@/lib/roles";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const CoreOS = lazy(() => import("@/pages/CoreOS"));
const OPEN_KEY = "nebula-coreos-floating-open";

function CorePanel({ ownerMode }) {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Carregando Core OS…</div>}>
      <CoreOS mode={ownerMode ? "owner" : "staff"} context="floating" compact persistent />
    </Suspense>
  );
}

export default function FloatingCoreOS() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, open ? "1" : "0"); } catch {}
  }, [open]);

  if (!isStaffUser(user)) return null;
  const ownerMode = user?.role === "owner";

  const trigger = (
    <button
      type="button"
      onClick={isMobile ? undefined : () => setOpen(true)}
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 items-center gap-2 rounded-full border border-primary/25 bg-primary/90 px-4 text-sm font-extrabold text-primary-foreground shadow-2xl backdrop-blur-xl transition-transform hover:scale-[1.03] md:bottom-6 md:right-6"
      aria-label="Abrir Core OS"
      title={ownerMode ? "Core OS Owner" : "Core OS Staff"}
    >
      <span className="relative grid h-7 w-7 place-items-center rounded-full bg-black/20">
        <Bot className="h-4 w-4" />
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-primary" />
      </span>
      <span className="hidden sm:inline">Core OS</span>
      <Sparkles className="h-3.5 w-3.5 opacity-80" />
    </button>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="flex h-[88dvh] w-full flex-col gap-0 rounded-t-3xl border-white/10 bg-background/95 p-3 pt-12 backdrop-blur-2xl">
          <SheetHeader className="sr-only">
            <SheetTitle>{ownerMode ? "Core OS Owner" : "Core OS Staff"}</SheetTitle>
            <SheetDescription>Assistente operacional persistente do painel.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1"><CorePanel ownerMode={ownerMode} /></div>
        </SheetContent>
      </Sheet>
    );
  }

  if (!open) return trigger;

  return (
    <aside className="fixed bottom-6 right-6 z-40 flex h-[min(74vh,720px)] w-[min(440px,calc(100vw-3rem))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-background/95 p-3 shadow-[0_24px_90px_-28px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-primary"><Bot className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-extrabold">{ownerMode ? "Core OS Owner" : "Core OS Staff"}</p>
          <p className="text-[10px] text-muted-foreground">Assistente operacional · acompanha sua navegação</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground" aria-label="Minimizar Core OS" title="Minimizar">
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground" aria-label="Fechar Core OS" title="Fechar">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1"><CorePanel ownerMode={ownerMode} /></div>
    </aside>
  );
}
