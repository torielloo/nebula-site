import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { safeReturnTo } from "@/lib/authReturnTo";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, Mail, UserPlus } from "lucide-react";

export default function Register() {
  const navigate = useNavigate();
  const returnTo = safeReturnTo();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password || loading) return;
    setLoading(true);
    setError("");
    try {
      await base44.auth.register({ email: email.trim(), password, full_name: name.trim() || undefined });
      await base44.auth.loginViaEmailPassword(email.trim(), password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Não foi possível criar a conta agora.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={UserPlus}
      title="Criar conta Nébula"
      subtitle="Cadastre-se para acessar o Nébula OS"
      footer={<span>Já tem uma conta? <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="font-semibold text-primary hover:underline">Entrar</Link></span>}
    >
      {error && <p role="alert" className="mb-3 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground">{error}</p>}
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-12" placeholder="Seu nome" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 pl-10" placeholder="seu@email.com" required /></div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <div className="relative"><Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pl-10" placeholder="Mínimo 8 caracteres" required minLength={8} /></div>
        </div>
        <Button type="submit" className="h-12 w-full font-semibold" disabled={loading || !email.trim() || !password}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar conta
        </Button>
      </form>
    </AuthLayout>
  );
}
