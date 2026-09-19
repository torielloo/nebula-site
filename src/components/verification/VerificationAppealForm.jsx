import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";

export default function VerificationAppealForm({ caseId, disabled, onDone }) {
  const [explanation, setExplanation] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    if (explanation.trim().length < 10 || busy) return;
    setBusy(true); setError("");
    try {
      await base44.functions.invoke("manageVerification", { action: "appeal", case_id: caseId, explanation: explanation.trim(), context: context.trim() });
      setExplanation(""); setContext(""); onDone?.();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Não foi possível enviar a contestação.");
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="rounded-3xl border border-border/50 bg-card/60 p-5 md:p-7">
      <h2 className="font-heading text-lg font-bold">Contestar verificação</h2>
      <p className="mt-1 text-sm text-muted-foreground">Explique por que sua conta deve ser reavaliada. A equipe analisará sua solicitação.</p>
      <Textarea className="mt-5 min-h-28" value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Descreva sua contestação com pelo menos 10 caracteres" disabled={disabled || busy} />
      <Textarea className="mt-3 min-h-20" value={context} onChange={(e) => setContext(e.target.value)} placeholder="Contexto adicional (opcional)" disabled={disabled || busy} />
      {error && <p role="alert" className="mt-3 text-xs font-semibold text-destructive">{error}</p>}
      <Button type="submit" className="mt-4" disabled={disabled || busy || explanation.trim().length < 10}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar contestação</Button>
      {disabled && <p className="mt-3 text-xs text-muted-foreground">Já existe uma contestação aguardando análise.</p>}
    </form>
  );
}