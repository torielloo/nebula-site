import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, ScanSearch, ListChecks, Ticket, Copy, Check, MessageSquareText } from "lucide-react";
import { CATEGORY_ICONS } from "./ErrorCard";
import { useI18n } from "@/lib/i18n";
import { localizeKnownError } from "@/lib/i18n/knownErrorTranslations";
import { useAuth } from "@/lib/AuthContext";

function Section({ icon: Icon, title, children }) {
  return (
    <div className="rounded-xl border border-border/30 bg-background/30 p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">{title}</h4>
      </div>
      <div className="mt-3 text-sm leading-relaxed text-foreground/85">{children}</div>
    </div>
  );
}

function CodeChip({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 rounded-full bg-background/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
    >
      {code}
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function ErrorDetailDialog({ error, open, onOpenChange }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [solutionCopied, setSolutionCopied] = useState(false);
  const [supportReplyCopied, setSupportReplyCopied] = useState(false);
  const [supportName, setSupportName] = useState("");
  const [supportNameError, setSupportNameError] = useState(false);
  const canUseSupportReply = !!user && ["support", "owner"].includes(user.role);

  useEffect(() => {
    if (!canUseSupportReply) return;
    try {
      setSupportName(localStorage.getItem("nebula_support_copy_name") || "");
    } catch {
      setSupportName("");
    }
  }, [canUseSupportReply]);

  if (!error) return null;
  const localizedError = localizeKnownError(error, lang);
  const Icon = CATEGORY_ICONS[error.category] || CATEGORY_ICONS.outros;
  const steps = (localizedError.solution || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const formattedSolution = steps.length > 1
    ? steps.map((step, index) => `${index + 1}. ${step}`).join("\n")
    : (steps[0] || localizedError.solution || "");
  const errorLabel = [error.code, localizedError.title].filter(Boolean).join(" — ");

  const copyText = async (text) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  };

  const handleCopySolution = async () => {
    const text = [
      errorLabel,
      localizedError.meaning,
      formattedSolution,
    ].filter(Boolean).join("\n\n");
    await copyText(text);
    setSolutionCopied(true);
    setTimeout(() => setSolutionCopied(false), 1800);
  };

  const handleCopySupportReply = async () => {
    const name = supportName.trim();
    if (!name) {
      setSupportNameError(true);
      return;
    }
    setSupportNameError(false);
    try {
      localStorage.setItem("nebula_support_copy_name", name);
    } catch {
      // O nome continua válido para esta sessão mesmo sem armazenamento local.
    }
    const text = t("solucoes.support_reply_template", {
      name,
      error: errorLabel || localizedError.title,
      solution: formattedSolution,
    });
    await copyText(text);
    setSupportReplyCopied(true);
    setTimeout(() => setSupportReplyCopied(false), 1800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto scrollbar-thin rounded-2xl border-border/30 bg-card/70 p-0 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.95)] backdrop-blur-2xl sm:max-w-lg">
        <div className="relative border-b border-border/30 bg-gradient-to-b from-primary/10 to-transparent p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-primary">
              <Icon className="h-3 w-3" />
              {t("solucoes.cat_" + (error.category || "outros"))}
            </span>
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> {t("solucoes.verified")}
            </span>
            {error.code && <CodeChip code={error.code} />}
          </div>
          <DialogHeader className="mt-3 space-y-1.5 text-left">
            <DialogTitle className="font-heading text-lg font-extrabold leading-snug">{localizedError.title}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">{localizedError.meaning}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-3 p-5">
          {localizedError.cause && (
            <Section icon={AlertTriangle} title={t("solucoes.cause")}>
              <p className="whitespace-pre-line">{localizedError.cause}</p>
            </Section>
          )}
          {localizedError.identification && (
            <Section icon={ScanSearch} title={t("solucoes.identify")}>
              <p className="whitespace-pre-line">{localizedError.identification}</p>
            </Section>
          )}
          {steps.length > 0 && (
            <Section icon={ListChecks} title={t("solucoes.steps")}>
              {steps.length > 1 ? (
                <ol className="space-y-2.5">
                  {steps.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-extrabold text-primary">
                        {i + 1}
                      </span>
                      <p className="pt-0.5 whitespace-pre-line">{s}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="whitespace-pre-line">{steps[0]}</p>
              )}
            </Section>
          )}

          {steps.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] w-full justify-center rounded-xl border-primary/25 bg-primary/[0.05]"
              onClick={handleCopySolution}
            >
              {solutionCopied ? <Check className="mr-1.5 h-4 w-4 text-emerald-400" /> : <Copy className="mr-1.5 h-4 w-4" />}
              {solutionCopied ? t("solucoes.solution_copied") : t("solucoes.copy_solution")}
            </Button>
          )}

          {canUseSupportReply && steps.length > 0 && (
            <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <MessageSquareText className="h-4 w-4" />
                </span>
                <div>
                  <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">{t("solucoes.support_reply_title")}</h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("solucoes.support_reply_hint")}</p>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <Input
                  value={supportName}
                  onChange={(event) => {
                    setSupportName(event.target.value);
                    if (event.target.value.trim()) setSupportNameError(false);
                  }}
                  onBlur={() => {
                    const name = supportName.trim();
                    if (!name) return;
                    try { localStorage.setItem("nebula_support_copy_name", name); } catch {}
                  }}
                  placeholder={t("solucoes.support_name_ph")}
                  aria-label={t("solucoes.support_name")}
                  className={supportNameError ? "border-destructive focus-visible:ring-destructive/40" : ""}
                />
                {supportNameError && (
                  <p className="text-xs font-medium text-destructive">{t("solucoes.support_name_required")}</p>
                )}
                <Button type="button" className="min-h-[42px] w-full" onClick={handleCopySupportReply}>
                  {supportReplyCopied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                  {supportReplyCopied ? t("solucoes.support_reply_copied") : t("solucoes.copy_support_reply")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border/30 p-4 sm:flex-row">
          <Button asChild className="min-h-[44px] flex-1">
            <Link to="/tickets">
              <Ticket className="mr-1.5 h-4 w-4" /> {t("solucoes.not_worked")}
            </Link>
          </Button>
          <Button variant="outline" className="min-h-[44px] sm:w-28" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}