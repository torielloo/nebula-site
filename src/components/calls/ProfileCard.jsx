import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Mic, MicOff, Video, VideoOff, MonitorUp, MessageCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ProfileAvatar from "@/components/ProfileAvatar";
import NitroBadgeRow from "@/components/nitro/NitroBadgeRow";
import { base44 } from "@/api/base44Client";
import CopyIdButton from "@/components/CopyIdButton";
import { Image } from "@/components/ui/image";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const isVideo = (url) => /\.(mp4|webm|mov)(\?|$)/i.test(url || "");

/**
 * Mini painel de perfil estilo Discord: clique no nome/avatar de qualquer
 * participante da call para ver banner, foto e nome.
 */
export default function ProfileCard({ profile = {}, children }) {
  const { t } = useI18n();
  const userId = profile.user_id || profile.id || "";
  const [liveProfile, setLiveProfile] = useState(null);

  useEffect(() => {
    if (!userId) { setLiveProfile(null); return undefined; }
    let cancelled = false;
    base44.functions.invoke("userDirectory", { action: "profile", user_id: userId, request_nonce: Date.now() })
      .then((res) => { if (!cancelled) setLiveProfile(res.data?.profile || null); })
      .catch(() => { if (!cancelled) setLiveProfile(null); });
    return () => { cancelled = true; };
  }, [userId]);

  const view = useMemo(() => liveProfile ? {
    ...profile,
    ...liveProfile,
    user_id: userId,
    avatar: liveProfile.avatar_url || profile.avatar,
    banner: liveProfile.banner_url || profile.banner,
  } : profile, [liveProfile, profile, userId]);

  const chips = [];
  if (view.micOn !== undefined) {
    chips.push({
      key: "mic",
      icon: view.micOn ? Mic : MicOff,
      label: view.micOn ? t("call.mic_on") : t("call.mic_off"),
      on: view.micOn,
    });
  }
  if (view.camOn !== undefined) {
    chips.push({
      key: "cam",
      icon: view.camOn ? Video : VideoOff,
      label: view.camOn ? t("call.peer_camera") : t("call.cam_disable"),
      on: view.camOn,
    });
  }
  if (view.sharing) {
    chips.push({ key: "share", icon: MonitorUp, label: t("call.sharing"), on: true });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 overflow-hidden rounded-2xl border border-border/40 bg-card p-0 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.95)]"
      >
        {/* Banner */}
        <div className="relative h-20 w-full overflow-hidden bg-gradient-to-r from-primary/20 via-white/10 to-primary/10">
          {view.banner &&
            (isVideo(view.banner) ? (
              <video src={view.banner} autoPlay loop muted playsInline className="h-full w-full object-cover" />
            ) : (
              <Image src={view.banner} alt="" fittingType="fill" className="h-full w-full" />
            ))}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
        </div>

        {/* Avatar + nome */}
        <div className="relative -mt-9 flex flex-col items-center px-4 pb-4 text-center">
          <ProfileAvatar
            name={view.name}
            avatar={view.avatar}
            size="lg"
            status={view.status}
            frame={view.frame}
            customFrameUrl={view.custom_frame_url || ""}
            className="ring-4 ring-card"
          />
          <div className="mt-2.5 flex max-w-full items-center gap-1"><p className="min-w-0 flex-1 truncate text-sm font-bold">{view.name}</p><CopyIdButton value={view.user_id || view.id} label="ID do usuário" className="h-6 w-6" /></div>
          <NitroBadgeRow badges={view.nitro_badges} role={view.role} nitroActive={view.nitro_active} compact className="mt-2 justify-center" />
          {(view.nitro_status_text || view.custom_status) && (
            <div className="mt-2 max-w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold">
              <span className="block truncate">{view.nitro_status_text || view.custom_status}</span>
            </div>
          )}
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
              {chips.map((c) => (
                <span
                  key={c.key}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                    c.on ? "bg-primary/15 text-primary" : "bg-secondary/70 text-muted-foreground"
                  )}
                >
                  <c.icon className="h-3 w-3" />
                  {c.label}
                </span>
              ))}
            </div>
          )}
          {view.user_id && (
            <Link
              to={`/mensagens?user=${encodeURIComponent(view.user_id)}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/60 px-3 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-accent"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Chamar no privado
            </Link>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}