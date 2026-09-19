import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Flag, Image as ImageIcon, Loader2, Paperclip, Video, X } from "lucide-react";

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;

export default function ReportUserDialog({ open, onOpenChange, target }) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const addFiles = async (event) => {
    const input = event.target;
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length || uploading) return;

    const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    if (!remaining) {
      setMessage(`Você pode anexar no máximo ${MAX_ATTACHMENTS} arquivos.`);
      return;
    }

    const selected = files.slice(0, remaining);
    const invalid = selected.find((file) => !file.type.startsWith("image/") && !file.type.startsWith("video/"));
    if (invalid) {
      setMessage("Envie apenas imagens ou vídeos.");
      return;
    }
    const tooLarge = selected.find((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge) {
      setMessage(`${tooLarge.name} ultrapassa o limite de 200 MB.`);
      return;
    }

    setUploading(true);
    setMessage("");
    try {
      const uploaded = [];
      for (const file of selected) {
        const result = await base44.integrations.Core.UploadPublicFile({ file });
        if (!result?.file_url) throw new Error(`Falha ao enviar ${file.name}`);
        uploaded.push({
          type: file.type.startsWith("video/") ? "video" : "image",
          url: result.file_url,
          name: file.name,
          mime_type: file.type,
          size: file.size,
        });
      }
      setAttachments((current) => [...current, ...uploaded].slice(0, MAX_ATTACHMENTS));
    } catch (error) {
      setMessage(error?.message || "Não foi possível enviar os anexos.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!target?.id || reason.trim().length < 3 || busy || uploading) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await base44.functions.invoke("submitReport", {
        type: "user",
        target_id: target.id,
        reported_user_id: target.id,
        target_author: target.name,
        reason: reason.trim(),
        description: description.trim(),
        context: "Perfil de usuário",
        content_url: `/user/${target.id}`,
        attachments,
      });
      setMessage(`Denúncia enviada. Protocolo interno: ${res.data?.report_id || "registrado"}.`);
      setReason("");
      setDescription("");
      setAttachments([]);
    } catch (e) {
      setMessage(e?.response?.data?.error || e?.message || "Não foi possível enviar a denúncia.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl border-border/50 bg-popover/95 backdrop-blur-xl">
        <DialogHeader>
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-destructive/10 text-destructive"><Flag className="h-5 w-5" /></div>
          <DialogTitle>Denunciar usuário</DialogTitle>
          <DialogDescription>Denúncias são indicadores para revisão humana. Você pode anexar imagens ou vídeos como evidência.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo da denúncia" maxLength={300} />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva o contexto e o que aconteceu." rows={5} maxLength={4000} />

          <div className="rounded-2xl border border-border/50 bg-secondary/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold">Evidências</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Até {MAX_ATTACHMENTS} imagens/vídeos, 200 MB por arquivo.</p>
              </div>
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-border/60 bg-background px-3 text-xs font-semibold transition hover:bg-secondary">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                {uploading ? "Enviando..." : "Anexar"}
                <input type="file" accept="image/*,video/*" multiple className="hidden" disabled={uploading || attachments.length >= MAX_ATTACHMENTS} onChange={addFiles} />
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {attachments.map((item, index) => (
                  <div key={`${item.url}-${index}`} className="flex min-w-0 items-center gap-2 rounded-xl border border-border/40 bg-card/60 p-2">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      {item.type === "video" ? <Video className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold">{item.name || "Anexo"}</p>
                      <p className="text-[10px] text-muted-foreground">{item.size ? `${(item.size / 1024 / 1024).toFixed(1)} MB` : item.type}</p>
                    </div>
                    <button type="button" onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remover anexo">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {message && <p className="text-xs font-semibold text-muted-foreground">{message}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy || uploading}>Fechar</Button>
          <Button variant="destructive" onClick={submit} disabled={busy || uploading || reason.trim().length < 3}>
            {(busy || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar denúncia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
