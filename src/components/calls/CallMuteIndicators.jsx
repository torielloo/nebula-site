import React from "react";
import { MicOff, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Indicadores visuais compartilhados por todas as calls.
 * micMuted = a pessoa não está transmitindo voz.
 * deafened = a pessoa desligou o áudio da call para si mesma.
 */
export default function CallMuteIndicators({
  micMuted = false,
  deafened = false,
  compact = false,
  className,
}) {
  if (!micMuted && !deafened) return null;

  const size = compact ? "h-6 w-6" : "h-8 w-8";
  const iconSize = compact ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label="Status de áudio">
      {micMuted && (
        <span
          title="Microfone mutado · não está falando"
          aria-label="Microfone mutado"
          className={cn(
            "grid shrink-0 place-items-center rounded-full border border-red-400/25 bg-red-500/90 text-white shadow-lg backdrop-blur",
            size
          )}
        >
          <MicOff className={iconSize} />
        </span>
      )}
      {deafened && (
        <span
          title="Áudio da call mutado · não está ouvindo"
          aria-label="Áudio da call mutado"
          className={cn(
            "grid shrink-0 place-items-center rounded-full border border-amber-300/25 bg-amber-500/90 text-black shadow-lg backdrop-blur",
            size
          )}
        >
          <VolumeX className={iconSize} />
        </span>
      )}
    </span>
  );
}
