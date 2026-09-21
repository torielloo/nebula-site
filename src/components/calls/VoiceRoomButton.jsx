import React from "react";
import { Volume2, Lock } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { useCallPresence } from "@/lib/callPresence";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/**
 * Botão de canal de voz da sidebar com avatares de quem está na call,
 * atualizados em tempo real (estilo Discord).
 */
export default function VoiceRoomButton({ room, active, onToggle, locked = false, disabled = false }) {
  const { t } = useI18n();
  const roster = useCallPresence(room.code);
  return (
    <div>
      <button
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        title={locked ? t("voiceroom.private_title") : t("voiceroom.enter", { name: room.name })}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors",
          active
            ? "bg-primary/15 font-semibold text-primary"
            : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
          disabled && "cursor-not-allowed opacity-50 hover:bg-transparent"
        )}
      >
        {locked ? <Lock className="h-4 w-4 shrink-0" /> : <Volume2 className="h-4 w-4 shrink-0" />}
        <span className="truncate">{room.name}</span>
        {roster.length > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-white/10 px-1.5 text-[10px] font-bold text-muted-foreground">
            {roster.length}
          </span>
        )}
        {active && roster.length === 0 && (
          <span className="ml-auto h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
        )}
      </button>
      {roster.length > 0 && (
        <div className="mb-1 ml-6 mt-0.5 space-y-1">
          {roster.map((u) => (
            <div key={u.seat} className="flex items-center gap-1.5">
              <ProfileAvatar
                name={u.name}
                avatar={u.avatar}
                size="sm"
                frame={u.frame}
                className="scale-[0.65] origin-left"
              />
              <span
                className={cn(
                  "truncate text-[11px]",
                  u.micOn ? "text-muted-foreground" : "text-destructive/80"
                )}
              >
                {u.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}