import React, { useEffect, useState } from "react";
import { Copy, Download, FileText, Link2, ExternalLink, Loader2, Maximize2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import UserQuickCard from "@/components/users/UserQuickCard";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import VoiceMessagePlayer from "@/components/chat/VoiceMessagePlayer";

const isPublic = (url) => /^https?:\/\//i.test(url || "");
const signedUrlCache = new Map();
const SIGNED_CACHE_MS = 13 * 60 * 1000;

/** Texto com links clicáveis (URLs viram links automáticos). */
export function LinkifiedText({ text, className, mentions = [] }) {
  if (!text) return null;
  const mentionMap = new Map((mentions || []).filter((m) => m?.id && m?.name).map((m) => [`@${String(m.name).toLocaleLowerCase("pt-BR")}`, m]));
  const mentionNames = [...mentionMap.keys()].sort((a, b) => b.length - a.length).map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const mentionPart = mentionNames.length ? `|(${mentionNames.join("|")})` : "";
  const parts = String(text).split(new RegExp(`(https?:\\/\\/[^\\s]+)${mentionPart}`, "giu"));
  return (
    <p className={cn("min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs leading-relaxed", className)}>
      {parts.filter((p) => p !== undefined && p !== "").map((p, i) => {
        if (/^https?:\/\//i.test(p)) {
          return (
            <a key={i} href={p} target="_blank" rel="noreferrer noopener" className="break-all font-semibold text-primary underline underline-offset-2 hover:text-primary/80">{p}</a>
          );
        }
        const mention = mentionMap.get(String(p).toLocaleLowerCase("pt-BR"));
        if (mention) {
          return (
            <UserQuickCard key={`${mention.id}-${i}`} userId={mention.id} align="start">
              <button type="button" className="inline rounded-md bg-primary/10 px-1 font-bold text-primary underline-offset-2 hover:underline">{p}</button>
            </UserQuickCard>
          );
        }
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </p>
  );
}

/**
 * Renderiza os anexos de uma mensagem: imagens, vídeos, links e arquivos.
 * Anexos privados (file_uri) são assinados no servidor: só quem tem acesso
 * ao ticket recebe a URL temporária.
 */
export default function MessageAttachments({ attachments, ticketId, conversationId, resolvedUrls = {}, deferSigning = false }) {
  const { t } = useI18n();
  const list = (attachments || []).filter((a) => a && a.url);
  const [signed, setSigned] = useState({});
  const [preview, setPreview] = useState(null);
  const key = JSON.stringify(list.map((a) => a.url));

  const signOne = async (a, { force = false } = {}) => {
    if (!a?.url || isPublic(a.url) || (!ticketId && !conversationId)) return null;
    if (!force && resolvedUrls[a.url]) return resolvedUrls[a.url];
    const scope = `${ticketId || ""}:${conversationId || ""}:${a.url}`;
    const cached = signedUrlCache.get(scope);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.url;
    if (force) signedUrlCache.delete(scope);
    const res = await base44.functions.invoke("signAttachmentUrl", {
      file_uri: a.url,
      ticket_id: ticketId,
      conversation_id: conversationId,
    });
    const url = res.data?.signed_url || null;
    if (url) signedUrlCache.set(scope, { url, expiresAt: Date.now() + SIGNED_CACHE_MS });
    return url;
  };

  const refreshSigned = async (a) => {
    try {
      const signedUrl = await signOne(a, { force: true });
      if (signedUrl) setSigned((prev) => ({ ...prev, [a.url]: signedUrl }));
    } catch {}
  };

  useEffect(() => {
    if (deferSigning) return undefined;
    let alive = true;
    (async () => {
      const pairs = await Promise.all(list.map(async (a) => {
        try {
          const signedUrl = await signOne(a);
          return signedUrl ? [a.url, signedUrl] : null;
        } catch {
          return null;
        }
      }));
      if (!alive) return;
      const next = Object.fromEntries(pairs.filter(Boolean));
      if (Object.keys(next).length > 0) setSigned((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      alive = false;
    };
  }, [key, ticketId, conversationId, deferSigning]);

  const urlOf = (a) => a?.signed_url || signed[a.url] || resolvedUrls[a.url] || (isPublic(a.url) ? a.url : null);

  const downloadMedia = async (url, name = "nebula-media") => {
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = name || "nebula-media";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const copyMedia = async (url, type = "file") => {
    if (!url) return;
    try {
      if (type === "image" && navigator.clipboard?.write && window.ClipboardItem) {
        const response = await fetch(url);
        const blob = await response.blob();
        const mime = blob.type && blob.type.startsWith("image/") ? blob.type : "image/png";
        await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch {
      try { await navigator.clipboard.writeText(url); } catch {}
    }
  };
  const images = list.filter((a) => a.type === "image");
  const videos = list.filter((a) => a.type === "video");
  const audios = list.filter((a) => a.type === "audio");
  const others = list.filter((a) => a.type !== "image" && a.type !== "video" && a.type !== "audio");

  if (list.length === 0) return null;

  const Loading = () => (
    <div className="grid h-24 w-full place-items-center rounded-lg border border-border/40 bg-secondary/40">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className={cn("grid gap-2", images.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
          {images.map((a, i) => {
            const url = urlOf(a);
            if (!url) return <Loading key={i} />;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPreview({ url, name: a.name || t("ticket.attach"), type: "image" })}
                className={cn(
                  "group block overflow-hidden rounded-xl border border-border/40 bg-black/20 text-left transition-all hover:border-white/20",
                  images.length === 1 ? "w-fit max-w-full" : "w-full"
                )}
              >
                <img
                  src={url}
                  alt={a.name || t("ticket.attach")}
                  className={cn(
                    "block h-auto max-h-[360px] max-w-full object-contain",
                    images.length === 1 ? "w-auto min-w-[180px] max-w-[560px]" : "w-full"
                  )}
                  loading="eager"
                  decoding="async"
                />
              </button>
            );
          })}
        </div>
      )}
      {videos.map((a, i) => {
        const url = urlOf(a);
        if (!url) return <Loading key={i} />;
        return (
          <div key={i} className="space-y-1.5">
            <video
              src={url}
              controls
              playsInline
              preload="metadata"
              className="max-h-64 w-full rounded-lg border border-border/40 bg-black"
            />
            <button type="button" onClick={() => setPreview({ url, name: a.name || "Vídeo", type: "video" })} className="inline-flex items-center gap-1.5 rounded-full border border-border/50 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground">
              <Maximize2 className="h-3 w-3" /> Abrir vídeo
            </button>
          </div>
        );
      })}
      {audios.map((a, i) => {
        const url = urlOf(a);
        if (!url) return <Loading key={`audio-${i}`} />;
        return <VoiceMessagePlayer key={`audio-${i}`} src={url} name={a.name || "Mensagem de voz"} onError={() => refreshSigned(a)} />;
      })}
      {others.map((a, i) => {
        const url = urlOf(a);
        return (
          <a
            key={i}
            href={url || undefined}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              "flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-xs font-semibold",
              url ? "text-primary transition-colors hover:border-primary/40" : "text-muted-foreground"
            )}
          >
            {a.type === "link" ? <Link2 className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{a.name || a.url}</span>
            {url && <ExternalLink className="ml-auto h-3 w-3 shrink-0" />}
          </a>
        );
      })}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-[min(96vw,1200px)] border-white/10 bg-black/95 p-3 pt-14 sm:rounded-2xl">
          <DialogTitle className="sr-only">{preview?.name || "Mídia"}</DialogTitle>
          {preview?.url && (
            <div className="space-y-3">
              <div className="flex flex-wrap justify-end gap-2 pr-10">
                <button type="button" onClick={() => copyMedia(preview.url, preview.type)} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold hover:bg-white/[0.1]"><Copy className="h-3.5 w-3.5" />{preview.type === "image" ? "Copiar imagem" : "Copiar link"}</button>
                <button type="button" onClick={() => downloadMedia(preview.url, preview.name)} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold hover:bg-white/[0.1]"><Download className="h-3.5 w-3.5" />Baixar</button>
              </div>
              {preview.type === "video" ? (
                <video src={preview.url} controls autoPlay playsInline className="max-h-[82vh] w-full rounded-xl bg-black object-contain" />
              ) : (
                <img src={preview.url} alt={preview.name || "Imagem"} className="max-h-[82vh] w-full rounded-xl object-contain" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}