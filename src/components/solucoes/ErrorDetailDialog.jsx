import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, ScanSearch, ListChecks, Ticket, Copy, Check } from "lucide-react";
import { CATEGORY_ICONS } from "./ErrorCard";
import { useI18n } from "@/lib/i18n";
import { localizeKnownError } from "@/lib/i18n/knownErrorTranslations";

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
  if (!error) return null;
  const localizedError = localizeKnownError(error, lang);
  const Icon = CATEGORY_ICONS[error.category] || CATEGORY_ICONS.outros;
  const steps = (localizedError.solution || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

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