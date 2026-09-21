import React, { useState } from "react";
import { SmilePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const QUICK_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥", "🎉"];

/**
 * Reações de uma mensagem: chips agrupados por emoji + seletor
 * que aparece ao passar o mouse sobre a bolha (grupo "hover").
 */
export default function MessageReactions({ reactions, myId, onToggle }) {
  const [open, setOpen] = useState(false);

  const byEmoji = {};
  for (const r of reactions) {
    (byEmoji[r.emoji] = byEmoji[r.emoji] || []).push(r);
  }
  const entries = Object.entries(byEmoji);

  return (
    <div className="relative">
      {entries.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {entries.map(([emoji, list]) => {
            const mine = list.some((r) => r.author_id === myId);
            return (
              <button
                key={emoji}
                onClick={() => onToggle(emoji)}
                title={list.map((r) => r.author_name).join(", ")}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold transition-colors",
                  mine
                    ? "border-primary/70 bg-primary/25 text-primary"
                    : "border-border/60 bg-secondary/70 text-foreground/85 hover:border-border"
                )}
              >
                <span className="text-xs leading-none">{emoji}</span>
                {list.length > 1 && <span>{list.length}</span>}
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        title="Reagir"
        className={cn(
          "absolute -top-2 right-0 grid h-6 w-6 place-items-center rounded-full border border-border/60 bg-popover text-muted-foreground opacity-0 shadow-lg transition-all hover:text-primary group-hover:opacity-100",
          open && "opacity-100"
        )}
        aria-label="Reagir"
      >
        {open ? <X className="h-3 w-3" /> : <SmilePlus className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 flex gap-0.5 rounded-full border border-border/60 bg-popover px-2 py-1 shadow-xl">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onToggle(emoji);
                setOpen(false);
              }}
              className="rounded-full px-1.5 py-0.5 text-sm transition-transform hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}