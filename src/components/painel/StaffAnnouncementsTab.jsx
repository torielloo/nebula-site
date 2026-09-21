import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BellRing, ChevronDown, ChevronLeft, ChevronRight, Loader2, Megaphone, Search, Send, Trash2 } from "lucide-react";
import { parseDate } from "@/lib/time";
import { isAdminLevel } from "@/lib/roles";
import { cn } from "@/lib/utils";

const PRIORITY = {
  normal: { label: "Normal", cls: "bg-white/5 text-muted-foreground border-border/40" },
  important: { label: "Importante", cls: "bg-amber-500/10 text-amber-300 border-amber-500/20" },
  urgent: { label: "Urgente", cls: "bg-red-500/10 text-red-300 border-red-500/20" },
};

const ANNOUNCEMENT_GROUPS = [
  { key: "urgent", label: "Urgentes" },
  { key: "important", label: "Importantes" },
  { key: "normal", label: "Normais" },
];

const PAGE_SIZE = 5;

export default function StaffAnnouncementsTab({ user }) {
  const canPublish = isAdminLevel(user);
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ title: "", body: "", priority: "normal" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [pages, setPages] = useState({ urgent: 1, important: 1, normal: 1 });

  const load = async () => {
    const rows = await base44.entities.StaffAnnouncement.list("-created_date", 100);
    setItems((rows || []).filter((item) => item.active !== false));
  };

  useEffect(() => {
    load().catch(() => setItems([]));
    const unsubscribe = base44.entities.StaffAnnouncement.subscribe(() => load().catch(() => {}));
    return () => unsubscribe?.();
  }, []);

  const publish = async (event) => {
    event.preventDefault();
    if (!canPublish || busy || !form.title.trim() || !form.body.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      await base44.entities.StaffAnnouncement.create({
        title: form.title.trim().slice(0, 180),
        body: form.body.trim().slice(0, 5000),
        priority: form.priority,
        author_id: user.id,
        author_name: user?.profile?.display_name || user?.profile?.name || user?.full_name || (user?.email || "").split("@")[0] || "Staff",
        active: true,
      });
      setForm({ title: "", body: "", priority: "normal" });
      setMessage("Anúncio enviado para toda a equipe.");
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.error || error?.message || "Não foi possível publicar o anúncio.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item) => {
    if (!canPublish || busy || !window.confirm("Remover este anúncio da Staff?")) return;
    setBusy(true);
    try {
      await base44.entities.StaffAnnouncement.update(item.id, { active: false });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items || [];
    return (items || []).filter((item) =>
      `${item.title || ""} ${item.body || ""} ${item.author_name || ""}`.toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => {
    setPages({ urgent: 1, important: 1, normal: 1 });
  }, [query]);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-br from-primary/10 via-card/65 to-card/40 p-5 md:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/12 text-primary"><Megaphone className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary">Canal interno</p>
            <h2 className="mt-1 font-heading text-xl font-extrabold">Anúncios da Staff</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Comunicados oficiais visíveis para toda a equipe. Somente Administradores, DEV e Owners podem publicar.
            </p>
          </div>
        </div>
      </section>

      {canPublish && (
        <form onSubmit={publish} className="rounded-2xl border border-border/40 bg-card/50 p-4">
          <div className="grid gap-2 md:grid-cols-[1fr_170px]">
            <Input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} placeholder="Título do anúncio" maxLength={180} />
            <select value={form.priority} onChange={(e) => setForm((current) => ({ ...current, priority: e.target.value }))} className="h-10 rounded-xl border border-border/60 bg-background px-3 text-sm outline-none">
              <option value="normal">Normal</option>
              <option value="important">Importante</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
          <Textarea className="mt-2" rows={4} value={form.body} onChange={(e) => setForm((current) => ({ ...current, body: e.target.value }))} placeholder="Escreva o comunicado para a equipe..." maxLength={5000} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">Ao publicar, o anúncio fica disponível imediatamente para todos os cargos da Staff.</p>
            <Button type="submit" disabled={busy || !form.title.trim() || !form.body.trim()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Publicar anúncio
            </Button>
          </div>
        </form>
      )}

      {message && <p className="rounded-xl border border-border/40 bg-secondary/30 p-3 text-xs font-semibold">{message}</p>}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar anúncios..." className="pl-9" />
      </div>

      {items === null ? (
        <div className="grid min-h-28 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center">
          <BellRing className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Nenhum anúncio da equipe por enquanto.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ANNOUNCEMENT_GROUPS.map((group) => {
            const rows = filtered.filter((item) => (item.priority || "normal") === group.key);
            if (!rows.length) return null;

            const maxPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
            const page = Math.min(pages[group.key] || 1, maxPage);
            const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            const isCollapsed = !!collapsed[group.key];
            const meta = PRIORITY[group.key] || PRIORITY.normal;

            return (
              <section key={group.key} className="overflow-hidden rounded-2xl border border-border/40 bg-card/35">
                <button
                  type="button"
                  onClick={() => setCollapsed((current) => ({ ...current, [group.key]: !current[group.key] }))}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
                >
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                  <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", meta.cls)}>{group.label}</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{rows.length}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">agrupados por prioridade</span>
                </button>

                {!isCollapsed && (
                  <div className="border-t border-border/30 p-3">
                    <div className="space-y-2">
                      {pageRows.map((item) => {
                        const itemMeta = PRIORITY[item.priority] || PRIORITY.normal;
                        return (
                          <article key={item.id} className="rounded-xl border border-border/40 bg-card/55 p-4 md:p-5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", itemMeta.cls)}>{itemMeta.label}</span>
                              <span className="text-[11px] text-muted-foreground">{item.author_name}</span>
                              <span className="ml-auto text-[10px] text-muted-foreground">{item.created_date ? parseDate(item.created_date).format("DD/MM/YYYY HH:mm") : ""}</span>
                            </div>
                            <h3 className="mt-3 font-heading text-base font-bold">{item.title}</h3>
                            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                            {canPublish && (
                              <div className="mt-3 flex justify-end">
                                <Button size="sm" variant="ghost" onClick={() => remove(item)} disabled={busy} className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remover
                                </Button>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>

                    {maxPage > 1 && (
                      <div className="mt-3 flex items-center justify-between rounded-xl border border-border/30 bg-background/35 px-3 py-2">
                        <span className="text-[11px] text-muted-foreground">Página {page} de {maxPage}</span>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            disabled={page <= 1}
                            onClick={() => setPages((current) => ({ ...current, [group.key]: page - 1 }))}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            disabled={page >= maxPage}
                            onClick={() => setPages((current) => ({ ...current, [group.key]: page + 1 }))}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
