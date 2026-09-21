import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Filter, History, Loader2, Search } from "lucide-react";
import { parseDate } from "@/lib/time";
import { isModerator } from "@/lib/roles";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ACTION_LABEL = {
  status_ticket: "painel.log_status_ticket",
  assumir_ticket: "painel.log_assumir_ticket",
  respondeu_ticket: "painel.log_respondeu_ticket",
  denuncia_aprovada: "painel.log_denuncia_aprovada",
  denuncia_rejeitada: "painel.log_denuncia_rejeitada",
  alterou_cargo: "painel.log_alterou_cargo",
  convite_usuario: "painel.log_convite_usuario",
  config_sistema: "painel.log_config_sistema",
  erro_base: "painel.log_erro_base",
  moderacao_plataforma: "painel.log_moderacao_plataforma",
  patch_criado: "painel.log_patch_criado",
  patch_publicado: "painel.log_patch_publicado",
  patch_excluido: "painel.log_patch_excluido",
};

const CATEGORIES = [
  ["all", "Tudo"],
  ["tickets", "Tickets"],
  ["moderation", "Moderação"],
  ["users", "Usuários"],
  ["content", "Conteúdo"],
  ["security", "Segurança"],
  ["system", "Sistema"],
];

const PAGE_SIZE = 12;

function categoryFor(log) {
  const raw = `${log?.action || ""} ${log?.details || ""}`.toLowerCase();
  if (/ticket|kanban|atendimento/.test(raw)) return "tickets";
  if (/denunc|report|pun|ban|mute|kick|moder|telagem|screening|verification/.test(raw)) return "moderation";
  if (/cargo|role|usuario|usuário|equipe|convite|staff/.test(raw)) return "users";
  if (/patch|noticia|notícia|news|download/.test(raw)) return "content";
  if (/security|seguran|integridade|prompt|guard|ataque/.test(raw)) return "security";
  return "system";
}

export default function LogsTab({ user }) {
  const { t } = useI18n();
  const [logs, setLogs] = useState(null);
  const [onlyMine, setOnlyMine] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const me = user?.full_name || user?.profile?.display_name || user?.profile?.name || (user?.email || "").split("@")[0];
  const canToggleMine = isModerator(user);

  useEffect(() => {
    let alive = true;
    const load = () => base44.entities.StaffLog.list("-created_date", 500)
      .then((rows) => { if (alive) setLogs(rows || []); })
      .catch(() => { if (alive) setLogs([]); });

    load();
    const unsubscribe = base44.entities.StaffLog.subscribe(() => load());
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (logs || []).filter((log) => {
      if (onlyMine && log.actor_name !== me && log.actor_id !== user?.id) return false;
      const cat = categoryFor(log);
      if (category !== "all" && cat !== category) return false;
      if (q && !`${log.action || ""} ${log.details || ""} ${log.actor_name || ""} ${log.target_id || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, onlyMine, me, user?.id, category, search]);

  useEffect(() => setPage(1), [onlyMine, category, search]);

  const maxPage = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, maxPage);
  const pageRows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const groupedByDate = pageRows.reduce((acc, row) => {
    const key = row.created_date ? parseDate(row.created_date).format("DD/MM/YYYY") : "Sem data";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-border/40 bg-card/45 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <div>
              <h2 className="font-heading text-sm font-bold">{t("painel.log_title")}</h2>
              <p className="text-[10px] text-muted-foreground">{visible.length} ações encontradas</p>
            </div>
          </div>

          <div className="relative ml-auto w-full md:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por ação, detalhe, staff ou ID..."
              className="h-9 pl-9 text-xs"
            />
          </div>

          <label className={cn("flex items-center gap-2 rounded-xl border border-border/40 bg-background/50 px-3 py-2 text-xs font-semibold", !canToggleMine && "opacity-60")}>
            {t("painel.log_mine")}
            <Switch
              checked={onlyMine}
              onCheckedChange={(value) => canToggleMine && setOnlyMine(value)}
              disabled={!canToggleMine}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"><Filter className="h-3 w-3" />Categorias</span>
          {CATEGORIES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                category === key ? "border-primary/30 bg-primary/10 text-primary" : "border-border/40 bg-background/35 text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {logs === null ? (
        <div className="grid min-h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">{t("painel.log_empty")}</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(groupedByDate).map(([date, rows]) => (
            <section key={date} className="overflow-hidden rounded-2xl border border-border/40 bg-card/35">
              <div className="flex items-center justify-between border-b border-border/30 px-4 py-2.5">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">{date}</p>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{rows.length}</span>
              </div>
              <div className="divide-y divide-border/25">
                {rows.map((log) => {
                  const cat = categoryFor(log);
                  return (
                    <div key={log.id} className="grid gap-2 px-4 py-3 transition hover:bg-white/[0.015] sm:grid-cols-[110px_1fr_auto] sm:items-start">
                      <span className="w-fit rounded-full border border-border/40 bg-secondary/50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{CATEGORIES.find(([key]) => key === cat)?.[1] || "Sistema"}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{ACTION_LABEL[log.action] ? t(ACTION_LABEL[log.action]) : log.action}</p>
                        {log.details && <p className="mt-0.5 break-words text-xs text-muted-foreground">{log.details}</p>}
                        {!onlyMine && <p className="mt-1 text-[11px] text-primary">{t("painel.tk_by", { name: log.actor_name })}</p>}
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{log.created_date ? parseDate(log.created_date).format("HH:mm:ss") : ""}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-card/35 px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Página {currentPage} de {maxPage} · {visible.length} registros</p>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={currentPage >= maxPage} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
