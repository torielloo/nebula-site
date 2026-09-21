import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { LifeBuoy, Clock, MessageCircle, Flag, FileWarning, Users, ShieldAlert } from "lucide-react";
import Reveal from "@/components/motion/Reveal";
import StaffDailyCharts from "@/components/painel/StaffDailyCharts";
import { useI18n } from "@/lib/i18n";

export default function StaffDashboard({ tickets, reports, users }) {
  const { t } = useI18n();
  const [errorCount, setErrorCount] = useState(null);
  const [verificationCount, setVerificationCount] = useState(null);

  useEffect(() => {
    base44.entities.KnownError.list("-created_date", 100)
      .then((r) => setErrorCount(r.length))
      .catch(() => setErrorCount(0));
    base44.functions.invoke("manageVerification", { action: "list", limit: 100 })
      .then((res) => setVerificationCount((res.data?.cases || []).filter((c) => ["requested", "awaiting_user", "scheduled", "in_review", "awaiting_staff"].includes(c.status)).length))
      .catch(() => setVerificationCount(0));
  }, []);

  const count = (s) => tickets.filter((tk) => (tk.status || "novo") === s).length;
  const pendingReports = reports.filter((r) => ["pending", "new", "in_review", "awaiting_info"].includes(r.status || "pending")).length;

  const cards = [
    { icon: LifeBuoy, label: t("painel.card_new_tickets"), value: count("novo") },
    { icon: Clock, label: t("ticket.status_atendimento"), value: count("em_atendimento") },
    { icon: MessageCircle, label: t("ticket.status_aguardando"), value: count("aguardando_usuario") },
    { icon: Flag, label: t("painel.card_pending_reports"), value: pendingReports },
    { icon: FileWarning, label: t("painel.card_errors_base"), value: errorCount === null ? "—" : errorCount },
    { icon: ShieldAlert, label: t("panel.card_active_verifications"), value: verificationCount === null ? "—" : verificationCount },
    ...(users ? [{ icon: Users, label: t("painel.nav_users"), value: users.length }] : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-3xl border border-white/[0.07] bg-[#060606] px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">{t("panel.staff.kicker")}</p>
          <h2 className="mt-1 font-heading text-lg font-bold tracking-tight">{t("panel.staff.title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("panel.staff.desc")}</p>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("panel.staff.badge")}</span>
      </div>
      <Reveal>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
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
      </Reveal>

      <Reveal delay={0.15}>
        <StaffDailyCharts tickets={tickets} />
      </Reveal>
    </div>
  );
}