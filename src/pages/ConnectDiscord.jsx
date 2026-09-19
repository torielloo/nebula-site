import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import DiscordIcon from "@/components/DiscordIcon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { startDiscordLogin } from "@/lib/discordFlow";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function ConnectDiscord() {
  const { isAuthenticated, isLoadingAuth, isDiscordLinked, isLoadingDiscordLink, discordLinkError, authError } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (isLoadingAuth || isLoadingDiscordLink) return null;
  if (!isAuthenticated || authError) return <Navigate to="/login" replace />;
  const returnTo = safeReturnTo();
  if (isDiscordLinked) return <Navigate to={returnTo} replace />;
  return (
    <AuthLayout icon={ShieldCheck} title="Vincule seu Discord" subtitle="Autorize o Discord para concluir seu acesso ao Nébula OS.">
      <Button disabled={busy} className="h-14 w-full rounded-2xl font-bold" onClick={async () => {
        setBusy(true);
        setError("");
        try { await startDiscordLogin(returnTo); }
        catch (err) { setError(err?.response?.data?.error || err?.message || "Não foi possível iniciar o Discord."); setBusy(false); }
      }}>
        <DiscordIcon className="mr-2 h-5 w-5" /> {busy ? "Abrindo Discord..." : "Vincular Discord"}
      </Button>
      {(error || discordLinkError) && <p className="mt-3 text-sm text-destructive">{error || discordLinkError}</p>}
      <p className="mt-3 text-center text-xs text-muted-foreground">Seu nome, @, ID e foto do Discord serão importados. Você poderá editar o banner e outras preferências no perfil.</p>
    </AuthLayout>
  );
}
