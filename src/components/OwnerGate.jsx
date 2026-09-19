import React from "react";
import { useAuth } from "@/lib/AuthContext";
import PageShell from "@/components/PageShell";
import { isOwnerOrDev } from "@/lib/roles";

export default function OwnerGate({ children }) {
  const { user } = useAuth();
  if (!isOwnerOrDev(user)) {
    return (
      <PageShell
        label="Acesso restrito"
        title="Área exclusiva"
        subtitle="Somente o Dono ou a DEV da plataforma pode acessar este sistema."
      >
        <p className="text-sm text-muted-foreground">
          Se você deveria ter acesso a esta área, fale com a administração do Nébula OS.
        </p>
      </PageShell>
    );
  }
  return children;
}