import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AuthLayout from "@/components/AuthLayout";
import ProfileAvatar from "@/components/ProfileAvatar";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Mail, Lock, ShieldCheck } from "lucide-react";
import { safeReturnTo } from "@/lib/authReturnTo";
import { DISCORD_REDIRECT_URI, readDiscordFlow, clearDiscordFlow, invokeDiscordAuth } from "@/lib/discordFlow";

// Callback público do OAuth2 do Discord. Uma vez vinculada, a conta do Discord
// sempre entra direto na MESMA conta Nébula — sem senha e sem código de email.

const syncDiscordProfile = async (discord) => {
  try {
    const current = await base44.auth.me();
    await base44.auth.updateMe({
      profile: {
        ...(current?.profile || {}),
        discord_id: discord.discord_id,
        discord_username: discord.discord_username,
        discord_display_name: discord.discord_username,
        discord_handle: discord.discord_handle || discord.discord_username,
        discord_avatar_url: discord.discord_avatar_url,
        discord_banner_url: discord.discord_banner_url || current?.profile?.discord_banner_url || "",
        discord_accent_color: discord.discord_accent_color || current?.profile?.discord_accent_color || "",
        avatar_url: current?.profile?.avatar_url || discord.discord_avatar_url,
        banner_url: current?.profile?.banner_url || discord.discord_banner_url || "",
        accent: current?.profile?.accent || discord.discord_accent_color || "",
        name: discord.discord_username,
        username: discord.discord_handle || discord.discord_username,
      },
    });
  } catch {}
};

const linkDiscordAccount = async (discord, password) => {
  try {
    await invokeDiscordAuth({
      action: "link",
      link_token: discord.link_token,
      discord_username: discord.discord_username,
      discord_handle: discord.discord_handle,
      discord_avatar_url: discord.discord_avatar_url,
      discord_banner_url: discord.discord_banner_url || "",
      discord_accent_color: discord.discord_accent_color || "",
      password,
    });
  } catch {}
};

const completeDiscordAuth = (destination) => {
  clearDiscordFlow();
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        { type: "NEBULA_DISCORD_AUTH_COMPLETE", returnTo: destination || "/" },
        window.location.origin
      );
      window.setTimeout(() => window.close(), 60);
      return;
    }
  } catch {}
  window.location.replace(destination || "/");
};

export default function DiscordCallback() {
  const [status, setStatus] = useState("exchanging"); // exchanging | form | otp | error
  const [flow, setFlow] = useState(null);
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [returnTo, setReturnTo] = useState("/");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state");
    const flowData = readDiscordFlow(state || "");
    window.history.replaceState({}, "", "/discord-callback");

    if (!code || !flowData || state !== flowData.state) {
      setStatus("error");
      return;
    }
    const destination = safeReturnTo(flowData.returnTo || "/");
    setReturnTo(destination);

    invokeDiscordAuth({
        action: "exchange",
        code,
        redirect_uri: flowData.redirectUri || DISCORD_REDIRECT_URI,
      })
      .then((res) => {
        const d = res.data;
        const discord = {
          discord_id: d.discord_id,
          link_token: d.link_token,
          discord_username: d.discord_username,
          discord_handle: d.discord_handle,
          discord_avatar_url: d.discord_avatar_url,
          discord_banner_url: d.discord_banner_url || "",
          discord_accent_color: d.discord_accent_color || "",
        };
        if (d.status === "login" && d.access_token) {
          // Login resolvido no servidor: apenas o token de sessão chega aqui.
          base44.auth.setToken(d.access_token);
          base44.auth
            .me()
            .then(() => syncDiscordProfile(discord))
            .then(() => {
              completeDiscordAuth(destination);
            })
            .catch(() => setStatus("error"));
        } else if (d.status === "register") {
          // Conta criada no servidor: confirma pelo código OTP do email —
          // a senha interna nunca sai do servidor.
          setFlow({ mode: "otp", email: d.email, discord });
          setStatus("otp");
        } else if (d.status === "exists") {
          setFlow({ mode: "exists", email: d.email, discord });
          setFormEmail(d.email || "");
          setStatus("form");
        } else {
          setFlow({ mode: "manual", email: "", discord });
          setStatus("form");
        }
      })
      .catch(() => {
        setStatus("error");
      });
  }, []);

  const handleForm = async (e) => {
    e.preventDefault();
    setError("");
    const email = (flow?.email || formEmail || "").trim();
    if (!email || !formPassword) {
      setError("Preencha o email e a senha.");
      return;
    }
    setLoading(true);
    try {
      try {
        await base44.auth.loginViaEmailPassword(email, formPassword);
      } catch (loginErr) {
        if (flow?.mode === "exists") throw loginErr;
        await base44.auth.register({ email, password: formPassword });
        await base44.auth.loginViaEmailPassword(email, formPassword);
      }
      await base44.auth.me();
      await syncDiscordProfile(flow.discord);
      await linkDiscordAccount(flow.discord, formPassword);
      completeDiscordAuth(returnTo);
    } catch (err) {
      setError(err.message || "Email ou senha inválidos");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email: flow.email, otpCode });
      if (result?.access_token) {
        base44.auth.setToken(result.access_token);
      }
      await base44.auth.me();
      await syncDiscordProfile(flow.discord);
      // A vinculação já foi criada no servidor durante o cadastro.
      completeDiscordAuth(returnTo);
    } catch (err) {
      setError(err.message || "Código de verificação inválido");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      await base44.auth.resendOtp(flow.email);
      toast({
        title: "Código enviado",
        description: "Confira seu email para o novo código.",
      });
    } catch (err) {
      setError(err.message || "Falha ao reenviar o código");
    }
  };

  if (status === "exchanging" || (status !== "form" && status !== "otp" && status !== "error")) {
    return (
      <AuthLayout icon={Loader2} title="Entrando com Discord" subtitle="Confirmando sua identidade...">
        <div className="flex justify-center py-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AuthLayout>
    );
  }

  if (status === "error") {
    return (
      <AuthLayout
        icon={ShieldCheck}
        title="Não foi possível entrar"
        subtitle="A autenticação com o Discord falhou ou expirou."
        footer={<Link to="/login" className="text-primary font-medium hover:underline">Voltar para o login</Link>}
      >
        <p className="text-center text-sm text-muted-foreground">
          Tente novamente pelo botão "Entrar com Discord".
        </p>
      </AuthLayout>
    );
  }

  if (status === "otp") {
    return (
      <AuthLayout
        icon={Mail}
        title="Verifique seu email"
        subtitle={`Enviamos um código para ${flow?.email}`}
        footer={<Link to="/login" className="text-primary font-medium hover:underline">Voltar para o login</Link>}
      >
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}
        <div className="flex justify-center mb-6">
          <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus autoComplete="one-time-code">
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button
          className="w-full h-12 font-medium"
          onClick={handleVerify}
          disabled={loading || otpCode.length < 6}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verificando...
            </>
          ) : (
            "Verificar"
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground mt-4">
          Não recebeu o código?{" "}
          <button onClick={handleResend} className="text-primary font-medium hover:underline">
            Reenviar
          </button>
        </p>
      </AuthLayout>
    );
  }

  const needsEmailInput = flow?.mode === "manual" || !flow?.email;

  return (
    <AuthLayout
      icon={ShieldCheck}
      title={flow?.mode === "exists" ? "Vincule sua conta" : "Complete seu cadastro"}
      subtitle={flow?.mode === "exists" ? "Digite sua senha da Nébula para vincular o Discord" : "Escolha uma senha para sua conta"}
      footer={<Link to="/login" className="text-primary font-medium hover:underline">Voltar para o login</Link>}
    >
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-border/40 bg-secondary/40 p-4">
        <ProfileAvatar name={flow?.discord?.discord_username || "Você"} avatar={flow?.discord?.discord_avatar_url} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{flow?.discord?.discord_username}</p>
          <p className="text-xs text-emerald-400">Discord autorizado</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <form onSubmit={handleForm} className="space-y-4">
        {needsEmailInput && (
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
        )}
        {!needsEmailInput && (
          <div className="rounded-lg border border-border/40 bg-secondary/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Conta</p>
            <p className="text-sm font-semibold">{flow?.email}</p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete={flow?.mode === "exists" ? "current-password" : "new-password"}
              placeholder={flow?.mode === "exists" ? "Sua senha da Nébula" : "Digite uma senha"}
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Entrando...
            </>
          ) : (
            "Entrar na Nébula"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}