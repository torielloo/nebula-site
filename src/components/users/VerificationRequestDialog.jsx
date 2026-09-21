import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ShieldAlert } from "lucide-react";

export default function VerificationRequestDialog({ open, onOpenChange, target, onDone }) {
  const [internalReason, setInternalReason] = useState("");
  const [publicReason, setPublicReason] = useState("Sua conta precisa passar por uma revisão adicional devido a atividade sinalizada. Algumas funções ficarão temporariamente limitadas até a conclusão.");
  const [restrictions, setRestrictions] = useState({ messages: true, posts: false, interactions: true, manual_review: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setInternalReason("");
      setError("");
    }
  }, [open]);

  const submit = async () => {
    if (!target?.id || !internalReason.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await base44.functions.invoke("manageVerification", {
        action: "request",
        user_id: target.id,
        reason_internal: internalReason.trim(),
        reason_public: publicReason.trim(),
        restrictions,
        appeal_available: true,
      });
      onDone?.(res.data?.case);
      onOpenChange(false);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Não foi possível atualizar a conta. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl border-border/50 bg-popover/95 backdrop-blur-xl">
        <DialogHeader>
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-amber-500/10 text-amber-400"><ShieldAlert className="h-5 w-5" /></div>
          <DialogTitle>Colocar usuário em processo de verificação?</DialogTitle>
          <DialogDescription>Essa ação restringe somente funções selecionadas e fica registrada no histórico administrativo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/40 bg-secondary/40 p-3 text-xs">
            <p className="font-bold">{target?.name || target?.full_name || "Usuário"}</p>
            <p className="mt-1 font-mono text-muted-foreground">{target?.id || "—"}</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold">Motivo interno</label>
            <Textarea value={internalReason} onChange={(e) => setInternalReason(e.target.value)} rows={4} placeholder="Explique para a equipe por que a verificação é necessária." />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold">Motivo apresentado ao usuário</label>
            <Textarea value={publicReason} onChange={(e) => setPublicReason(e.target.value)} rows={3} />
          </div>
          <div className="grid gap-2 rounded-2xl border border-border/40 bg-card/60 p-3 sm:grid-cols-2">
            {[
              ["messages", "Restringir mensagens"],
              ["posts", "Restringir publicações"],
              ["interactions", "Restringir interações"],
              ["manual_review", "Exigir análise manual"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" checked={!!restrictions[key]} onChange={(e) => setRestrictions((r) => ({ ...r, [key]: e.target.checked }))} />
                {label}
              </label>
            ))}
          </div>
          {error && <p role="alert" className="text-xs font-semibold text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || !internalReason.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar verificação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}