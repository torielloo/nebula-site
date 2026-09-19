import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Gavel, Loader2, Trash2, Undo2 } from "lucide-react";
import { parseDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const TYPE_META = {
  ban: { label: "painel.pu_ban", cls: "bg-white/10 text-white" },
  tempban: { label: "painel.pu_tempban", cls: "bg-amber-500/15 text-amber-400" },
  mute: { label: "painel.pu_mute", cls: "bg-violet-500/15 text-violet-400" },
  kick: { label: "painel.pu_kick", cls: "bg-sky-500/15 text-sky-400" },
};

const DURATIONS = [
  { value: "0.5", label: "30 minutos" },
  { value: "1", label: "1 hora" },
  { value: "24", label: "1 dia" },
  { value: "72", label: "3 dias" },
  { value: "168", label: "7 dias" },
  { value: "720", label: "1 mês" },
];

export default function PunishmentsTab({ user }) {
  const { t } = useI18n();
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ user_name: "", type: "ban", reason: "", duration_hours: "24" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const res = await base44.functions.invoke("punishmentOps", { action: "list" });
      setItems(res.data?.punishments || []);
    } catch {
      setItems((current) => Array.isArray(current) ? current : []);
    }
  };

  useEffect(() => { load(); }, []);

  const needsDuration = form.type === "tempban" || form.type === "mute";

  const apply = async (e) => {
    e.preventDefault();
    if (!form.user_name.trim() || !form.reason.trim() || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await base44.functions.invoke("punishmentOps", {
        action: "apply",
        user: form.user_name.trim(),
        type: form.type,
        reason: form.reason.trim(),
        ...(needsDuration ? { duration_hours: Number(form.duration_hours) } : {}),
      });
      const target = res.data?.target?.name || form.user_name;
      setMessage("Punição aplicada em " + target + ".");
      setForm({ user_name: "", type: "ban", reason: "", duration_hours: "24" });
      await load();
    } catch (e) {
      setMessage(e?.response?.data?.error || t("punishments.apply_error"));
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (p) => {
    try {
      await base44.functions.invoke("punishmentOps", { action: "revoke", punishment_id: p.id });
      await load();
    } catch (e) {
      setMessage(e?.response?.data?.error || t("punishments.revoke_error"));
    }
  };

  const removeLog = async (p) => {
    if (!["admin", "dev", "owner"].includes(user?.role || "")) return;
    if (!window.confirm(`Apagar permanentemente o registro desta punição de ${p.user_name}?`)) return;
    try {
      await base44.functions.invoke("punishmentOps", { action: "delete", punishment_id: p.id });
      await load();
    } catch (e) {
      setMessage(e?.response?.data?.error || t("punishments.delete_error"));
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={apply} className="rounded-xl border border-white/10 bg-secondary/40 p-4">
        <div className="flex items-center gap-2">
          <Gavel className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">{t("painel.pu_apply_title")}</h3>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("punishments.user_hint")}
        </p>
        <div className={cn("mt-3 grid gap-2", needsDuration ? "md:grid-cols-4" : "md:grid-cols-3")}>
          <Input
            placeholder={t("punishments.user_ph")}
            value={form.user_name}
            onChange={(e) => setForm({ ...form, user_name: e.target.value })}
          />
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="h-9 w-full rounded-md border border-white/10 bg-transparent px-3 text-xs text-foreground"
          >
            {Object.entries(TYPE_META).map(([id, m]) => (
              <option key={id} value={id} className="bg-card">{t(m.label)}</option>
            ))}
          </select>
          {needsDuration && (
            <select
              value={form.duration_hours}
              onChange={(e) => setForm({ ...form, duration_hours: e.target.value })}
              className="h-9 w-full rounded-md border border-white/10 bg-transparent px-3 text-xs text-foreground"
            >
              {DURATIONS.map((item) => <option key={item.value} value={item.value} className="bg-card">{item.label}</option>)}
            </select>
          )}
          <Input
            placeholder={t("painel.pu_reason_ph")}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </div>
        <Button type="submit" size="sm" className="mt-2" disabled={saving}>
          {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} {t("painel.pu_apply")}
        </Button>
        {message && <p className="mt-2 text-xs font-semibold text-primary">{message}</p>}
      </form>

      {items === null && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
      {items && items.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">{t("painel.pu_none")}</p>}
      {items && items.map((p) => {
        const meta = TYPE_META[p.type] || TYPE_META.ban;
        const expired = !!p.expires_at && new Date(p.expires_at).getTime() <= Date.now();
        const active = p.active !== false && !expired;
        return (
          <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-secondary/40 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{p.user_name}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", meta.cls)}>{t(meta.label)}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", active ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-500/15 text-slate-400")}>{active ? t("painel.pu_active") : (expired ? "Expirada" : t("painel.pu_revoked"))}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{p.reason}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("painel.pu_by", { name: p.staff_name || "Staff" })} · {parseDate(p.created_date).format("DD/MM/YYYY HH:mm")}
                {p.expires_at ? " · expira " + parseDate(p.expires_at).format("DD/MM/YYYY HH:mm") : p.type === "ban" ? " · permanente" : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {active && <Button size="sm" variant="outline" onClick={() => revoke(p)}><Undo2 className="mr-1 h-3.5 w-3.5" /> {t("painel.pu_revoke")}</Button>}
              {["admin", "dev", "owner"].includes(user?.role || "") && (
                <Button size="sm" variant="ghost" className="text-red-300 hover:bg-red-500/10 hover:text-red-200" onClick={() => removeLog(p)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> {t("punishments.delete_log")}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
