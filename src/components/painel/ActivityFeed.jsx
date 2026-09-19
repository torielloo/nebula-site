import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { UserPlus, Globe, LifeBuoy, ShieldCheck, Activity, Search, SlidersHorizontal, Cpu, Gavel, ShieldAlert } from "lucide-react";
import { parseDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const CATEGORY_META = {
  all: { label: "Tudo", icon: Activity },
  tickets: { label: "Tickets", icon: LifeBuoy },
  users: { label: "Usuários", icon: UserPlus },
  moderation: { label: "Moderação", icon: Gavel },
  security: { label: "Segurança", icon: ShieldAlert },
  system: { label: "Sistema", icon: Cpu },
};

function classifyLog(log) {
  const raw = `${log?.action || ""} ${log?.details || ""}`.toLowerCase();
  if (/ticket|chamado|kanban/.test(raw)) return "tickets";
  if (/ban|mute|kick|pun|moder|denún|denunc|telagem|cargo|role/.test(raw)) return "moderation";
  if (/seguran|security|prompt|guard|bloque|ataque|integridade|integrity/.test(raw)) return "security";
  if (/user|usu[aá]rio|login|conta|equipe|staff/.test(raw)) return "users";
  return "system";
}

function upsertLog(current, incoming) {
  if (!incoming?.id) return current;
  const map = new Map(current.map((row) => [row.id, row]));
  map.set(incoming.id, { ...(map.get(incoming.id) || {}), ...incoming });
  return [...map.values()]
    .sort((a, b) => parseDate(b.created_date).diff(parseDate(a.created_date)))
    .slice(0, 200);
}

export default function ActivityFeed({ users = [], posts = [], tickets = [] }) {
  const { t } = useI18n();
  const [logs, setLogs] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  useEffect(() => {
    let active = true;
    base44.entities.StaffLog.list("-created_date", 200)
      .then((rows) => {
        if (active) setLogs(rows || []);
      })
      .catch(() => {});

    const unsubscribe = base44.entities.StaffLog.subscribe((event) => {
      const row = event?.data;
      if (!row) return;
      setLogs((current) => {
        if (event.type === "delete") return current.filter((item) => item.id !== row.id);
        return upsertLog(current, row);
      });
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const events = useMemo(() => {
    const baseEvents = [
      ...users.slice(0, 30).map((u) => ({
        id: `user:${u.id}`,
        icon: UserPlus,
        color: "text-emerald-400",
        text: t("painel.af_user_joined", { name: u.full_name || (u.email || t("painel.af_someone")).split("@")[0] }),
        date: u.created_date,
        category: "users",
      })),
      ...posts.slice(0, 20).map((p) => ({
        id: `post:${p.id}`,
        icon: Globe,
        color: "text-sky-400",
        text: `${t("painel.af_posted", { name: p.author_name || t("common.user") })}${p.channel ? ` (#${p.channel})` : ""}`,
        date: p.created_date,
        category: "system",
      })),
      ...tickets.slice(0, 40).map((tk) => ({
        id: `ticket:${tk.id}`,
        icon: LifeBuoy,
        color: "text-amber-400",
        text: t("painel.af_new_ticket", { subject: tk.subject }),
        date: tk.created_date,
        category: "tickets",
      })),
      ...logs.map((l) => {
        const eventCategory = classifyLog(l);
        const Icon = eventCategory === "security"
          ? ShieldAlert
          : eventCategory === "moderation"
            ? Gavel
            : eventCategory === "system"
              ? Cpu
              : ShieldCheck;
        const color = eventCategory === "security"
          ? "text-red-300"
          : eventCategory === "moderation"
            ? "text-violet-300"
            : eventCategory === "tickets"
              ? "text-amber-300"
              : eventCategory === "users"
                ? "text-emerald-300"
                : "text-primary";
        return {
          id: `log:${l.id}`,
          icon: Icon,
          color,
          text: t("painel.af_staff", { name: l.actor_name, action: l.details || l.action }),
          date: l.created_date,
          category: eventCategory,
        };
      }),
    ];

    return baseEvents.sort((a, b) => parseDate(b.date).diff(parseDate(a.date)));
  }, [users, posts, tickets, logs, t]);

  const counts = useMemo(() => {
    const next = { all: events.length, tickets: 0, users: 0, moderation: 0, security: 0, system: 0 };
    events.forEach((event) => {
      if (next[event.category] !== undefined) next[event.category] += 1;
    });
    return next;
  }, [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return events
      .filter((event) => category === "all" || event.category === category)
      .filter((event) => !q || String(event.text || "").toLocaleLowerCase("pt-BR").includes(q))
      .slice(0, 100);
  }, [events, category, query]);

  return (
    <div className="overflow-hidden rounded-xl border border-border/40 bg-secondary/40">
      <div className="border-b border-border/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 font-heading text-sm font-bold">
            <Activity className="h-4 w-4 text-primary" /> {t("painel.af_title")}
          </p>
          <span className="rounded-full border border-emerald-400/15 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">
            Ao vivo
          </span>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr),auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar atividade, staff, ticket ou ação..."
              className="h-9 w-full rounded-lg border border-border/50 bg-background/55 pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/40"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin lg:pb-0">
            <SlidersHorizontal className="mr-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {Object.entries(CATEGORY_META).map(([key, meta]) => {
              const Icon = meta.icon;
              const active = category === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-bold transition-colors",
                    active
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border/45 bg-background/35 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                  <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[9px]">{counts[key] || 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="scrollbar-thin max-h-[420px] overflow-y-auto p-3">
        {filtered.length === 0 && (
          <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-border/40 text-center">
            <p className="text-xs text-muted-foreground">{query ? "Nenhuma atividade encontrada para esta busca." : t("painel.af_empty")}</p>
          </div>
        )}

        <div className="space-y-1.5">
          {filtered.map((event) => {
            const meta = CATEGORY_META[event.category] || CATEGORY_META.system;
            return (
              <div key={event.id} className="group flex items-center gap-2.5 rounded-lg border border-transparent bg-card/45 px-3 py-2 transition-colors hover:border-border/40 hover:bg-card/70">
                <event.icon className={cn("h-3.5 w-3.5 shrink-0", event.color)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">{event.text}</p>
                  <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">{meta.label}</p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{parseDate(event.date).fromNow()}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
