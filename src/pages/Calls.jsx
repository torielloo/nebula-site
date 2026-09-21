import React, { useEffect, useState } from "react";
import { Headphones, RefreshCw, ShieldCheck, Ear, MicOff, Radio, VolumeX } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { fetchMyMute, muteUntilLabel } from "@/lib/moderation";
import NebulaCoin from "@/components/three/NebulaCoin";
import PageShell from "@/components/PageShell";
import { useI18n } from "@/lib/i18n";
import ChannelCard from "@/components/calls/ChannelCard";
import { useCallPresence } from "@/lib/callPresence";
import CallRoom from "@/components/calls/CallRoom";
import { useCall } from "@/lib/CallContext";

const VOICE_ROOMS = [
  { name: "BR-1", code: "VC-BR1" },
  { name: "BR-2", code: "VC-BR2" },
  { name: "BR-3", code: "VC-BR3" },
];
const SIDEBAR_INFO = [
  { icon: ShieldCheck, key: "calls.info1" },
  { icon: Ear, key: "calls.info2" },
  { icon: MicOff, key: "calls.info3" },
];

export default function Calls() {
  const { channel, setChannel } = useCall();
  const [refreshing, setRefreshing] = useState(false);
  const [myMute, setMyMute] = useState(undefined);
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    fetchMyMute().then(setMyMute).catch(() => setMyMute(null));
  }, []);

  // Presença ao vivo de todas as salas para o contador de membros conectados
  const br1 = useCallPresence("VC-BR1");
  const br2 = useCallPresence("VC-BR2");
  const br3 = useCallPresence("VC-BR3");
  const totalOnline = br1.length + br2.length + br3.length;

  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  // Usuários silenciados não podem entrar em calls
  const tryEnter = (ch) => {
    if (myMute) {
      toast({
        title: t("mute.title"),
        description: t("mute.call_blocked"),
        variant: "destructive",
      });
      return;
    }
    setChannel(ch);
  };

  if (channel) return <CallRoom channel={channel} />;

  return (
    <PageShell
      label={t("calls.label")}
      title={t("calls.title")}
      subtitle={t("calls.subtitle")}
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-gradient-to-r from-accent/60 via-card to-card p-5">
          <span className="nebula-glow-sm grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <Headphones className="h-6 w-6" />
          </span>
          <div>
            <h2 className="font-heading text-lg font-extrabold">{t("calls.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("calls.hero_desc")}</p>
          </div>
          <div className="ml-auto hidden h-28 w-28 shrink-0 place-items-center md:grid">
            <NebulaCoin className="h-20 w-20" />
          </div>
        </div>

        {myMute && (
          <div className="flex items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
            <VolumeX className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm">
              <span className="font-bold text-destructive">{t("mute.title")}</span>{" "}
              <span className="text-muted-foreground">
                {myMute.reason ? t("mute.reason", { reason: myMute.reason }) : ""}
                {myMute.expires_at
                  ? t("mute.until", { date: muteUntilLabel(myMute.expires_at) })
                  : t("mute.permanent")}{" "}
                {t("mute.no_send")}
              </span>
            </p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-4">
          <aside className="h-fit space-y-4 rounded-2xl border border-border/40 bg-secondary/40 p-5 lg:col-span-1">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Radio className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-heading text-sm font-bold">Nébula Voice</h3>
                <p className="text-xs text-muted-foreground">{t("calls.official_permanent")}</p>
              </div>
            </div>
            <div className="rounded-xl border border-border/40 bg-card/60 p-4 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-extrabold tracking-widest text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> {t("calls.live")}
              </span>
              <p className="mt-2 font-heading text-3xl font-extrabold">{totalOnline}</p>
              <p className="text-xs text-muted-foreground">{t("calls.connected")}</p>
            </div>
            <ul className="space-y-2.5">
              {SIDEBAR_INFO.map((info) => (
                <li key={info.key} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <info.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/80" />
                  {t(info.key)}
                </li>
              ))}
            </ul>
          </aside>

          <section className="rounded-2xl border border-border/40 bg-secondary/40 p-5 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-primary">{t("calls.title")}</p>
                <h3 className="font-heading text-base font-bold">{t("calls.choose")}</h3>
                <p className="text-xs text-muted-foreground">{t("calls.choose_hint")}</p>
              </div>
              <button
                onClick={refresh}
                className="flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-emerald-400/40 hover:text-emerald-400"
              >
                <RefreshCw className={"h-3.5 w-3.5 text-emerald-400" + (refreshing ? " animate-spin" : "")} />
                {t("calls.refresh")}
              </button>
            </div>
            <div className="mt-5 space-y-6">
              <div>
                <h4 className="text-[11px] font-extrabold tracking-[0.2em] text-muted-foreground">{t("calls.voice_rooms")}</h4>
                <div className="mt-2.5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {VOICE_ROOMS.map((channel) => (
                    <ChannelCard key={channel.code} channel={channel} onEnter={tryEnter} />
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  );
}