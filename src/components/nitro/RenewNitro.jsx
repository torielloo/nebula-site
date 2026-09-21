import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ImagePlus,
  Loader2,
  QrCode,
  Smartphone,
  Sparkles,
  Upload,
  Wallet,
  Zap,
} from "lucide-react";
import { parseDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import QRCode from "qrcode";

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const ALLOWED_RECEIPT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const PLANS = {
  mensal: { id: "nitro_mensal", label: "nitro.plan_mensal", price: "6,99", period: "nitro.p30" },
  anual: { id: "nitro_anual", label: "nitro.plan_anual", price: "25,50", period: "nitro.p365" },
};

const RECEIPT_PENDING = new Set(["none", "awaiting_mobile", "uploading", "processing", undefined, null]);
const QR_CACHE_PREFIX = "nebula:nitro:receipt-qr:";

function qrCacheKey(planId) {
  return `${QR_CACHE_PREFIX}${planId}`;
}

function readCachedQr(planId) {
  try {
    const raw = window.sessionStorage.getItem(qrCacheKey(planId));
    if (!raw) return null;
    const value = JSON.parse(raw);
    // Só reutiliza tokens do formato novo (v2): 32 bytes em hex minúsculo.
    // Tokens antigos base64url foram a origem do erro de QR inválido no celular.
    if (value?.version !== 2 || !/^[a-f0-9]{64}$/.test(String(value?.token || "")) || !value?.session_id || !value?.expires_at) {
      window.sessionStorage.removeItem(qrCacheKey(planId));
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function saveCachedQr(planId, session) {
  try {
    window.sessionStorage.setItem(qrCacheKey(planId), JSON.stringify({
      version: 2,
      token: session.token,
      session_id: session.session_id,
      request_id: session.request_id,
      expires_at: session.expires_at,
      status: session.status || "waiting",
    }));
  } catch {}
}

function clearCachedQr(planId) {
  try { window.sessionStorage.removeItem(qrCacheKey(planId)); } catch {}
}

const REMOTE_LABEL = {
  waiting: "Aguardando celular",
  uploading: "Enviando",
  processing: "Processando imagem",
  received: "Comprovante recebido",
  expired: "QR expirado",
  failed: "Envio recusado",
};

function receiptCanStillBeAdded(row) {
  return row?.status === "pending"
    && !row.receipt_file_uri
    && !row.receipt_url
    && RECEIPT_PENDING.has(row.receipt_status);
}

export default function RenewNitro({ requests, active = false, validUntil = null, onSubmitted, selectedPlanKey = "mensal" }) {
  const { t } = useI18n();
  const [receipt, setReceipt] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [issuedCodeCopied, setIssuedCodeCopied] = useState(false);
  const [planKey, setPlanKey] = useState(selectedPlanKey === "anual" ? "anual" : "mensal");
  const [pixPayload, setPixPayload] = useState("");
  const [pixQr, setPixQr] = useState("");
  const [pixLoading, setPixLoading] = useState(false);
  const [pixError, setPixError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [remoteSession, setRemoteSession] = useState(null);
  const [remoteQr, setRemoteQr] = useState("");
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [localSubmitted, setLocalSubmitted] = useState(false);

  useEffect(() => {
    const next = selectedPlanKey === "anual" ? "anual" : "mensal";
    setPlanKey((current) => current === next ? current : next);
  }, [selectedPlanKey]);

  const incompleteRequest = (requests || []).find(receiptCanStillBeAdded) || null;
  const blockingRequest = (requests || []).find((row) => {
    if (row.status === "code_issued") return true;
    if (row.status !== "pending") return false;
    return !receiptCanStillBeAdded(row);
  }) || null;
  const requestBlocked = localSubmitted || !!blockingRequest;

  useEffect(() => {
    if (requestBlocked && confirmed) setConfirmed(false);
  }, [requestBlocked, confirmed]);

  useEffect(() => {
    if (!receipt) {
      setReceiptPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(receipt);
    setReceiptPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [receipt]);

  const loadPix = useCallback(async () => {
    if (!confirmed || requestBlocked) return false;

    setPixLoading(true);
    setPixError("");
    setPixPayload("");
    setPixQr("");

    try {
      let response = null;
      let lastError = null;

      // Uma segunda tentativa curta resolve atrasos transitórios de leitura da
      // configuração sem exigir que o usuário fique clicando repetidamente.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await base44.functions.invoke("getNitroPix", { plan: PLANS[planKey].id });
          break;
        } catch (error) {
          lastError = error;
          const status = Number(error?.response?.status || 0);
          const retryable = error?.response?.data?.retryable === true || status === 500 || status === 502 || status === 503 || status === 504;
          if (!retryable || attempt === 1) throw error;
          await new Promise((resolve) => window.setTimeout(resolve, 450));
        }
      }

      if (!response && lastError) throw lastError;
      const data = response?.data || response;
      if (!data?.payload || typeof data.payload !== "string") throw new Error("Pix indisponível");
      const payload = data.payload.trim();
      if (!payload.startsWith("000201") || !/6304[0-9A-F]{4}$/i.test(payload)) {
        throw new Error("Payload Pix inválido");
      }
      const qr = await QRCode.toDataURL(payload, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      setPixPayload(payload);
      setPixQr(qr);
      return true;
    } catch (error) {
      const backendMessage = error?.response?.data?.error || error?.message;
      setPixError(backendMessage || t("nitro.pix_error"));
      return false;
    } finally {
      setPixLoading(false);
    }
  }, [confirmed, planKey, requestBlocked, t]);

  useEffect(() => {
    if (!confirmed || requestBlocked) {
      setPixPayload("");
      setPixQr("");
      setPixError("");
      return;
    }
    void loadPix();
  }, [confirmed, planKey, requestBlocked, loadPix]);

  useEffect(() => {
    if (!remoteSession?.session_id || !["waiting", "uploading", "processing"].includes(remoteSession.status)) return undefined;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await base44.functions.invoke("nitroReceiptSession", {
          action: "status",
          session_id: remoteSession.session_id,
        });
        if (cancelled) return;
        const data = res?.data || {};
        setRemoteSession((current) => current ? { ...current, ...data } : current);
        if (["received", "expired", "failed"].includes(data.status)) {
          clearCachedQr(PLANS[planKey].id);
        }
        if (data.status === "received" || data.receipt_status === "received") {
          setLocalSubmitted(true);
          await Promise.resolve(onSubmitted?.()).catch(() => {});
        }
      } catch {
        // O status será tentado novamente enquanto a sessão continuar ativa.
      }
    };

    poll();
    const timer = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [remoteSession?.session_id, remoteSession?.status, onSubmitted, planKey]);

  const copyPix = async () => {
    if (!pixPayload) return;
    try {
      await navigator.clipboard.writeText(pixPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const copyIssuedCode = async () => {
    const value = String(blockingRequest?.issued_code || "").trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setIssuedCodeCopied(true);
      window.setTimeout(() => setIssuedCodeCopied(false), 2000);
    } catch {
      setIssuedCodeCopied(false);
    }
  };

  const chooseReceipt = (file) => {
    setSubmitError("");
    if (!file) {
      setReceipt(null);
      return;
    }
    const lower = String(file.name || "").toLowerCase();
    if (!ALLOWED_RECEIPT_TYPES.has(file.type) || !/\.(png|jpe?g|webp)$/.test(lower)) {
      setReceipt(null);
      setSubmitError("Envie somente PNG, JPG, JPEG ou WEBP.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_RECEIPT_BYTES) {
      setReceipt(null);
      setSubmitError("O comprovante deve ter no máximo 8 MB.");
      return;
    }
    setReceipt(file);
  };

  const createReceiptSession = async (source, forceRegenerate = false) => {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await base44.functions.invoke("nitroReceiptSession", {
          action: "create",
          plan: PLANS[planKey].id,
          source,
          force_regenerate: forceRegenerate,
        });
        return res?.data || {};
      } catch (error) {
        lastError = error;
        const status = Number(error?.response?.status || 0);
        const retryable = error?.response?.data?.retryable === true
          || status === 500 || status === 502 || status === 503 || status === 504;
        if (!retryable || attempt === 1) throw error;
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    }
    throw lastError || new Error("Não foi possível iniciar a solicitação Nitro.");
  };

  const submitPcReceipt = async () => {
    if (!receipt || uploading || requestBlocked) return;
    setUploading(true);
    setSubmitError("");
    try {
      const planId = PLANS[planKey].id;
      let session = null;
      const cached = readCachedQr(planId);
      const cachedExpiry = cached?.expires_at ? new Date(cached.expires_at).getTime() : 0;

      if (cached && cachedExpiry > Date.now()) {
        session = cached;
      } else if (remoteSession?.token && remoteSession?.session_id && ["waiting", "uploading", "processing"].includes(remoteSession.status)) {
        session = remoteSession;
      }

      if (!session) {
        try {
          session = await createReceiptSession("pc");
        } catch (error) {
          if (error?.response?.data?.code === "active_qr_exists") {
            // O usuário escolheu enviar pelo PC: é uma troca explícita de canal,
            // então podemos substituir a sessão antiga que perdeu o token local.
            session = await createReceiptSession("pc", true);
          } else {
            throw error;
          }
        }
      }

      if (!session?.token || !session?.session_id) throw new Error("Não foi possível criar a sessão segura.");
      await base44.functions.invoke("nitroReceiptUpload", {
        action: "upload",
        session_id: session.session_id,
        token: session.token,
        upload_source: "pc",
        receipt,
      });
      setReceipt(null);
      setLocalSubmitted(true);
      clearCachedQr(PLANS[planKey].id);
      setRemoteSession(null);
      setRemoteQr("");
      await Promise.resolve(onSubmitted?.()).catch(() => {});
    } catch (error) {
      setSubmitError(error?.response?.data?.error || error?.message || "Não foi possível enviar o comprovante.");
      await Promise.resolve(onSubmitted?.()).catch(() => {});
    } finally {
      setUploading(false);
    }
  };

  const createMobileQr = async (forceRegenerate = false) => {
    if (remoteBusy || requestBlocked) return;
    setRemoteBusy(true);
    setSubmitError("");
    const planId = PLANS[planKey].id;

    const showSessionQr = async (session) => {
      if (!session?.token || !session?.session_id || !/^[a-f0-9]{64}$/.test(String(session.token))) {
        throw new Error("Não foi possível preparar a sessão de envio pelo celular.");
      }
      const uploadUrl = `${window.location.origin}/nitro/comprovante/${encodeURIComponent(session.session_id)}/${encodeURIComponent(session.token)}`;
      const qr = await QRCode.toDataURL(uploadUrl, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      saveCachedQr(planId, session);
      setRemoteSession(session);
      setRemoteQr(qr);
      await Promise.resolve(onSubmitted?.()).catch(() => {});
    };

    try {
      // Se o componente remontar ou a página for recarregada, reutiliza o QR
      // que já estava ativo em vez de criar outro e invalidar o celular.
      if (!forceRegenerate) {
        const cached = readCachedQr(planId);
        const cachedExpiry = cached?.expires_at ? new Date(cached.expires_at).getTime() : 0;
        if (cached && cachedExpiry > Date.now()) {
          try {
            const statusRes = await base44.functions.invoke("nitroReceiptSession", {
              action: "status",
              session_id: cached.session_id,
            });
            const status = statusRes?.data || {};
            if (["waiting", "uploading", "processing", "received"].includes(status.status)) {
              const restored = { ...cached, ...status };
              const uploadUrl = `${window.location.origin}/nitro/comprovante/${encodeURIComponent(cached.session_id)}/${encodeURIComponent(cached.token)}`;
              const qr = status.status === "received" ? "" : await QRCode.toDataURL(uploadUrl, {
                width: 320,
                margin: 1,
                errorCorrectionLevel: "M",
              });
              setRemoteSession(restored);
              setRemoteQr(qr);
              if (status.status === "received") {
                setLocalSubmitted(true);
                clearCachedQr(planId);
                await Promise.resolve(onSubmitted?.()).catch(() => {});
              }
              return;
            }
            clearCachedQr(planId);
          } catch {
            // Se só a consulta de status falhar temporariamente, mantenha o QR
            // já emitido. Não gere outro e não invalide o celular à toa.
            await showSessionQr(cached);
            return;
          }
        } else if (cached) {
          clearCachedQr(planId);
        }
      }

      const session = await createReceiptSession("mobile_qr", forceRegenerate);
      await showSessionQr(session);
    } catch (error) {
      const data = error?.response?.data || {};
      if (data?.code === "active_qr_exists" && !forceRegenerate) {
        // Se existe uma sessão antiga cuja chave não está mais disponível no
        // navegador (ou é token legado), substitui UMA vez por um token v2.
        try {
          clearCachedQr(planId);
          const freshSession = await createReceiptSession("mobile_qr", true);
          await showSessionQr(freshSession);
          return;
        } catch (retryError) {
          const retryData = retryError?.response?.data || {};
          setSubmitError(retryData?.error || retryError?.message || "Não foi possível regenerar o QR Code.");
          return;
        }
      }
      setSubmitError(data?.error || error?.message || "Não foi possível gerar o QR Code.");
    } finally {
      setRemoteBusy(false);
    }
  };

  const remoteExpires = useMemo(() => {
    if (!remoteSession?.expires_at) return "";
    const date = new Date(remoteSession.expires_at);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }, [remoteSession?.expires_at]);

  if (active) {
    return (
      <section id="renovar" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.035] p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Assinatura ativa</p>
            <h2 className="mt-1 font-heading text-xl font-extrabold">Seu Nébula Nitro já está ativo</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Enquanto sua assinatura estiver ativa, uma nova compra não pode ser solicitada. Os planos e o envio de comprovante serão liberados novamente somente após a expiração.
            </p>
          </div>
          {validUntil && (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-1 text-[10px] font-bold text-emerald-300">
              Ativo até {parseDate(validUntil).format("DD/MM/YYYY")}
            </span>
          )}
        </div>
      </section>
    );
  }

  return (
    <section id="renovar" className="rounded-2xl border border-border/40 bg-card/35 p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Pagamento</p>
          <h2 className="mt-1 font-heading text-xl font-extrabold">Comprar ou renovar Nitro</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha o plano, faça o Pix e envie o comprovante com segurança pelo PC ou celular.
          </p>
        </div>
        {active && validUntil && (
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1 text-[10px] font-bold text-emerald-300">
            Ativo até {parseDate(validUntil).format("DD/MM/YYYY")}
          </span>
        )}
      </div>

      {requestBlocked ? (
        <div className="mt-5 rounded-2xl border border-border/45 bg-background/30 p-4">
          <div className="flex items-center gap-2 text-amber-300">
            {blockingRequest?.status === "code_issued" ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4" />}
            <p className="text-sm font-extrabold">
              {blockingRequest?.status === "code_issued" ? "Código aprovado aguardando resgate" : "Comprovante recebido · aguardando análise"}
            </p>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {blockingRequest?.status === "code_issued"
              ? "Sua compra foi aprovada. O código também fica disponível aqui para você resgatar na seção “Resgatar código Nitro”."
              : "Sua solicitação já foi enviada para a equipe. Você poderá comprar ou renovar novamente depois que ela for resolvida."}
          </p>
          {blockingRequest?.status === "code_issued" && blockingRequest?.issued_code && (
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-3 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 break-all font-mono text-sm font-extrabold text-cyan-200">
                {blockingRequest.issued_code}
              </code>
              <Button type="button" size="sm" variant="outline" onClick={copyIssuedCode}>
                {issuedCodeCopied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {issuedCodeCopied ? "Copiado" : "Copiar código"}
              </Button>
            </div>
          )}
        </div>
      ) : !confirmed ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {Object.entries(PLANS).map(([key, plan]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPlanKey(key)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition",
                  planKey === key
                    ? "border-primary/50 bg-primary/[0.08]"
                    : "border-border/35 bg-background/25 hover:border-border"
                )}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{t(plan.label)}</p>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <p className="font-display text-2xl font-black">R$ {plan.price}</p>
                  {planKey === key && <Check className="h-4 w-4 text-primary" />}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("nitro.access_days", { period: t(plan.period) })}</p>
                <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                  <p>• Personalização Nitro</p>
                  <p>• Benefícios exclusivos</p>
                  <p>• Renovação acumulativa</p>
                </div>
              </button>
            ))}
          </div>

          {active && (
            <p className="mt-3 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2 text-xs text-emerald-300">
              Sua compra será uma renovação. Depois do resgate do código aprovado, os novos dias serão adicionados ao final da validade atual.
            </p>
          )}

          <Button onClick={() => setConfirmed(true)} size="lg" className="mt-4 w-full">
            <Zap className="mr-2 h-4 w-4" />
            Continuar com {t(PLANS[planKey].label)} · R$ {PLANS[planKey].price}
          </Button>
        </>
      ) : (
        <div className="mt-5 space-y-4">
          <section className="rounded-2xl border border-border/35 bg-background/25 p-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-extrabold">1. Faça o pagamento por Pix</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("nitro.pay_desc", {
                amount: `R$ ${PLANS[planKey].price}`,
                plan: t(PLANS[planKey].label),
              })}
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-[180px_1fr] md:items-center">
              <div className="mx-auto grid h-[180px] w-[180px] place-items-center rounded-2xl border border-border/35 bg-white p-3 md:mx-0">
                {pixLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-black/60" />
                ) : pixQr ? (
                  <img src={pixQr} alt={t("nitro.pix_qr_alt")} className="h-40 w-40 max-w-full" />
                ) : (
                  <div className="px-3 text-center">
                    <span className="block text-xs font-semibold text-black/60">{pixError || t("nitro.pix_error")}</span>
                    <button
                      type="button"
                      className="mt-2 text-[11px] font-bold text-black underline underline-offset-2"
                      onClick={() => void loadPix()}
                      disabled={pixLoading}
                    >
                      {pixLoading ? "Carregando Pix…" : "Tentar novamente"}
                    </button>
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-sm font-bold">{t("nitro.pix_scan")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("nitro.pix_hidden_hint")}</p>
                <button
                  type="button"
                  onClick={copyPix}
                  disabled={!pixPayload || pixLoading}
                  className={cn(
                    "mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
                    copied ? "bg-emerald-500/15 text-emerald-300" : "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? t("nitro.copy_done") : t("nitro.copy_pix")}
                </button>
                <p className="mt-2 text-xs text-muted-foreground">{t("nitro.payee")}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border/35 bg-background/25 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-extrabold">2. Envie o comprovante</h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              O servidor aceita somente PNG, JPG, JPEG e WEBP de até 8 MB. O arquivo é validado, sanitizado e armazenado de forma privada.
            </p>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-border/35 bg-card/25 p-4">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-primary" />
                  <p className="text-sm font-bold">Enviar pelo PC</p>
                </div>

                <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border/50 px-3 py-5 text-center transition hover:border-primary/30">
                  {receiptPreview ? (
                    <img src={receiptPreview} alt="Preview do comprovante" className="mb-3 max-h-36 w-full rounded-lg object-contain" />
                  ) : (
                    <ImagePlus className="mb-2 h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="max-w-full truncate text-xs font-semibold">{receipt ? receipt.name : "Escolher imagem"}</span>
                  <span className="mt-1 text-[10px] text-muted-foreground">PNG/JPG/WEBP · máximo 8 MB</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={uploading}
                    onChange={(event) => chooseReceipt(event.target.files?.[0] || null)}
                  />
                </label>

                <Button className="mt-3 w-full" disabled={!receipt || uploading} onClick={submitPcReceipt}>
                  {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {uploading ? "Validando e enviando…" : "Enviar comprovante"}
                </Button>
              </div>

              <div className="rounded-2xl border border-border/35 bg-card/25 p-4">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-primary" />
                  <p className="text-sm font-bold">Enviar pelo celular</p>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                  Gere um QR Code temporário e envie a imagem diretamente do celular. O código expira em 10 minutos e funciona uma única vez.
                </p>

                {!remoteSession || ["expired", "failed"].includes(remoteSession.status) ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 w-full"
                    disabled={remoteBusy}
                    onClick={() => createMobileQr(Boolean(remoteSession && ["expired", "failed"].includes(remoteSession.status)))}
                  >
                    {remoteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                    {remoteSession ? "Gerar novo QR Code" : incompleteRequest ? "Gerar novo QR Code" : "Enviar comprovante pelo celular"}
                  </Button>
                ) : (
                  <div className="mt-3">
                    {remoteQr && remoteSession.status !== "received" && (
                      <div className="mx-auto grid h-48 w-48 max-w-full place-items-center rounded-2xl bg-white p-3">
                        <img src={remoteQr} alt="QR Code para enviar comprovante pelo celular" className="h-full w-full object-contain" />
                      </div>
                    )}

                    <div className={cn(
                      "mt-3 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold",
                      remoteSession.status === "received"
                        ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
                        : "border-border/35 bg-background/30 text-muted-foreground"
                    )}>
                      {remoteSession.status === "received" ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                      ) : (
                        <Clock3 className="h-4 w-4 shrink-0 text-primary" />
                      )}
                      <span>
                        {REMOTE_LABEL[remoteSession.status] || "Aguardando celular"}
                        {remoteExpires && remoteSession.status === "waiting" ? ` · expira às ${remoteExpires}` : ""}
                      </span>
                    </div>

                    {remoteSession.status === "received" ? (
                      <p className="mt-2 text-center text-[11px] text-emerald-300">
                        O comprovante chegou ao PC e está aguardando análise.
                      </p>
                    ) : (
                      <p className="mt-2 text-center text-[10px] leading-4 text-muted-foreground">
                        Escaneie com a câmera do celular. Não compartilhe esse QR Code.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {submitError && (
              <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-3 py-2.5 text-xs font-semibold text-red-300">
                {submitError}
              </p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
