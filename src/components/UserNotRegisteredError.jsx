import { AlertTriangle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

export default function UserNotRegisteredError() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <section className="w-full max-w-md rounded-xl border border-border/70 bg-card p-6">
        <AlertTriangle className="h-7 w-7 text-amber-500" />
        <h1 className="mt-4 font-heading text-xl font-bold">Acesso não liberado</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Esta conta ainda não tem acesso à Nébula OS. Entre com a conta correta ou peça à administração para liberar seu acesso.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" onClick={() => base44.auth.logout(window.location.href)}>
            <LogOut className="mr-2 h-4 w-4" /> Sair e trocar conta
          </Button>
        </div>
      </section>
    </main>
  );
}
