import React, { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import AttachmentPicker from "@/components/tickets/AttachmentPicker";
import VoiceRecorderButton from "@/components/chat/VoiceRecorderButton";
import { useI18n } from "@/lib/i18n";

/** Composer profissional do ticket: texto, anexos e envio com Enter. */
export default function TicketComposer({
  value,
  onChange,
  onSend,
  sending,
  disabled,
  placeholder,
  attachments,
  onAttachmentsChange,
  onKeyDown: externalKeyDown,
}) {
  const { t } = useI18n();
  const [attachmentUploading, setAttachmentUploading] = useState(false);

  const onKeyDown = (e) => {
    if (attachmentUploading) {
      if (e.key === "Enter" && !e.shiftKey) e.preventDefault();
      return;
    }
    if (externalKeyDown?.(e)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-2.5 transition-colors focus-within:border-primary/40">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={2}
        disabled={disabled}
        className="min-h-[52px] resize-none border-0 bg-transparent p-1.5 text-xs focus-visible:ring-0"
      />
      <div className="mt-1 flex items-center gap-2 border-t border-border/30 pt-2">
        <AttachmentPicker
          attachments={attachments}
          onChange={onAttachmentsChange}
          onUploadingChange={setAttachmentUploading}
          disabled={disabled || sending}
        />
        <VoiceRecorderButton
          disabled={disabled || sending || (attachments || []).length >= 5}
          onUploadingChange={setAttachmentUploading}
          onUploaded={(audio) => onAttachmentsChange((current) => [...(current || []), audio])}
          compact
        />
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">
          {t("ticket.send_hint")}
        </span>
        <button
          onClick={onSend}
          disabled={disabled || sending || attachmentUploading || (!value.trim() && !(attachments || []).length)}
          title={t("ticket.send_hint")}
          className="nebula-glow-sm grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-40"
        >
          {sending || attachmentUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}