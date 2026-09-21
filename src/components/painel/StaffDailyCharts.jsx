import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { parseDate, moment } from "@/lib/time";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { CheckCircle2, Timer } from "lucide-react";
import { useI18n } from "@/lib/i18n";

moment.locale("pt-br");

const DAYS = 7;

const TOOLTIP_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "12px",
  fontSize: "12px",
  color: "hsl(var(--popover-foreground))",
};

const fmtDuration = (hours) => {
  if (hours === null) return "—";
  const mins = Math.round(hours * 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}min`;
};

export default function StaffDailyCharts({ tickets = [] }) {
  const { t } = useI18n();
  const [staffMsgs, setStaffMsgs] = useState(null);

  useEffect(() => {
    base44.entities.TicketMessage.filter({ is_staff: true }, "created_date", 500)
      .then(setStaffMsgs)
      .catch(() => setStaffMsgs([]));
  }, []);

  const { resolvedToday, resolvedSeries, avgResponse, answeredCount, responseSeries } = useMemo(() => {
    const days = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const start = moment().startOf("day").subtract(i, "days");
      days.push({ start, end: moment(start).clone().add(1, "day"), resolvidos: 0, respostas: [] });
    }
    const inDay = (date) => {
      if (!date) return null;
      const m = parseDate(date);
      return days.find((d) => m.isSameOrAfter(d.start) && m.isBefore(d.end)) || null;
    };

    tickets.forEach((tk) => {
      if ((tk.status === "resolvido" || tk.status === "fechado") && tk.updated_date) {
        const d = inDay(tk.updated_date);
        if (d) d.resolvidos += 1;
      }
    });

    const firstReply = {};
    (staffMsgs || []).forEach((m) => {
      if (!m.ticket_id || !m.created_date) return;
      if (!firstReply[m.ticket_id] || parseDate(m.created_date).isBefore(parseDate(firstReply[m.ticket_id]))) {
        firstReply[m.ticket_id] = m.created_date;
      }
    });
    const ticketById = {};
    tickets.forEach((tk) => {
      ticketById[tk.id] = tk;
    });
    Object.entries(firstReply).forEach(([tid, when]) => {
      const tk = ticketById[tid];
      if (!tk || !tk.created_date) return;
      const d = inDay(when);
      if (d) d.respostas.push(parseDate(when).diff(parseDate(tk.created_date), "minutes", true) / 60);
    });

    const resolvedSeries = days.map((d) => ({ dia: d.start.format("DD/MM"), resolvidos: d.resolvidos }));
    const responseSeries = days.map((d) => ({
      dia: d.start.format("DD/MM"),
      tempo: d.respostas.length
        ? +(d.respostas.reduce((a, b) => a + b, 0) / d.respostas.length).toFixed(1)
        : 0,
    }));

    const allRespostas = days.flatMap((d) => d.respostas);
    const avgResponse = allRespostas.length
      ? allRespostas.reduce((a, b) => a + b, 0) / allRespostas.length
      : null;

    return {
      resolvedToday: days[days.length - 1].resolvidos,
      resolvedSeries,
      avgResponse,
      answeredCount: new Set(Object.keys(firstReply)).size,
      responseSeries,
    };
  }, [tickets, staffMsgs]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-border/40 bg-secondary/40 p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-bold">{t("painel.sc_resolved_today")}</h2>
          <span className="ml-auto font-display text-3xl font-extrabold text-primary">{resolvedToday}</span>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">{t("painel.sc_resolved_hint", { days: DAYS })}</p>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={resolvedSeries} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="dia" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="resolvidos" name={t("painel.kb_resolved")} radius={[4, 4, 0, 0]}>
                {resolvedSeries.map((d, i) => (
                  <Cell
                    key={d.dia}
                    fill={i === resolvedSeries.length - 1 ? "hsl(var(--chart-1))" : "hsl(var(--muted-foreground) / 0.4)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-secondary/40 p-5">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-bold">{t("painel.sc_avg_title")}</h2>
          <span className="ml-auto font-display text-3xl font-extrabold text-primary">{fmtDuration(avgResponse)}</span>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          {t("painel.sc_avg_hint", { count: answeredCount || "0", days: DAYS })}
        </p>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={responseSeries} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="dia" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="tempo" name={t("painel.sc_avg_time")} fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}