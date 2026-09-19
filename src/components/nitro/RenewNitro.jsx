import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, Sparkles, Zap, Copy, Check, Wallet } from "lucide-react";
import { parseDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import QRCode from "qrcode";

const PLANS = {
  mensal: { id: "nitro_mensal", label: "nitro.plan_mensal", price: "6,99", period: "nitro.p30" },
  anual: { id: "nitro_anual", label: "nitro.plan_anual", price: "25,50", period: "nitro.p365" },
};

const STATUS_META = {
  pending: { key: "nitro.req_pending", cls: "bg-amber-500/15 text-amber-400" },
  approved: { key: "nitro.req_approved", cls: "bg-emerald-500/15 text-emerald-400" },
  rejected: { key: "nitro.req_rejected", cls: "bg-white/10 text-white" },
  expired: { key: "nitro.req_expired", cls: "bg-white/10 text-muted-foreground" },
};

export default function RenewNitro({ requests, active = false, validUntil = null, onSubmitted }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [receipt, setReceipt] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [planKey, setPlanKey] = useState("mensal");
  const [pixPayload, setPixPayload] = useState("");
  const [pixQr, setPixQr] = useState("");
  const [pixLoading, setPixLoading] = useState(false);
  const [pixError, setPixError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const pendingRequest = (requests || []).find((request) => request.status === "pending") || null;
  const requestBlocked = active || !!pendingRequest;

  useEffect(() => {
    if (requestBlocked && confirmed) setConfirmed(false);
  }, [requestBlocked, confirmed]);

  useEffect(() => {
    if (!confirmed || requestBlocked) {
      setPixPayload("");
      setPixQr("");
      setPixError("");
      return;
    }

    let cancelled = false;
    setPixLoading(true);
    setPixError("");
    setPixPayload("");
    setPixQr("");

    base44.functions.invoke("getNitroPix", { plan: PLANS[planKey].id })
      .then(async (res) => {
        const data = res?.data || res;
        if (!data?.payload) throw new Error("Pix indisponível");
        const qr = await QRCode.toDataURL(data.payload, {
          width: 300,
          margin: 1,
          errorCorrectionLevel: "M",
        });
        if (cancelled) return;
        setPixPayload(data.payload);
        setPixQr(qr);
      })
      .catch(() => {
        if (!cancelled) setPixError(t("nitro.pix_error"));
      })
      .finally(() => {
        if (!cancelled) setPixLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [confirmed, planKey, t, requestBlocked]);

  const copyPix = async () => {
    if (!pixPayload) return;
    try {
      await navigator.clipboard.writeText(pixPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const uploadReceipt = async (file) => {
    if (!file || file.size > 20 * 1024 * 1024) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file });
      setReceipt({ url: res.file_url, name: file.name });
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!receipt || sending || requestBlocked) return;
    setSending(true);
    setSubmitError("");
    try {
      await base44.functions.invoke("submitNitroRequest", {
        receipt_url: receipt.url,
        plan: PLANS[planKey].id,
      });
      setReceipt(null);
      setConfirmed(false);
      await onSubmitted();
    } catch (error) {
      setSubmitError(error?.response?.data?.error || error?.message || t("nitro.request_error"));
      await Promise.resolve(onSubmitted?.()).catch(() => {});
    } finally {
      setSending(false);
    }
  };

  return (
    <section id="renovar" className="rounded-xl border border-border/40 bg-secondary/40 p-5 md:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">{t("nitro.my_sub")}</p>
      <h2 className="mt-1 font-heading text-xl font-extrabold">{t("nitro.renew_title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("nitro.renew_desc")}</p>

      {requestBlocked ? (
        <div className="mt-4 rounded-2xl border border-border/50 bg-card/60 p-4">
          {active ? (
            <>
              <div className="flex items-center gap-2 text-emerald-400">
                <Check className="h-4 w-4" />
                <p className="text-sm font-extrabold">{t("nitro.request_blocked_active_title")}</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {t("nitro.request_blocked_active_desc", {
                  date: validUntil ? parseDate(validUntil).format("DD/MM/YYYY HH:mm") : "—",
                })}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-amber-400">
                <Loader2 className="h-4 w-4" />
                <p className="text-sm font-extrabold">{t("nitro.request_blocked_pending_title")}</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {t("nitro.request_blocked_pending_desc", { code: pendingRequest?.code || "—" })}
              </p>
            </>
          )}
        </div>
      ) : !confirmed ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.entries(PLANS).map(([key, p]) => (
              <button
                key={key}
                onClick={() => setPlanKey(key)}
                disabled={requestBlocked}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  planKey === key ? "border-primary/60 bg-primary/10" : "border-border/40 bg-card/60 hover:border-border"
                )}
              >
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t(p.label)}</p>
                <p className="mt-1 font-display text-2xl font-extrabold">R$ {p.price}</p>
                <p className="text-xs font-semibold text-muted-foreground">{t("nitro.access_days", { period: t(p.period) })}</p>
              </button>
            ))}
          </div>
          <Button onClick={() => setConfirmed(true)} disabled={requestBlocked} size="lg" className="mt-4 w-full nebula-glow-sm">
            <Zap className="mr-2 h-4 w-4" />
            {t("nitro.pay_cta", { plan: t(PLANS[planKey].label), price: PLANS[planKey].price })}
          </Button>
        </>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border border-border/40 bg-secondary/30 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <p className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-primary">{t("nitro.pay_kicker")}</p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("nitro.pay_desc", {
                amount: `R$ ${PLANS[planKey].price}`,
                plan: t(PLANS[planKey].label),
              })}
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-[180px_1fr] md:items-center">
              <div className="grid min-h-[180px] place-items-center rounded-2xl border border-border/40 bg-white p-3">
                {pixLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-black/60" />
                ) : pixQr ? (
                  <img src={pixQr} alt={t("nitro.pix_qr_alt")} className="h-40 w-40" />
                ) : (
                  <span className="px-3 text-center text-xs font-semibold text-white">{pixError || t("nitro.pix_error")}</span>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">{t("nitro.pix_scan")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("nitro.pix_hidden_hint")}</p>
                <button
                  onClick={copyPix}
                  disabled={!pixPayload || pixLoading}
                  className={cn(
                    "mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    copied ? "bg-emerald-500/15 text-emerald-400" : "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? t("nitro.copy_done") : t("nitro.copy_pix")}
                </button>
                <p className="mt-2 text-xs text-muted-foreground">{t("nitro.payee")}</p>
              </div>
            </div>
          </div>

          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files && e.dataTransfer.files[0];
              if (f) uploadReceipt(f);
            }}
            className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/60 px-4 py-8 text-center transition-colors hover:border-border/40"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <Upload className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-sm font-semibold">{t("nitro.attach")}</span>
            <span className="text-xs text-muted-foreground">{t("nitro.attach_hint")}</span>
            <span className="mt-1 text-xs font-semibold text-primary underline underline-offset-2">{t("nitro.choose_file")}</span>
            <span className="text-xs text-muted-foreground">{receipt ? receipt.name : t("nitro.no_file")}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (f) uploadReceipt(f);
              }}
              disabled={uploading}
            />
          </label>

          <Button onClick={submit} disabled={!receipt || sending || requestBlocked} className="mt-4 w-full nebula-glow-sm">
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {t("nitro.send_activation", { plan: t(PLANS[planKey].label) })}
          </Button>
          {submitError && <p className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">{submitError}</p>}
        </>
      )}

      <div className="mt-6 border-t border-border/40 pt-4">
        <h3 className="font-heading text-sm font-bold">{t("nitro.requests_title")}</h3>
        {requests === null && <p className="mt-2 text-sm text-muted-foreground">{t("nitro.loading")}</p>}
        {requests && requests.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">{t("nitro.no_requests")}</p>
        )}
        <div className="mt-2 space-y-2">
          {requests &&
            requests.map((r) => {
              const meta = STATUS_META[r.status] || STATUS_META.pending;
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/60 p-3">
                  <span className="font-mono text-xs font-bold text-primary">{r.code}</span>
                  <span className="text-xs text-muted-foreground">{parseDate(r.created_date).format("DD/MM/YYYY HH:mm")}</span>
                  <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold", meta.cls)}>
                    {t(meta.key)}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </section>
  );
}