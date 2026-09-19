import React from "react";
import NebulaLogo3D from "@/components/three/NebulaLogo3D";

/**
 * Tela de instalação de patch — trava todo o site quando o modo
 * atualização está ativo (Painel → Sistema → Modo atualização).
 * Staff/Owner podem entrar mesmo assim para administrar.
 */
export default function UpdateLock({ message, version, canBypass, onBypass }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 backdrop-blur-xl">
      <div className="flex flex-col items-center px-6 text-center">
        <NebulaLogo3D className="h-28 w-28" spin />
        <h1 className="mt-6 font-display text-2xl font-extrabold md:text-3xl">
          Instalando patch de atualização
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {message || "O Nébula OS está recebendo uma nova versão. Volte em instantes."}
        </p>
        <div className="mt-6 h-1 w-64 overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-1/3 animate-updatebar rounded-full bg-primary" />
        </div>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          {version ? `Versão ${version}` : "Nébula OS"}
        </p>
        {canBypass && (
          <button
            onClick={onBypass}
            className="mt-8 text-xs font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Entrar mesmo assim (staff)
          </button>
        )}
      </div>
    </div>
  );
}