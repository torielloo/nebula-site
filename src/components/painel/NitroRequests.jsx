import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { Check, X, Loader2, ExternalLink } from "lucide-react";
import { parseDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const STATUS_META = {
  pending: { key: "nitro.req_pending", cls: "bg-amber-500/15 text-amber-400" },
  approved: { key: "nitro.req_approved", cls: "bg-emerald-500/15 text-emerald-400" },
  rejected: { key: "nitro.req_rejected", cls: "bg-white/10 text-white" },
  expired: { key: "nitro.req_expired", cls: "bg-white/10 text-white/60" },
};

const isSafeReceiptUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value);

export default function NitroRequests() {
  const { t } = useI18n();
  const [requests, setRequests] = useState(null);

  const load = async () => {
    const list = await base44.entities.NitroRequest.list("-created_date", 100);
    setRequests(list);
  };

  useEffect(() => {
    load().catch(() => setRequests([]));
  }, []);

  const decide = async (r, status) => {
    await base44.functions.invoke("nitroAdmin", { request_id: r.id, status });
    await load();
  };

  return (
    <div className="space-y-2">
      {requests === null && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
      {requests && requests.length === 0 && (
        <p className="p-4 text-center text-sm text-muted-foreground">{t("painel.nr_empty")}</p>
      )}
      {requests &&
        requests.map((r) => {
          const meta = STATUS_META[r.status] || STATUS_META.pending;
          const safeReceiptUrl = isSafeReceiptUrl(r.receipt_url) ? r.receipt_url : null;
          const isImage = safeReceiptUrl && /\.(jpe?g|png|webp)$/i.test(safeReceiptUrl);
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/40 bg-secondary/40 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-primary">{r.code}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", meta.cls)}>{t(meta.key)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.user_name} · {parseDate(r.created_date).format("DD/MM/YYYY HH:mm")}
                </p>
              </div>
              {isImage ? (
                <a href={safeReceiptUrl} target="_blank" rel="noopener noreferrer" title={t("painel.nr_view_receipt")}>
                  <Image src={safeReceiptUrl} alt={t("painel.nr_receipt")} className="h-12 w-12 rounded-lg border border-border/40 object-cover" />
                </a>
              ) : safeReceiptUrl ? (
                <Button asChild size="sm" variant="outline">
                  <a href={safeReceiptUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-3.5 w-3.5" /> {t("painel.nr_receipt")}
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">{t("painel.nr_receipt")}</span>
              )}
              {r.status === "pending" && (
                <>
                  <Button size="sm" onClick={() => decide(r, "approved")} className="bg-emerald-600 hover:bg-emerald-600/90">
                    <Check className="mr-1 h-3.5 w-3.5" /> {t("painel.nr_approve")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => decide(r, "rejected")} className="text-destructive hover:bg-destructive/10">
                    <X className="mr-1 h-3.5 w-3.5" /> {t("painel.nr_reject")}
                  </Button>
                </>
              )}
            </div>
          );
        })}
    </div>
  );
}