import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, Loader2, RefreshCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const NAME_KEY = "nebula_support_copy_name";

function defaultSupportName(user) {
  try {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved?.trim()) return saved.trim();
  } catch {}
  const profile = user?.profile || {};
  return (
    profile.display_name ||
    profile.name ||
    profile.username ||
    user?.full_name ||
    (user?.email || "Suporte").split("@")[0]
  );
}

export default function TicketSupportAi({ ticket, user }) {
  const [open, setOpen] = useState(false);
  const [supportName, setSupportName] = useState(() => defaultSupportName(user));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [resultTicketId, setResultTicketId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const autoTicketRef = useRef("");

  const analyze = useCallback(async () => {
    const name = supportName.trim();
    if (!ticket?.id || !name || loading) return;

    setLoading(true);
    setError("");
    setCopied(false);
    try {
      try { localStorage.setItem(NAME_KEY, name); } catch {}
      const response = await base44.functions.invoke("ticketSupportAi", {
        ticket_id: ticket.id,
        support_name: name,
      });
      const data = response?.data || {};
      if (!data?.ok || !data?.reply) throw new Error(data?.error || "A IA não retornou uma resposta.");
      setResult(data);
      setResultTicketId(ticket.id);
    } catch (err) {
      setResult(null);
      setResultTicketId("");
      setError(err?.response?.data?.error || err?.message || "Não foi possível analisar este ticket.");
    } finally {
      setLoading(false);
    }
  }, [ticket?.id, supportName, loading]);

  useEffect(() => {
    setResult(null);
    setResultTicketId("");
    setError("");
    setCopied(false);
    autoTicketRef.current = "";
  }, [ticket?.id]);

  useEffect(() => {
    if (!open || !ticket?.id || !supportName.trim() || loading) return;
    if (autoTicketRef.current === ticket.id) return;
    autoTicketRef.current = ticket.id;
    analyze();
  }, [open, ticket?.id, supportName, loading, analyze]);

  if (!["support", "owner"].includes(user?.role) || !ticket?.id) return null;

  const activeResult = resultTicketId === ticket.id ? result : null;

  const copyReply = async () => {
    if (!activeResult?.reply) return;
    try {
      await navigator.clipboard.writeText(activeResult.reply);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = activeResult.reply;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const confidence = Math.round(Math.max(0, Math.min(1, Number(activeResult?.confidence) || 0)) * 100);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-[calc(8.75rem+env(safe-area-inset-bottom))] right-4 z-[60] grid h-12 w-12 place-items-center rounded-full border border-primary/30 bg-primary/90 text-primary-foreground shadow-[0_18px_55px_-18px_hsl(var(--primary)/0.8)] backdrop-blur-xl transition-transform hover:scale-105 md:bottom-24 md:right-6 md:h-14 md:w-14"
          aria-label="Abrir IA de suporte do ticket"
          title="IA do Ticket"
        >
          <span className="relative grid h-9 w-9 place-items-center rounded-full bg-black/15">
            <Bot className="h-5 w-5" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-primary" />
          </span>
        </button>
      )}

      {open && (
        <aside className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-3 z-[60] flex max-h-[min(78dvh,720px)] w-[min(420px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-background/95 shadow-[0_24px_90px_-28px_rgba(0,0,0,0.95)] backdrop-blur-2xl md:bottom-6 md:right-6">
          <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <Bot className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-extrabold">
                IA do Ticket <Sparkles className="h-3.5 w-3.5 text-primary" />
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                Analisa o atendimento e prepara uma resposta para copiar
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground"
              aria-label="Fechar IA do Ticket"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <div className="rounded-2xl border border-border/40 bg-card/60 p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Ticket atual</p>
              <p className="mt-1 truncate text-sm font-bold">{ticket.subject}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                A IA considera a descrição e as mensagens recentes deste atendimento.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                Seu nome no atendimento
              </label>
              <Input
                value={supportName}
                onChange={(event) => setSupportName(event.target.value)}
                onBlur={() => {
                  const name = supportName.trim();
                  if (!name) return;
                  try { localStorage.setItem(NAME_KEY, name); } catch {}
                }}
                placeholder="Nome do suporte"
                maxLength={80}
              />
            </div>

            {loading && (
              <div className="grid min-h-40 place-items-center rounded-2xl border border-primary/20 bg-primary/[0.05] p-5 text-center">
                <div>
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                  <p className="mt-3 text-sm font-bold">Analisando o ticket…</p>
                  <p className="mt-1 text-xs text-muted-foreground">Comparando o relato com os erros conhecidos do Nébula.</p>
                </div>
              </div>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3">
                <p className="text-sm font-bold text-destructive">Não foi possível analisar</p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              </div>
            )}

            {!loading && activeResult && (
              <>
                <div className={cn(
                  "rounded-2xl border p-3",
                  activeResult.recognized
                    ? "border-emerald-400/25 bg-emerald-400/[0.07]"
                    : "border-amber-300/25 bg-amber-300/[0.06]"
                )}>
                  <div className="flex items-start gap-2">
                    <ShieldCheck className={cn("mt-0.5 h-4 w-4 shrink-0", activeResult.recognized ? "text-emerald-400" : "text-amber-300")} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-extrabold">
                        {activeResult.recognized ? "Erro reconhecido" : "Diagnóstico ainda incerto"}
                      </p>
                      {(activeResult.matched_error_title || activeResult.matched_error_code) && (
                        <p className="mt-1 text-xs text-foreground/85">
                          {[activeResult.matched_error_code, activeResult.matched_error_title].filter(Boolean).join(" — ")}
                        </p>
                      )}
                      {activeResult.summary && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{activeResult.summary}</p>}
                      <span className="mt-2 inline-flex rounded-full bg-background/60 px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
                        Confiança {confidence}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/40 bg-card/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Mensagem pronta</p>
                    <span className="text-[9px] text-muted-foreground">Revise antes de enviar</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-border/30 bg-background/55 p-3 text-xs leading-5 text-foreground/90 scrollbar-thin">
                    {activeResult.reply}
                  </div>
                  <Button type="button" className="mt-3 w-full" onClick={copyReply}>
                    {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                    {copied ? "Resposta copiada" : "Copiar resposta completa"}
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="border-t border-border/40 bg-card/35 p-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading || !supportName.trim()}
              onClick={() => {
                autoTicketRef.current = ticket.id;
                analyze();
              }}
            >
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-1.5 h-4 w-4" />}
              {activeResult ? "Analisar novamente" : "Analisar ticket"}
            </Button>
          </div>
        </aside>
      )}
    </>
  );
}
