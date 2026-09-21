import React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PullToRefreshIndicator({ pull, refreshing }) {
  if (!refreshing && pull < 8) return null;
  const progress = Math.min(1, pull / 64);
  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[60] -translate-x-1/2"
      style={{ top: refreshing ? 64 : Math.min(pull * 0.45, 36) }}
    >
      <div className="grid h-10 w-10 place-items-center rounded-full border border-border/60 bg-card/95 shadow-lg backdrop-blur">
        {refreshing ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <RefreshCw
            className={cn("h-5 w-5", progress >= 1 ? "text-primary" : "text-muted-foreground")}
            style={{ transform: `rotate(${progress * 360}deg)` }}
          />
        )}
      </div>
    </div>
  );
}