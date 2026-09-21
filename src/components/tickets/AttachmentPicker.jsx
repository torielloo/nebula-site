import React, { useRef, useState } from "react";
import { Paperclip, ImagePlus, Film, FileText, Loader2, X, AudioLines } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useI18n } from "@/lib/i18n";
import { base44 } from "@/api/base44Client";

export const MAX_ATTACHMENTS = 5;
const MAX_SIZE_MB = 25;

/** Seletor de anexos: imagens e vídeos (upload) com chips de pré-visualização. */
export default function AttachmentPicker({ attachments, onChange, disabled, onUploadingChange }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const pick = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length || disabled) return;
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      toast({ description: t("ticket.attach_limit") });
      return;
    }
    setUploading(true);
    onUploadingChange?.(true);
    const next = [...attachments];
    let hadFailure = false;
    try {
      for (const file of files) {
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          toast({ description: t("ticket.attach_size_limit") });
          continue;
        }
        try {
          // Armazenamento PRIVADO: só quem tem acesso ao ticket consegue ver o anexo
          const upload = await base44.integrations.Core.UploadPrivateFile({ file });
          const fileUri = upload?.file_uri;
          if (!fileUri) throw new Error("Upload não retornou file_uri");
          const type = file.type.startsWith("image/")
            ? "image"
            : file.type.startsWith("video/")
              ? "video"
              : file.type.startsWith("audio/")
                ? "audio"
                : "file";
          next.push({ type, url: fileUri, name: file.name });
          // Atualiza a UI assim que cada arquivo termina, evitando perda do anexo.
          onChange([...next]);
        } catch {
          hadFailure = true;
        }
      }
      if (hadFailure) toast({ description: t("ticket.upload_failed"), variant: "destructive" });
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  };

  const remove = (i) => onChange(attachments.filter((_, idx) => idx !== i));

  return (
    <div>
      {attachments.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {attachments.map((a, i) => (
            <span
              key={i}
              className="flex max-w-[220px] items-center gap-1.5 rounded-full border border-border/50 bg-secondary/60 px-2.5 py-1 text-[11px] font-semibold"
            >
              {a.type === "image" ? (
                <ImagePlus className="h-3 w-3 shrink-0 text-primary" />
              ) : a.type === "video" ? (
                <Film className="h-3 w-3 shrink-0 text-primary" />
              ) : a.type === "audio" ? (
                <AudioLines className="h-3 w-3 shrink-0 text-primary" />
              ) : (
                <FileText className="h-3 w-3 shrink-0 text-primary" />
              )}
              <span className="truncate">{a.name || a.url}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                className="shrink-0 rounded-full text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        hidden
        onChange={pick}
        disabled={disabled || uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading || attachments.length >= MAX_ATTACHMENTS}
        title={t("ticket.attach_hint")}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
      >
        {uploading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("ticket.uploading")}
          </>
        ) : (
          <>
            <Paperclip className="h-3.5 w-3.5" /> {t("ticket.attach")}
          </>
        )}
      </button>
    </div>
  );
}