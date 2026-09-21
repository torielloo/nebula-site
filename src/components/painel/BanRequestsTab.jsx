import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Loader2, ShieldOff, Trash2 } from "lucide-react";
import { parseDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { logStaffAction } from "@/lib/ticketMeta";

const STATUS_META = {
  pending: { key: "painel.rep_pending", cls: "bg-amber-500/15 text-amber-400" },
  approved: { key: "painel.br_unbanned", cls: "bg-emerald-500/15 text-emerald-400" },
  rejected: { key: "nitro.req_rejected", cls: "bg-white/10 text-white" },
};

export default function BanRequestsTab({ user }) {
  const { t } = useI18n();
  const [requests, setRequests] = useState(null);
  const [form, setForm] = useState({ user_name: "", reason: "", appeal: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setRequests(await base44.entities.BanRequest.list("-created_date", 100));
  };

  useEffect(() => {
    load().catch(() => setRequests([]));
  }, []);

  const register = async (e) => {
    e.preventDefault();
    if (!form.user_name.trim() || !form.appeal.trim() || saving) return;
    setSaving(true);
    try {
      await base44.entities.BanRequest.create({
        ...form,
        code: `DB-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
        status: "pending",
      });
      await logStaffAction(user, "pedido_desban_registrado", `Pedido de desban (${form.user_name})`);
      setForm({ user_name: "", reason: "", appeal: "" });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const decide = async (r, status) => {
    await base44.entities.BanRequest.update(r.id, {
      status,
      handled_by: user.full_name || (user.email || "Staff").split("@")[0],
    });
    await logStaffAction(
      user,
      status === "approved" ? "desban_aprovado" : "desban_recusado",
      `Pedido #${r.id.slice(-4).toUpperCase()} (${r.user_name})`,
      r.id
    );
    await load();
  };

  const removeRequest = async (r) => {
    if (!["admin", "dev", "owner"].includes(user?.role || "")) return;
    if (!window.confirm(`Apagar permanentemente o pedido de desban ${r.code || r.id}?`)) return;
    await base44.entities.BanRequest.delete(r.id);
    await logStaffAction(user, "pedido_desban_apagado", `Apagou pedido de desban ${r.code || r.id} (${r.user_name})`, r.id).catch(() => {});
    await load();
  };

  const sorted = [...(requests || [])].sort((a, b) =>
    (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || parseDate(b.created_date).diff(parseDate(a.created_date))
  );

  return (
    <div className="space-y-4">
      <form onSubmit={register} className="rounded-xl border border-white/10 bg-secondary/40 p-4">
        <div className="flex items-center gap-2">
          <ShieldOff className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">{t("painel.br_title")}</h3>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Input
            placeholder={t("painel.user_ph")}
            value={form.user_name}
            onChange={(e) => setForm({ ...form, user_name: e.target.value })}
          />
          <Input
            placeholder={t("painel.br_reason_ph")}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </div>
        <Textarea
          className="mt-2"
          placeholder={t("painel.br_appeal_ph")}
          value={form.appeal}
          onChange={(e) => setForm({ ...form, appeal: e.target.value })}
        />
        <Button type="submit" size="sm" className="mt-2" disabled={saving}>
          {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} {t("painel.br_register")}
        </Button>
      </form>

      {requests === null && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
      {requests && sorted.length === 0 && (
        <p className="p-4 text-center text-sm text-muted-foreground">{t("painel.br_none")}</p>
      )}
      {sorted.map((r) => {
        const meta = STATUS_META[r.status] || STATUS_META.pending;
        return (
          <div key={r.id} className="rounded-xl border border-white/10 bg-secondary/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-primary">{r.code || `#${r.id.slice(-4).toUpperCase()}`}</span>
              <span className="text-sm font-semibold">{r.user_name}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", meta.cls)}>{t(meta.key)}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {parseDate(r.created_date).format("DD/MM/YYYY HH:mm")}
              </span>
            </div>
            {r.reason && <p className="mt-2 text-xs text-muted-foreground">{t("painel.br_banned_by", { reason: r.reason })}</p>}
            <p className="mt-2 rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-xs italic text-muted-foreground">
              "{r.appeal}"
            </p>
            {r.handled_by && (
              <p className="mt-2 text-[11px] text-muted-foreground">{t("painel.br_reviewed_by")} <strong className="text-foreground">{r.handled_by}</strong></p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {r.status === "pending" && (
                <>
                  <Button size="sm" onClick={() => decide(r, "approved")} className="bg-emerald-600 hover:bg-emerald-600/90">
                    <Check className="mr-1 h-3.5 w-3.5" /> {t("painel.br_approve")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => decide(r, "rejected")} className="text-destructive hover:bg-destructive/10">
                    <X className="mr-1 h-3.5 w-3.5" /> {t("painel.br_reject")}
                  </Button>
                </>
              )}
              {["admin", "dev", "owner"].includes(user?.role || "") && (
                <Button size="sm" variant="ghost" className="text-red-300 hover:bg-red-500/10 hover:text-red-200" onClick={() => removeRequest(r)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Apagar registro
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}