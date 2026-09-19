import React from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-20 w-20 text-2xl",
  xl: "h-28 w-28 text-3xl",
};

const DOT_SIZES = {
  sm: "h-2.5 w-2.5",
  md: "h-3 w-3",
  lg: "h-5 w-5",
  xl: "h-6 w-6",
};

const STATUS = {
  online: "bg-emerald-500",
  away: "bg-amber-500",
  dnd: "bg-white",
  invisible: "bg-slate-500",
};

const FRAMES = {
  neon: "ring-2 ring-primary shadow-[0_0_16px_hsl(var(--ring)/0.55)]",
  gold: "ring-2 ring-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.4)]",
  aurora: "ring-2 ring-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.4)]",
};

export default function ProfileAvatar({ name, avatar, size = "md", status, frame, className }) {
  const initial = ((name || "?").trim().charAt(0) || "?").toUpperCase();
  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "grid place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary/90 to-white/70 font-bold text-primary-foreground",
          SIZES[size],
          FRAMES[frame]
        )}
      >
        {avatar ? (
          <img
            src={avatar}
            alt={name || "Avatar"}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          initial
        )}
      </div>
      {status && status !== "invisible" && (
        <span className={cn("absolute bottom-0 right-0 rounded-full border-2 border-background", DOT_SIZES[size], STATUS[status])} />
      )}
    </div>
  );
}