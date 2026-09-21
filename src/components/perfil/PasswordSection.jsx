import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const inputCls =
  "h-10 rounded-lg border border-white/10 bg-white/[0.04] text-sm transition-colors placeholder:text-muted-foreground/60 focus-visible:border-white/25 focus-visible:ring-white/10";

export default function PasswordSection({ user }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    setMsg("");
    if (!form.current) {
      setError("Digite sua senha atual para confirmar a alteração.");
      return;
    }
    if (!form.next || form.next.length < 10) {
      setError("A nova senha precisa ter pelo menos 10 caracteres.");
      return;
    }
    if (form.next !== form.confirm) {
      setError(t("perfil.password_mismatch"));
      return;
    }
    setBusy(true);
    try {
      await base44.auth.changePassword({
        userId: user.id,
        currentPassword: form.current,
        newPassword: form.next,
      });
      setMsg("Senha alterada com segurança. Nenhum código por e-mail foi necessário.");
      setForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || t("perfil.password_error"));
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, placeholder) => (
    <div>
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <Input
        type="password"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        className={cn(inputCls, "mt-1.5")}
      />
    </div>
  );

  return (
    <section className="rounded-2xl bg-white/[0.04] p-5 md:p-6">
      <h3 className="font-heading text-base font-bold">{t("perfil.password_title")}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Atualize sua senha usando a senha atual. A alteração é feita pelo sistema de autenticação da sua própria conta.
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground">E-mail atual</label>
          <Input value={user?.email || ""} disabled className={cn(inputCls, "mt-1.5 opacity-70")} />
        </div>
        {field("current", t("perfil.current_password"), "••••••••")}
        <div className="border-t border-white/10 pt-3" />
        {field("next", t("perfil.new_password"), "••••••••")}
        {field("confirm", t("perfil.confirm_password"), "••••••••")}
        {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
        {msg && <p className="text-xs font-semibold text-emerald-400">{msg}</p>}
        <Button onClick={submit} disabled={busy || !user?.id} className="min-h-[44px] w-full">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("perfil.change_password")}
        </Button>
      </div>
    </section>
  );
}
