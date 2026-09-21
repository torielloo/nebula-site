import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Users,
  LifeBuoy,
  Clock,
  MessageCircle,
  Flag,
  FileWarning,
  Zap,
  Download as DownloadIcon,
  Activity,
  ShieldAlert,
  BadgeCheck,
} from "lucide-react";
import { motion } from "framer-motion";
import Reveal from "@/components/motion/Reveal";
import ActivityFeed from "@/components/painel/ActivityFeed";
import DailyCharts from "@/components/painel/DailyCharts";
import { useI18n } from "@/lib/i18n";

export default function OwnerDashboard({
  tickets = [],
  reports = [],
  users = [],
  downloads = [],
  nitroRequests = [],
}) {
  const { t } = useI18n();
  const [errorCount, setErrorCount] = useState(null);
  const [verificationCount, setVerificationCount] = useState(null);
  const [securityCount, setSecurityCount] = useState(null);

  useEffect(() => {
    base44.entities.KnownError.list("-created_date", 100)
      .then((r) => setErrorCount(r.length))
      .catch(() => setErrorCount(0));
    base44.functions.invoke("manageVerification", { action: "list", limit: 200 })
      .then((res) => setVerificationCount((res.data?.cases || []).filter((c) => ["requested", "awaiting_user", "scheduled", "in_review", "awaiting_staff"].includes(c.status)).length))
      .catch(() => setVerificationCount(0));
    base44.entities.SecurityEvent.list("-occurred_at", 100)
      .then((rows) => setSecurityCount(rows.filter((e) => !e.reviewed && ["high", "critical"].includes(e.severity)).length))
      .catch(() => setSecurityCount(0));
  }, []);

  const count = (s) => tickets.filter((tk) => (tk.status || "novo") === s).length;
  const pendingReports = reports.filter((r) => ["pending", "new", "in_review", "awaiting_info"].includes(r.status || "pending")).length;

  const cards = [
    { icon: Users, label: t("painel.card_registered_users"), value: users.length },
    { icon: LifeBuoy, label: t("painel.card_new_tickets"), value: count("novo") },
    { icon: Clock, label: t("ticket.status_atendimento"), value: count("em_atendimento") },
    { icon: MessageCircle, label: t("ticket.status_aguardando"), value: count("aguardando_usuario") },
    { icon: Flag, label: t("painel.card_pending_reports"), value: pendingReports },
    { icon: DownloadIcon, label: t("painel.card_downloads"), value: downloads.filter((d) => d.status !== "paused").length },
    { icon: Zap, label: t("painel.card_nitro_active"), value: nitroRequests.filter((n) => n.status === "approved").length },
    { icon: FileWarning, label: t("painel.card_errors_base"), value: errorCount === null ? "—" : errorCount },
    { icon: ShieldAlert, label: t("panel.card_active_verifications"), value: verificationCount === null ? "—" : verificationCount },
    { icon: Activity, label: t("panel.card_security_alerts"), value: securityCount === null ? "—" : securityCount },
    { icon: BadgeCheck, label: t("panel.card_linked_discords"), value: users.filter((u) => !!u.profile?.discord_id).length },
  ];

  const services = [
    { label: t("painel.svc_server"), value: t("painel.svc_operational") },
    { label: t("painel.svc_coreos"), value: t("common.online") },
    { label: t("painel.svc_apis"), value: t("painel.svc_operational_plural") },
    { label: t("painel.svc_db"), value: t("painel.svc_connected") },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-3xl border border-white/[0.07] bg-[#060606] px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">{t("panel.owner.summary_kicker")}</p>
          <h2 className="mt-1 font-heading text-lg font-bold tracking-tight">{t("panel.owner.summary_title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("panel.owner.summary_desc")}</p>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("panel.owner.realtime")}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="group relative min-w-0 overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-card/80 via-secondary/35 to-card/50 p-4 shadow-[0_18px_55px_-42px_rgba(0,0,0,0.95)] transition-all hover:-translate-y-0.5 hover:border-primary/25"
          >
            <span className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/8 blur-2xl" />
            <div className="relative grid h-9 w-9 place-items-center rounded-xl border border-primary/15 bg-primary/10 text-primary"><c.icon className="h-4 w-4" /></div>
            <p className="relative mt-3 font-display text-2xl font-extrabold">{c.value}</p>
            <p className="relative break-words text-[11px] font-semibold leading-tight text-muted-foreground">{c.label}</p>
          </motion.div>
        ))}
      </div>

      <Reveal delay={0.1}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border/40 bg-secondary/40 px-4 py-3">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-primary" /> {t("painel.services_title")}
          </span>
          {services.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {s.label}: <span className="text-emerald-400">{s.value}</span>
            </span>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.15}>
        <DailyCharts users={users} posts={[]} tickets={tickets} />
      </Reveal>

      <Reveal delay={0.25}>
        <ActivityFeed users={users} posts={[]} tickets={tickets} />
      </Reveal>
    </div>
  );
}