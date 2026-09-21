import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ImagePlus, Loader2, ShieldCheck, Upload, XCircle } from "lucide-react";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

const PLAN = {
  nitro_mensal: "Nitro Mensal · 30 dias",
  nitro_anual: "Nitro Anual · 365 dias",
};

export default function NitroReceiptUpload() {
  const { sessionId: routeSessionId = "", token = "" } = useParams();
  const [searchParams] = useSearchParams();
  const sessionId = routeSessionId || searchParams.get("session") || searchParams.get("sid") || "";
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canUpload = session?.can_upload === true && session?.status === "waiting";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    base44.functions
      .invoke("nitroReceiptUpload", { action: "inspect", session_id: sessionId, token })
      .then((res) => {
        if (!cancelled) setSession(res?.data || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.error || err?.message || "Não foi possível validar esta sessão. Gere um novo QR Code no Nébula Nitro.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, token]);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const expiresLabel = useMemo(() => {
    if (!session?.expires_at) return "";
    const date = new Date(session.expires_at);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }, [session?.expires_at]);

  const chooseFile = (next) => {
    setError("");
    setMessage("");
    if (!next) return;
    const name = String(next.name || "").toLowerCase();
    const extOk = /\.(png|jpe?g|webp)$/.test(name);
    if (!ALLOWED.has(next.type) || !extOk) {
      setFile(null);
      setError("Envie somente PNG, JPG, JPEG ou WEBP.");
      return;
    }
    if (next.size <= 0 || next.size > MAX_BYTES) {
      setFile(null);
      setError("A imagem deve ter no máximo 8 MB.");
      return;
    }
    setFile(next);
  };

  const send = async () => {
    if (!file || !canUpload || uploading) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const res = await base44.functions.invoke("nitroReceiptUpload", {
        action: "upload",
        session_id: sessionId,
        token,
        upload_source: "mobile_qr",
        receipt: file,
      });
      const data = res?.data || {};
      setSession((current) => ({ ...(current || {}), status: data.status || "received", can_upload: false }));
      setMessage("Comprovante enviado com sucesso. Você já pode voltar ao PC.");
      setFile(null);
    } catch (err) {
      const data = err?.response?.data || {};
      const msg = data?.error || err?.message || "Não foi possível enviar o comprovante.";
      setError(msg);
      if (data?.retryable === true) {
        setSession((current) => current ? { ...current, can_upload: true, status: "waiting" } : current);
        if (data?.code !== "falha_no_storage_privado") setFile(null);
      } else {
        setSession((current) => current ? { ...current, can_upload: false, status: "failed" } : current);
      }
    } finally {
      setUploading(false);
    }
  };

  const terminalStatus = session?.status === "received" || session?.status === "expired" || session?.status === "failed";

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-5 flex items-center justify-center gap-2">
          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Nébula Nitro</p>
            <h1 className="font-heading text-xl font-extrabold">Envie seu comprovante</h1>
          </div>
        </div>

        <section className="overflow-hidden rounded-3xl border border-border/45 bg-card/55 shadow-2xl shadow-black/20">
          <div className="border-b border-border/35 p-5">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Validando QR Code…
              </div>
            ) : error && !session ? (
              <div className="flex items-start gap-2 text-sm text-red-300">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : (
              <>
                <p className="text-sm font-bold">{PLAN[session?.plan] || "Nébula Nitro"}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Este acesso é temporário, funciona uma única vez e não libera o Nitro automaticamente.
                  {expiresLabel ? ` Expira às ${expiresLabel}.` : ""}
                </p>
              </>
            )}
          </div>

          {!loading && session && !terminalStatus && (
            <div className="p-5">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border/55 bg-background/20 px-4 py-7 text-center transition hover:border-primary/30">
                {preview ? (
                  <img src={preview} alt="Preview do comprovante" className="mb-4 max-h-64 w-full rounded-xl object-contain" />
                ) : (
                  <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-white/[0.035] text-muted-foreground">
                    <ImagePlus className="h-5 w-5" />
                  </div>
                )}
                <span className="text-sm font-bold">{file ? file.name : "Escolher imagem"}</span>
                <span className="mt-1 text-xs text-muted-foreground">PNG, JPG, JPEG ou WEBP · máximo 8 MB</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={!canUpload || uploading}
                  onChange={(event) => chooseFile(event.target.files?.[0] || null)}
                />
              </label>

              {error && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-3 py-2.5 text-xs text-red-300">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button className="mt-4 w-full" size="lg" disabled={!file || !canUpload || uploading} onClick={send}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {uploading ? "Enviando e validando…" : "Enviar comprovante"}
              </Button>

              <p className="mt-3 text-center text-[10px] leading-4 text-muted-foreground">
                O arquivo é validado no servidor, metadados e conteúdo extra são removidos e o resultado é salvo em armazenamento privado.
              </p>
            </div>
          )}

          {!loading && session?.status === "received" && (
            <div className="p-6 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
              <h2 className="mt-3 text-lg font-extrabold">Comprovante recebido</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {message || "O envio foi concluído. Volte ao PC para acompanhar a análise."}
              </p>
            </div>
          )}

          {!loading && (session?.status === "expired" || session?.status === "failed") && (
            <div className="p-6 text-center">
              <XCircle className="mx-auto h-10 w-10 text-amber-300" />
              <h2 className="mt-3 text-lg font-extrabold">
                {session.status === "expired" ? "QR Code expirado" : "Sessão encerrada"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {error || "Gere um novo QR Code na página do Nébula Nitro no PC para tentar novamente."}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
