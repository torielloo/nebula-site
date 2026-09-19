import React, { useMemo } from "react";
import { parseDate, moment } from "@/lib/time";
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { TrendingUp, Activity } from "lucide-react";
import { useI18n } from "@/lib/i18n";

moment.locale("pt-br");

const DAYS = 14;

const TOOLTIP_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "12px",
  fontSize: "12px",
  color: "hsl(var(--popover-foreground))",
};

export default function DailyCharts({ users = [], posts = [], tickets = [] }) {
  const { t } = useI18n();
  const { userSeries, usageSeries } = useMemo(() => {
    const days = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const start = moment().startOf("day").subtract(i, "days");
      days.push({ start, end: moment(start).clone().add(1, "day"), novos: 0, uso: 0 });
    }
    const bucket = (date, key) => {
      if (!date) return;
      const m = parseDate(date);
      const d = days.find((dy) => m.isSameOrAfter(dy.start) && m.isBefore(dy.end));
      if (d) d[key] += 1;
    };
    users.forEach((u) => bucket(u.created_date, "novos"));
    posts.forEach((p) => bucket(p.created_date, "uso"));
    tickets.forEach((tk) => bucket(tk.created_date, "uso"));

    let acc = users.filter((u) => u.created_date && parseDate(u.created_date).isBefore(days[0].start)).length;
    const userSeries = days.map((d) => {
      acc += d.novos;
      return {
        dia: d.start.format("DD/MM"),
        novos: d.novos,
        total: acc,
      };
    });
    const usageSeries = days.map((d) => ({
      dia: d.start.format("DD/MM"),
      uso: d.uso,
    }));
    return { userSeries, usageSeries };
  }, [users, posts, tickets]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-border/40 bg-secondary/40 p-5">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-bold">{t("painel.dc_growth")}</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">{t("painel.dc_growth_hint", { days: DAYS })}</p>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={userSeries} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="fillNovos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="dia" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area
                type="monotone"
                dataKey="novos"
                name={t("painel.ws_users")}
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                fill="url(#fillNovos)"
              />
              <Line
                type="monotone"
                dataKey="total"
                name={t("painel.dc_total_users")}
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                dot={false}
                yAxisId={0}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-secondary/40 p-5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-bold">{t("painel.dc_usage_title")}</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">{t("painel.dc_usage_hint", { days: DAYS })}</p>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={usageSeries} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="fillUso" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="dia" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area
                type="monotone"
                dataKey="uso"
                name={t("painel.dc_usage")}
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                fill="url(#fillUso)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}