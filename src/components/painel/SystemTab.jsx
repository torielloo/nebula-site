import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Wrench, Plus, Trash2, Rocket } from "lucide-react";
import { parseDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { logStaffAction } from "@/lib/ticketMeta";

export default function SystemTab({ user }) {
  const { t } = useI18n();
  const [setting, setSetting] = useState(null);
  const [patches, setPatches] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ maintenance_mode: false, maintenance_message: "", current_version: "" });
  const [patchOpen, setPatchOpen] = useState(false);
  const [patchSaving, setPatchSaving] = useState(false);
  const [patchForm, setPatchForm] = useState({ version: "", title: "", notes: "" });

  const load = async () => {
    let list = await base44.entities.SystemSetting.list();
    let s = list[0];
    if (!s) {
      s = await base44.entities.SystemSetting.create({
        maintenance_mode: false,
        maintenance_message: "",
        current_version: "1.0",
      });
    }
    setSetting(s);
    setForm({
      maintenance_mode: !!s.maintenance_mode,
      maintenance_message: s.maintenance_message || "",
      current_version: s.current_version || "",
    });
    const p = await base44.entities.PatchNote.list("-created_date", 50);
    setPatches(p);
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const save = async () => {
    if (saving || !setting) return;
    setSaving(true);
    try {
      await base44.entities.SystemSetting.update(setting.id, form);
      await logStaffAction(
        user,
        "config_sistema",
        form.maintenance_mode
          ? `Modo manutenção ATIVADO (versão ${form.current_version})`
          : "Configurações do sistema atualizadas"
      );
      await load();
    } finally {
      setSaving(false);
    }
  };

  const createPatch = async () => {
    if (!patchForm.version.trim() || !patchForm.title.trim() || patchSaving) return;
    setPatchSaving(true);
    try {
      await base44.entities.PatchNote.create({
        version: patchForm.version.trim(),
        title: patchForm.title.trim(),
        notes: patchForm.notes.trim(),
        status: "draft",
      });
      await logStaffAction(user, "patch_criado", `Atualização v${patchForm.version.trim()} — ${patchForm.title.trim()}`);
      setPatchForm({ version: "", title: "", notes: "" });
      setPatchOpen(false);
      await load();
    } finally {
      setPatchSaving(false);
    }
  };

  const publishPatch = async (p) => {
    await base44.entities.PatchNote.update(p.id, { status: p.status === "published" ? "draft" : "published" });
    await logStaffAction(user, "patch_publicado", `Atualização v${p.version} publicada`);
    await load();
  };

  const deletePatch = async (p) => {
    if (!window.confirm(t("painel.sys_confirm_delete", { version: p.version }))) return;
    await base44.entities.PatchNote.delete(p.id);
    await logStaffAction(user, "patch_excluido", `Atualização v${p.version} excluída`);
    await load();
  };

  if (!setting || patches === null) {
    return <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border/40 bg-secondary/40 p-5">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <Wrench className="h-4 w-4 text-primary" /> {t("painel.nav_sistema")}
        </h2>

        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-card/60 p-3">
            <div>
              <p className="text-sm font-semibold">{t("painel.sys_maintenance")}</p>
              <p className="text-xs text-muted-foreground">{t("painel.sys_maintenance_hint")}</p>
            </div>
            <Switch
              checked={form.maintenance_mode}
              onCheckedChange={(v) => setForm({ ...form, maintenance_mode: v })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sys-msg">{t("painel.sys_msg_label")}</Label>
            <Textarea
              id="sys-msg"
              value={form.maintenance_message}
              onChange={(e) => setForm({ ...form, maintenance_message: e.target.value })}
              rows={2}
              placeholder={t("painel.sys_msg_ph")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sys-ver">{t("painel.sys_ver_label")}</Label>
            <Input
              id="sys-ver"
              value={form.current_version}
              onChange={(e) => setForm({ ...form, current_version: e.target.value })}
              placeholder={t("painel.sys_ver_ph")}
            />
          </div>

          <Button onClick={save} disabled={saving} className="w-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("painel.sys_save")}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border/40 bg-secondary/40 p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold">
            <Rocket className="h-4 w-4 text-primary" /> {t("painel.sys_patches_title")}
          </h2>
          <Button size="sm" onClick={() => setPatchOpen(true)} className="h-8">
            <Plus className="mr-1 h-3.5 w-3.5" /> {t("painel.sys_new_patch")}
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {patches.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("painel.sys_none")}</p>
          )}
          {patches.map((p) => (
            <div key={p.id} className="rounded-lg border border-border/40 bg-card/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">v{p.version}</span>
                <span className="text-sm font-semibold">{p.title}</span>
                <span
                  className={cn(
                    "ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold",
                    p.status === "published" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                  )}
                >
                  {p.status === "published" ? t("painel.sys_published") : t("painel.sys_draft")}
                </span>
              </div>
              {p.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{p.notes}</p>}
              <p className="mt-1 text-[10px] text-muted-foreground">{parseDate(p.created_date).format("DD/MM/YYYY HH:mm")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => publishPatch(p)}>
                  {p.status === "published" ? t("painel.sys_unpublish") : t("painel.sys_publish")}
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => deletePatch(p)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={patchOpen} onOpenChange={setPatchOpen}>
        <DialogContent className="border-border/60 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{t("painel.sys_new_patch")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[100px,1fr] gap-3">
              <div className="space-y-2">
                <Label htmlFor="pt-ver">{t("painel.sys_ver")}</Label>
                <Input id="pt-ver" value={patchForm.version} onChange={(e) => setPatchForm({ ...patchForm, version: e.target.value })} placeholder="81" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pt-title">{t("painel.sys_title_f")}</Label>
                <Input id="pt-title" value={patchForm.title} onChange={(e) => setPatchForm({ ...patchForm, title: e.target.value })} placeholder={t("painel.sys_title_ph")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pt-notes">{t("painel.sys_notes")}</Label>
              <Textarea id="pt-notes" value={patchForm.notes} onChange={(e) => setPatchForm({ ...patchForm, notes: e.target.value })} rows={4} placeholder={t("painel.sys_notes_ph")} />
            </div>
            <Button onClick={createPatch} disabled={patchSaving || !patchForm.version.trim() || !patchForm.title.trim()} className="w-full">
              {patchSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("painel.sys_create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}