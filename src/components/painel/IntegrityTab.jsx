import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Activity, AlertTriangle, CheckCircle2, FileWarning, Flag, LifeBuoy, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export default function IntegrityTab({ tickets, reports }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState(null);
  const [errorCount, setErrorCount] = useState(null);

  useEffect(() => {
    base44.entities.SystemSetting.list()
      .then((l) => setSettings(l[0] || null))
      .catch(() => setSettings(null));
    base44.entities.KnownError.list("-created_date", 100)
      .then((r) => setErrorCount(r.length))
      .catch(() => setErrorCount(0));
  }, []);

  const openTickets = (tickets || []).filter(
    (tk) => ["novo", "em_atendimento", "aguardando_usuario"].includes(tk.status || "novo")
  ).length;
  const pendingReports = (reports || []).filter((r) => (r.status || "pending") === "pending").length;

  const cards = [
    {
      icon: settings && settings.maintenance_mode ? Wrench : CheckCircle2,
      label: t("painel.it_mode"),
      value: settings ? (settings.maintenance_mode ? t("painel.it_maintenance") : t("painel.it_normal")) : "—",
      ok: !settings || !settings.maintenance_mode,
    },
    {
      icon: Activity,
      label: t("painel.it_version"),
      value: settings && settings.current_version ? `v${settings.current_version}` : "—",
      ok: true,
    },
    { icon: LifeBuoy, label: t("painel.it_open"), value: openTickets, ok: openTickets < 10 },
    { icon: Flag, label: t("painel.card_pending_reports"), value: pendingReports, ok: pendingReports === 0 },
    { icon: FileWarning, label: t("painel.card_errors_base"), value: errorCount === null ? "—" : errorCount, ok: true },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-white/10 bg-secondary/40 p-4">
            <c.icon className={cn("h-5 w-5", c.ok ? "text-emerald-400" : "text-amber-400")} />
            <p className="mt-2 font-display text-xl font-extrabold">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-secondary/40 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Activity className="h-4 w-4 text-primary" /> {t("painel.it_health")}
        </h3>
        <ul className="mt-3 space-y-2 text-xs">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> {t("painel.it_auth")}
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> {t("painel.it_kb")}
            {errorCount !== null ? ` (${t("painel.it_solutions", { count: errorCount })})` : ""}
          </li>
          <li className="flex items-center gap-2">
            {settings && settings.maintenance_mode ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                {settings.maintenance_message || t("painel.it_maintenance_msg")}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> {t("painel.it_stable")}
              </>
            )}
          </li>
        </ul>
      </div>
    </div>
  );
}