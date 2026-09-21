import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2, Search, Copy, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { logStaffAction } from "@/lib/ticketMeta";

const EMPTY_FORM = {
  code: "",
  title: "",
  meaning: "",
  cause: "",
  identification: "",
  question_to_ask: "",
  solution: "",
  staff_reply: "",
};

export default function ErrorCenter({ canManage, user }) {
  const { t } = useI18n();
  const [errors, setErrors] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = async () => {
    const list = await base44.entities.KnownError.list("title");
    setErrors(list);
    return list;
  };

  useEffect(() => {
    load()
      .then((list) => setSelected((prev) => {
        if (prev) return list.find((e) => e.id === prev.id) || null;
        // No mobile a lista abre primeiro; o detalhe só aparece após o toque.
        // No desktop mantemos o comportamento antigo de selecionar o primeiro erro.
        return typeof window !== "undefined" && window.innerWidth >= 1024 ? (list[0] || null) : null;
      }))
      .catch(() => setErrors([]));
  }, []);

  const filtered = useMemo(() => {
    if (!errors) return [];
    const q = query.trim().toLowerCase();
    if (!q) return errors;
    return errors.filter(
      (e) =>
        e.title?.toLowerCase().includes(q) ||
        e.code?.toLowerCase().includes(q) ||
        e.meaning?.toLowerCase().includes(q)
    );
  }, [errors, query]);

  const copyReply = () => {
    if (!selected?.staff_reply) return;
    navigator.clipboard.writeText(selected.staff_reply);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setForm({
      code: selected.code || "",
      title: selected.title || "",
      meaning: selected.meaning || "",
      cause: selected.cause || "",
      identification: selected.identification || "",
      question_to_ask: selected.question_to_ask || "",
      solution: selected.solution || "",
      staff_reply: selected.staff_reply || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    try {
      if (selected && selected.title && form.title === selected.title && selected.id && form.code === (selected.code || "")) {
        // edição de um erro existente
        await base44.entities.KnownError.update(selected.id, form);
        await logStaffAction(user, "erro_base", `Solução editada: ${form.title}`);
      } else {
        await base44.entities.KnownError.create(form);
        await logStaffAction(user, "erro_base", `Nova solução criada: ${form.title}`);
      }
      setDialogOpen(false);
      const list = await load();
      setSelected(list.find((e) => e.title === form.title) || list[0] || null);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!window.confirm(t("painel.ec_confirm_delete", { title: selected.title }))) return;
    await base44.entities.KnownError.delete(selected.id);
    await logStaffAction(user, "erro_base", `Solução excluída: ${selected.title}`);
    const list = await load();
    setSelected(list[0] || null);
  };

  const FIELDS = [
    { key: "code", label: t("painel.ec_f_code"), placeholder: t("painel.ec_f_code_ph") },
    { key: "title", label: t("painel.ec_f_title"), placeholder: t("painel.ec_f_title_ph") },
    { key: "meaning", label: t("painel.ec_f_meaning"), placeholder: "" },
    { key: "cause", label: t("painel.ec_f_cause"), placeholder: "" },
    { key: "identification", label: t("solucoes.identify"), placeholder: "" },
    { key: "question_to_ask", label: t("painel.ec_f_question"), placeholder: "" },
    { key: "solution", label: t("solucoes.steps"), placeholder: "" },
    { key: "staff_reply", label: t("painel.ec_f_reply"), placeholder: "" },
  ];

  if (errors === null) {
    return <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="grid w-full max-w-[calc(100vw-1.5rem)] min-w-0 gap-4 overflow-x-hidden lg:max-w-none lg:grid-cols-[340px,1fr]">
      <div className={cn("min-w-0 space-y-3", selected && "hidden lg:block")}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("painel.ec_search_ph")}
            className="pl-9"
          />
        </div>
        {canManage && (
          <Button size="sm" onClick={openCreate} className="w-full max-w-full overflow-hidden">
            <Plus className="mr-1 h-4 w-4 shrink-0" />
            <span className="truncate">{t("painel.ec_new")}</span>
          </Button>
        )}
        <div className="scrollbar-thin max-h-[42dvh] space-y-2 overflow-y-auto overscroll-contain sm:max-h-[65vh]">
          {filtered.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">{t("painel.ec_none")}</p>
          )}
          {filtered.map((e) => (
            <button
              key={e.id}
              onClick={() => setSelected(e)}
              className={cn(
                "w-full rounded-2xl border p-4 text-left transition-colors",
                selected?.id === e.id ? "border-border/50 bg-primary/5" : "border-border/40 bg-secondary/40 hover:border-border/30"
              )}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate text-sm font-semibold">{e.title}</span>
              </div>
              {e.code && <p className="mt-1 truncate text-xs text-muted-foreground">{e.code}</p>}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("min-w-0 overflow-hidden rounded-2xl border border-border/40 bg-secondary/40 p-3 sm:p-5", !selected && "hidden lg:block")}>
        {!selected ? (
          <div className="grid h-full min-h-[200px] place-items-center text-sm text-muted-foreground">
            {t("painel.ec_select")}
          </div>
        ) : (
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mb-1 w-fit rounded-full border border-border/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground lg:hidden"
            >
              Voltar aos erros
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="break-words font-heading text-lg font-bold">{selected.title}</h2>
                {selected.code && <p className="mt-0.5 text-xs uppercase tracking-wider text-primary/80">{selected.code}</p>}
              </div>
              {canManage && (
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <Button size="sm" variant="outline" onClick={openEdit} className="h-8 min-w-0 flex-1 sm:flex-none">
                    <Pencil className="mr-1 h-3.5 w-3.5 shrink-0" /> <span className="truncate">{t("common.edit")}</span>
                  </Button>
                  <Button size="sm" variant="destructive" onClick={remove} className="h-8 min-w-0 flex-1 sm:flex-none">
                    <Trash2 className="mr-1 h-3.5 w-3.5 shrink-0" /> <span className="truncate">{t("common.delete")}</span>
                  </Button>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {selected.meaning && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("painel.ec_f_meaning")}</p>
                  <p className="mt-1 break-words text-sm">{selected.meaning}</p>
                </div>
              )}
              {selected.cause && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("painel.ec_f_cause")}</p>
                  <p className="mt-1 break-words text-sm">{selected.cause}</p>
                </div>
              )}
              {selected.identification && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("solucoes.identify")}</p>
                  <p className="mt-1 break-words text-sm">{selected.identification}</p>
                </div>
              )}
              {selected.question_to_ask && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("painel.ec_f_question_short")}</p>
                  <p className="mt-1 break-words text-sm">{selected.question_to_ask}</p>
                </div>
              )}
            </div>

            {selected.solution && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("solucoes.steps")}</p>
                <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed">{selected.solution}</p>
              </div>
            )}

            {selected.staff_reply && (
              <div className="rounded-xl border border-border/30 bg-primary/5 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">{t("painel.ec_reply_header")}</p>
                  <button
                    onClick={copyReply}
                    className="flex items-center gap-1 rounded-full border border-border/30 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? t("nitro.copy_done") : t("nitro.copy")}
                  </button>
                </div>
                <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed">{selected.staff_reply}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden border-border/60 bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {selected && form.title && form.title === selected.title ? t("painel.ec_edit_solution") : t("painel.ec_new")}
            </DialogTitle>
          </DialogHeader>
          <div className="scrollbar-thin max-h-[68dvh] min-w-0 space-y-3 overflow-y-auto overflow-x-hidden pr-1 sm:max-h-[65vh]">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`err-${f.key}`}>{f.label}</Label>
                {f.key === "code" ? (
                  <Input
                    id={`err-${f.key}`}
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                  />
                ) : (
                  <Textarea
                    id={`err-${f.key}`}
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    rows={2}
                    placeholder={f.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
          <Button onClick={save} disabled={saving || !form.title.trim()} className="mt-2 w-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("painel.ec_save")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}