import React, { useMemo } from "react";
import { parseDate, moment } from "@/lib/time";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import { Users, MessageSquare, Ticket as TicketIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

moment.locale("pt-br");

const WEEKS = 8;

const CARD_DEFS = [
  { key: "usuarios", icon: Users, label: "painel.ws_users", color: "hsl(var(--chart-1))" },
  { key: "posts", icon: MessageSquare, label: "painel.ws_posts", color: "hsl(var(--chart-2))" },
  { key: "tickets", icon: TicketIcon, label: "painel.it_open", color: "hsl(var(--chart-3))" }
];

export default function WeeklyStats({ users, tickets, posts }) {
  const { t } = useI18n();
  const { series, current, previous } = useMemo(() => {
    const weeks = [];
    for (let i = WEEKS - 1; i >= 0; i--) {
      const start = moment().startOf("week").subtract(i, "weeks");
      weeks.push({ start, end: moment(start).clone().add(1, "week"), usuarios: 0, posts: 0, tickets: 0 });
    }
    const bucket = (date, key) => {
      if (!date) return;
      const m = parseDate(date);
      const w = weeks.find((wk) => m.isSameOrAfter(wk.start) && m.isBefore(wk.end));
      if (w) w[key] += 1;
    };
    (users || []).forEach((u) => bucket(u.created_date, "usuarios"));
    (posts || []).forEach((p) => bucket(p.created_date, "posts"));
    (tickets || []).forEach((tk) => bucket(tk.created_date, "tickets"));

    const series = weeks.map((w) => ({
      semana: w.start.format("DD/MM"),
      usuarios: w.usuarios,
      posts: w.posts,
      tickets: w.tickets
    }));
    return {
      series,
      current: weeks[weeks.length - 1],
      previous: weeks[weeks.length - 2]
    };
  }, [users, tickets, posts]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CARD_DEFS.map((def) => {
          const delta = current[def.key] - previous[def.key];
          return (
            <div key={def.key} className="rounded-2xl border border-border/40 bg-secondary/40 p-5">
              <div className="flex items-center gap-2">
                <def.icon className="h-5 w-5" style={{ color: def.color }} />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(def.label)} · {t("painel.ws_this_week")}
                </p>
              </div>
              <div className="mt-3 flex items-end gap-3">
                <p className="font-display text-4xl font-extrabold">{current[def.key]}</p>
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                    delta > 0
                      ? "bg-emerald-500/15 text-emerald-400"
                      : delta < 0
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                  {delta > 0 ? `+${delta}` : delta} {t("painel.ws_vs")}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border/40 bg-secondary/40 p-5">
        <h2 className="font-heading text-base font-bold">{t("painel.ws_title")}</h2>
        <p className="mb-4 text-xs text-muted-foreground">{t("painel.ws_subtitle", { count: WEEKS })}</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="semana" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "12px",
                  fontSize: "12px",
                  color: "hsl(var(--popover-foreground))"
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="usuarios" name={t("painel.ws_users_n")} fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="posts" name={t("painel.ws_posts_n")} fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="tickets" name={t("painel.ws_tickets_n")} fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}