import React, { useState } from "react";
import { Crown, ShieldCheck, Monitor, Activity, Copy, Check } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const NOTES = [
  { icon: ShieldCheck, key: "callbar.note1" },
  { icon: Monitor, key: "callbar.note2" },
  { icon: Activity, key: "callbar.note3" },
];

export default function CallSidebar({ channel, connected, count = 1, maxCount = 8 }) {
  const { t } = useI18n();
  const isPrivateStaff = Boolean(channel?.staffPrivate);
  const isTicketCall = Boolean(channel?.ticketCall);
  const [copied, setCopied] = useState(false);

  const copyInvite = async () => {
    const invite = t("callbar.invite", { name: channel.name, code: channel.code, url: `${window.location.origin}/calls` });
    try {
      await navigator.clipboard.writeText(invite);
    } catch {
      /* clipboard bloqueado pelo navegador */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <aside className="h-fit space-y-4 rounded-2xl border border-border/40 bg-secondary/40 p-5">
      <div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-primary">{isTicketCall ? "CALL DO TICKET" : t("callbar.official")}</p>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-extrabold tracking-widest text-emerald-400">
            {t("calls.live")}
          </span>
        </div>
        <h3 className="mt-2 font-heading text-xl font-extrabold">{channel.name}</h3>
        <p className="text-xs text-muted-foreground">{isPrivateStaff ? "Sala privada da equipe · código oculto" : isTicketCall ? "Sala protegida · somente usuário do ticket e Staff" : t("callbar.room", { code: channel.code })}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <span
              className={
                connected ? "h-2 w-2 rounded-full bg-emerald-500" : "h-2 w-2 animate-pulse rounded-full bg-sky-500"
              }
            />
            {connected ? t("call.connected") : t("call.connecting")}
          </span>
          <span className="text-[11px] text-muted-foreground">{t("callbar.direct")}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/40 bg-card/60 p-3 text-center">
          <p className="font-heading text-lg font-extrabold">{count}/{maxCount}</p>
          <p className="text-[11px] text-muted-foreground">{t("callbar.participants")}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/60 p-3 text-center">
          {isTicketCall ? <ShieldCheck className="mx-auto h-4 w-4 text-emerald-400" /> : <Crown className="mx-auto h-4 w-4 text-amber-400" />}
          <p className="font-heading text-lg font-extrabold">{isTicketCall ? "Ticket" : "Nébula"}</p>
          <p className="text-[11px] text-muted-foreground">{isTicketCall ? "sala protegida" : t("callbar.permanent")}</p>
        </div>
      </div>
      {!isPrivateStaff && !isTicketCall && (
        <button
          onClick={copyInvite}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-border/60 px-4 py-2.5 text-xs font-bold transition-colors hover:border-primary/40"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t("callbar.copied") : t("callbar.copy")}
        </button>
      )}
      {(isPrivateStaff || isTicketCall) && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-xs text-emerald-300">
          {isTicketCall ? "Acesso validado pelo ticket. O usuário que abriu o ticket e qualquer membro autorizado da Staff podem participar." : "Acesso validado pelo painel Staff. O identificador da sala não é exibido nem copiável."}
        </div>
      )}
      <ul className="space-y-2.5 border-t border-border/40 pt-4">
        {NOTES.map((note) => (
          <li key={note.key} className="flex items-start gap-2.5 text-xs text-muted-foreground">
            <note.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/80" />
            {t(note.key)}
          </li>
        ))}
      </ul>
    </aside>
  );
}