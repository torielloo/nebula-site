import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Newspaper, Loader2, Send, Eye, EyeOff, Pencil, Trash2, Save, X } from "lucide-react";
import { parseDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { logStaffAction } from "@/lib/ticketMeta";

export default function PatchNotesTab({ canManage, user }) {
  const { t } = useI18n();
  const [notes, setNotes] = useState(null);
  const [form, setForm] = useState({ version: "", title: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ version: "", title: "", notes: "" });

  const load = async () => {
    setNotes(await base44.entities.PatchNote.list("-created_date", 100));
  };

  useEffect(() => {
    load().catch(() => setNotes([]));
  }, []);

  const publishToggle = async (n) => {
    const next = n.status === "published" ? "draft" : "published";
    await base44.entities.PatchNote.update(n.id, { status: next });
    await logStaffAction(user, "patch_note_status", `Patch note v${n.version} → ${next}`, n.id);
    await load();
  };

  const create = async (e) => {
    e.preventDefault();
    if (!form.version.trim() || !form.title.trim() || saving) return;
    setSaving(true);
    try {
      await base44.entities.PatchNote.create({ ...form, status: "draft" });
      await logStaffAction(user, "patch_note_criado", `Notícia ${form.version}: ${form.title}`);
      setForm({ version: "", title: "", notes: "" });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (note) => {
    setEditingId(note.id);
    setEditForm({ version: note.version || "", title: note.title || "", notes: note.notes || "" });
  };

  const saveEdit = async (note) => {
    if (!editForm.version.trim() || !editForm.title.trim() || saving) return;
    setSaving(true);
    try {
      await base44.entities.PatchNote.update(note.id, {
        version: editForm.version.trim(),
        title: editForm.title.trim(),
        notes: editForm.notes,
      });
      await logStaffAction(user, "patch_note_editado", `Notícia ${editForm.version}: ${editForm.title}`, note.id);
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (note) => {
    if (!window.confirm(t("painel.sys_confirm_delete", { version: note.version }))) return;
    setNotes((current) => (current || []).filter((item) => item.id !== note.id));
    try {
      await base44.entities.PatchNote.delete(note.id);
      await logStaffAction(user, "patch_note_excluido", `Notícia ${note.version}: ${note.title}`, note.id);
    } catch {
      await load();
    }
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <form onSubmit={create} className="rounded-xl border border-white/10 bg-secondary/40 p-4">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold">{t("painel.sys_new_patch")}</h3>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Input
              placeholder={t("painel.pn_ver_ph")}
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
            />
            <Input
              placeholder={t("painel.sys_title_f")}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <Textarea
            className="mt-2"
            placeholder={t("painel.sys_notes")}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <Button type="submit" size="sm" className="mt-2" disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
            {t("painel.pn_create_draft")}
          </Button>
        </form>
      )}

      {notes === null && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
      {notes && notes.length === 0 && (
        <p className="p-4 text-center text-sm text-muted-foreground">{t("painel.pn_none")}</p>
      )}
      {notes &&
        notes.map((n) => {
          const editing = editingId === n.id;
          return (
            <div key={n.id} className="rounded-xl border border-white/10 bg-secondary/40 p-4">
              {editing ? (
                <div className="space-y-2">
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input value={editForm.version} onChange={(e) => setEditForm((current) => ({ ...current, version: e.target.value }))} placeholder={t("painel.pn_ver_ph")} />
                    <Input value={editForm.title} onChange={(e) => setEditForm((current) => ({ ...current, title: e.target.value }))} placeholder={t("painel.sys_title_f")} />
                  </div>
                  <Textarea value={editForm.notes} onChange={(e) => setEditForm((current) => ({ ...current, notes: e.target.value }))} placeholder={t("painel.sys_notes")} />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => saveEdit(n)} disabled={saving}>
                      {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                      {t("common.save")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={saving}>
                      <X className="mr-1 h-3.5 w-3.5" /> {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary">{n.version}</span>
                    <span className="text-sm font-semibold">{n.title}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        n.status === "published" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                      )}
                    >
                      {n.status === "published" ? t("painel.sys_published") : t("painel.sys_draft")}
                    </span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {parseDate(n.updated_date || n.created_date).format("DD/MM/YYYY HH:mm")}
                    </span>
                  </div>
                  {n.notes && <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{n.notes}</p>}
                  {canManage && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => publishToggle(n)}>
                        {n.status === "published" ? (
                          <><EyeOff className="mr-1 h-3.5 w-3.5" /> {t("painel.sys_unpublish")}</>
                        ) : (
                          <><Eye className="mr-1 h-3.5 w-3.5" /> {t("painel.sys_publish")}</>
                        )}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => beginEdit(n)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> {t("common.edit")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(n)} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> {t("common.delete")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
    </div>
  );
}