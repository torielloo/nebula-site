import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VolumeX, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { MUTE_DURATIONS } from "@/lib/moderation";
import { formatLocalDateTime } from "@/lib/time";
import { logStaffAction } from "@/lib/ticketMeta";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export default function MuteDialog({ target, user, onClose }) {
  const { t } = useI18n();
  const [duration, setDuration] = useState("24h");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const open = !!target;
  const chosen = MUTE_DURATIONS.find((d) => d.value === duration);
  const expiresAt = chosen && chosen.hours ? new Date(Date.now() + chosen.hours * 3600 * 1000) : null;

  const submit = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      const data = {
        user_name: target.name,
        type: "mute",
        reason: reason.trim() || t("painel.md_default_reason"),
        staff_name: (user && (user.full_name || user.email)) || "Staff",
        active: true,
      };
      if (target.userId) data.user_id = target.userId;
      if (expiresAt) data.expires_at = expiresAt.toISOString();
      await base44.entities.Punishment.create(data);
      await logStaffAction(
        user,
        "moderacao_plataforma",
        `Membro silenciado: ${target.name} (${chosen ? t(`mute.duration_${chosen.value}`) : "—"})`,
        target.userId || target.name
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-2xl border-border/40 bg-popover/85 backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <span className="nebula-glow-sm grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-400">
              <VolumeX className="h-5 w-5" />
            </span>
            {t("painel.md_title", { name: target ? target.name : "" })}
          </DialogTitle>
          <DialogDescription>
            {t("painel.md_desc")}
            {target && target.sample ? ` ${t("painel.md_last_msg", { msg: target.sample })}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{t("painel.md_duration")}</p>
            <div className="grid grid-cols-3 gap-2">
              {MUTE_DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDuration(d.value)}
                  className={cn(
                    "min-h-[40px] rounded-xl border px-2 text-xs font-bold transition-colors",
                    duration === d.value
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {t(`mute.duration_${d.value}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/40 bg-secondary/40 px-3 py-2.5 text-xs">
            <span className="text-muted-foreground">
              {expiresAt ? (
                <>
                  {t("painel.md_until_prefix")} <strong className="text-foreground">{formatLocalDateTime(expiresAt)}</strong>
                </>
              ) : (
                t("painel.md_permanent")
              )}
            </span>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{t("painel.pu_reason_ph")}</p>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("painel.md_reason_ph")}
              maxLength={200}
              className="border-border/50 bg-background/40"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" size="sm" onClick={submit} disabled={busy} className="nebula-glow-sm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <VolumeX className="h-4 w-4" />}
            {t("painel.md_mute")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}