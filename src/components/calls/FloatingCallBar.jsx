import React from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Headphones, Mic, MicOff, PhoneOff, Activity, Volume2, VolumeX } from "lucide-react";
import { useCall } from "@/lib/CallContext";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/** Mini janela de call que persiste enquanto o usuário navega no site. */
export default function FloatingCallBar() {
  const { channel, micOn, deafened, toggleMic, toggleDeafened, leave } = useCall();
  const { t } = useI18n();
  const { pathname, search } = useLocation();
  const privatePanelOpen = channel?.staffPrivate && pathname === "/painel" && new URLSearchParams(search).get("tab") === "staff-call";
  const privateDm = channel?.privateDm && channel?.conversationId;
  const ticketCall = channel?.ticketCall && channel?.ticketId;
  const ticketBackPath = ticketCall
    ? (channel?.ticketStaffMode
      ? `/painel?view=staff&tab=tickets&ticket=${encodeURIComponent(channel.ticketId)}`
      : `/tickets?ticket=${encodeURIComponent(channel.ticketId)}`)
    : "";

  if (!channel || pathname === "/calls" || privatePanelOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-xl border border-border/60 bg-card/95 p-2.5 shadow-xl backdrop-blur-md md:bottom-6 md:left-6 md:right-auto md:max-w-none md:gap-2.5 md:p-3"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center text-foreground">
        <Headphones className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="flex items-center gap-1.5 text-xs font-bold">
          <Activity className="h-3.5 w-3.5 text-emerald-500" />
          {t("call.active")}
        </p>
        <p className="max-w-[150px] truncate text-[11px] text-muted-foreground">
          {channel.name} · {micOn ? t("call.mic_on") : t("call.mic_off")}
        </p>
      </div>
      <button
        onClick={toggleMic}
        title={micOn ? t("call.mic_disable") : t("call.mic_enable")}
        className={cn(
          "relative grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors",
          micOn ? "bg-secondary text-foreground hover:bg-accent" : "bg-destructive text-destructive-foreground"
        )}
      >
        {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        {!micOn && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-400 ring-2 ring-card" />}
      </button>
      <button
        onClick={toggleDeafened}
        title={deafened ? t("call.audio_enable") : t("call.audio_disable")}
        className={cn(
          "relative grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors",
          deafened ? "bg-destructive text-destructive-foreground" : "bg-secondary text-foreground hover:bg-accent"
        )}
      >
        {deafened ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        {deafened && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-card" />}
      </button>
      {ticketCall ? (
        <Link
          to={ticketBackPath}
          onClick={() => window.dispatchEvent(new CustomEvent("nebula:open-ticket-call", { detail: { ticketId: channel.ticketId } }))}
          className="shrink-0 rounded-xl border border-border/60 px-2.5 py-2 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10 sm:px-3"
        >
          {t("callbar.back")}
        </Link>
      ) : privateDm && pathname === "/mensagens" ? (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("nebula:open-private-call"))}
          className="shrink-0 rounded-xl border border-border/60 px-2.5 py-2 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10 sm:px-3"
        >
          {t("callbar.back")}
        </button>
      ) : (
        <Link
          to={ticketBackPath || (privateDm ? `/mensagens?conversation=${encodeURIComponent(channel.conversationId)}` : channel.staffPrivate ? "/painel?view=staff&tab=staff-call" : "/calls")}
          className="shrink-0 rounded-xl border border-border/60 px-2.5 py-2 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10 sm:px-3"
        >
          {t("callbar.back")}
        </Link>
      )}
      <button
        onClick={leave}
        title={t("call.leave_title")}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
      >
        <PhoneOff className="h-4 w-4" />
      </button>
    </motion.div>
  );
}