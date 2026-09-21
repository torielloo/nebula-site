import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, LogIn } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import DiscordIcon from "@/components/DiscordIcon";
import { startDiscordLogin } from "@/lib/discordFlow";
import { safeReturnTo } from "@/lib/authReturnTo";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";

export default function Login() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [busy, setBusy] = useState(false);
  const returnTo = safeReturnTo();

  if (isAuthenticated) return <Navigate to={returnTo} replace />;

  const loginWithDiscord = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await startDiscordLogin(returnTo);
    } catch (error) {
      setBusy(false);
      toast({
        variant: "destructive",
        title: error?.response?.data?.error || error?.message || t("auth.discord_error"),
      });
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title={t("auth.login_title")}
      subtitle={t("auth.login_subtitle")}
    >
      <Button
        type="button"
        disabled={busy}
        onClick={loginWithDiscord}
        className="nebula-glow-sm flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl text-sm font-bold"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <DiscordIcon className="h-6 w-6" />}
        {busy ? t("auth.opening_discord") : t("auth.login_discord")}
      </Button>
      <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
        {t("auth.discord_hint")}
      </p>
      <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground/75">
        {t("auth.discord_only")}
      </p>
    </AuthLayout>
  );
}
