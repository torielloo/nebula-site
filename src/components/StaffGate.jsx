import React from "react";
import { useAuth } from "@/lib/AuthContext";
import PageShell from "@/components/PageShell";
import { isStaffUser } from "@/lib/roles";

export default function StaffGate({ children }) {
  const { user } = useAuth();
  if (!isStaffUser(user)) {
    return (
      <PageShell
        label="Acesso restrito"
        title="Área da equipe"
        subtitle="Somente membros autorizados da Staff e o Dono podem usar o Core OS."
      >
        <p className="text-sm text-muted-foreground">
          Usuários comuns continuam com acesso ao suporte humano e às demais áreas permitidas da plataforma.
        </p>
      </PageShell>
    );
  }
  return children;
}