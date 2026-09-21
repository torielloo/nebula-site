import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Gift, Loader2 } from "lucide-react";
import { parseDate } from "@/lib/time";

function normalize(value) {
  const raw = String(value || "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
  const compact = raw.replace(/-/g, "");
  if (/^NB[A-Z2-9]{12}$/.test(compact)) {
    return `NB-${compact.slice(2, 6)}-${compact.slice(6, 10)}-${compact.slice(10, 14)}`;
  }
  return raw;
}

export default function NitroCodeRedeem({ active = false, validUntil = null, onRedeemed }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const redeem = async () => {
    const normalized = normalize(code);
    if (!normalized || busy) return;
    setBusy(true);
    setError("");
    setSuccess(null);
    try {
      const res = await base44.functions.invoke("nitroCodes", { action: "redeem", code: normalized });
      const data = res?.data || {};
      setSuccess(data);
      setCode("");
      await Promise.resolve(onRedeemed?.()).catch(() => {});
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Não foi possível resgatar este código.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card/60 to-card/40 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
          <Gift className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary">Código Nitro</p>
          <h2 className="mt-1 font-heading text-lg font-extrabold">Resgatar código</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Use um código oficial do Nébula para ativar ou renovar seu Nitro. Códigos são de uso único.
            {active && validUntil ? ` Se você já tem Nitro, os novos dias serão adicionados após ${parseDate(validUntil).format("DD/MM/YYYY HH:mm")}.` : ""}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          value={code}
          onChange={(event) => setCode(normalize(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              redeem();
            }
          }}
          placeholder="NB-XXXX-XXXX-XXXX"
          autoComplete="off"
          spellCheck={false}
          className="font-mono uppercase tracking-wider"
        />
        <Button onClick={redeem} disabled={busy || !code.trim()} className="sm:min-w-36">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gift className="mr-2 h-4 w-4" />}
          Resgatar
        </Button>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
          {error}
        </p>
      )}
      {success && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {success.already_redeemed
              ? "Este código já tinha sido resgatado por você."
              : `Código resgatado com sucesso. ${success.duration_days || ""}${success.duration_days ? " dias adicionados ao Nitro." : "Nitro atualizado."}`}
            {success.valid_until ? ` Nova validade: ${parseDate(success.valid_until).format("DD/MM/YYYY HH:mm")}.` : ""}
          </span>
        </div>
      )}
    </section>
  );
}
