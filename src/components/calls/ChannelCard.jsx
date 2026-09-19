import React from "react";
import { Volume2, ArrowRight, Lock } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { useCallPresence } from "@/lib/callPresence";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/**
 * Card de canal de voz com presença ao vivo: avatares de quem está na
 * call e contagem real em tempo real.
 */
export default function ChannelCard({ channel, onEnter, locked = false }) {
  const { t } = useI18n();
  const roster = useCallPresence(channel.code);
  const visible = roster.slice(0, 4);
  const extra = roster.length - visible.length;

  return (
    <div className="flex flex-col rounded-xl border border-border/50 bg-card/60 p-4 backdrop-blur transition-colors hover:border-border">
      <div className="flex items-start justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
          {locked ? <Lock className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </span>
        <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-muted-foreground">
          {locked ? t("callcard.private") : t("callcard.official")}
        </span>
      </div>
      <h3 className="mt-3 font-heading text-sm font-bold">{channel.name}</h3>

      <div className="mt-1.5 flex min-h-8 items-center">
        {roster.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("callcard.empty")}</p>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {visible.map((u) => (
                <ProfileAvatar
                  key={u.seat}
                  name={u.name}
                  avatar={u.avatar}
                  size="sm"
                  frame={u.frame}
                  className="rounded-full ring-2 ring-card"
                />
              ))}
              {extra > 0 && (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground ring-2 ring-card">
                  +{extra}
                </span>
              )}
            </div>
            <span className={cn("text-xs font-semibold", roster.length > 0 ? "text-emerald-400" : "text-muted-foreground")}>
              {t("callcard.in_call", { count: roster.length })}
            </span>
          </div>
        )}
      </div>

      {locked ? (
        <button
          disabled
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-border/60 bg-secondary/60 px-3 py-2 text-xs font-bold text-muted-foreground"
        >
          <Lock className="h-3.5 w-3.5" /> {t("callcard.staff_only")}
        </button>
      ) : (
        <button
          onClick={() => onEnter(channel)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          {t("callcard.enter")} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}