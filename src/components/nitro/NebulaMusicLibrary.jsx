import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NebulaMusicLibrary({ active = false }) {
  return (
    <section className="rounded-2xl border border-border/40 bg-card/35 p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-primary/15 bg-primary/[0.07] text-primary">
          <Music2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
            Benefício {active ? "Nitro ativo" : "Nitro"}
          </p>
          <h2 className="mt-1 font-heading text-lg font-extrabold">Nébula Mixer</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Use seus benefícios Nitro dentro do Nébula Mixer. Biblioteca, playlists, player,
            uploads pessoais e gerenciamento de músicas agora ficam somente na página própria do Mixer.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0 rounded-full">
          <Link to="/mixer">
            Abrir Nébula Mixer <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
