import React from "react";
import { Link } from "react-router-dom";
import { Mic, MicOff, Video, VideoOff, MonitorUp, MessageCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ProfileAvatar from "@/components/ProfileAvatar";
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

  const chips = [];
  if (profile.micOn !== undefined) {
    chips.push({
      key: "mic",
      icon: profile.micOn ? Mic : MicOff,
      label: profile.micOn ? t("call.mic_on") : t("call.mic_off"),
      on: profile.micOn,
    });
  }
  if (profile.camOn !== undefined) {
    chips.push({
      key: "cam",
      icon: profile.camOn ? Video : VideoOff,
      label: profile.camOn ? t("call.peer_camera") : t("call.cam_disable"),
      on: profile.camOn,
    });
  }
  if (profile.sharing) {
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
          {profile.banner &&
            (isVideo(profile.banner) ? (
              <video src={profile.banner} autoPlay loop muted playsInline className="h-full w-full object-cover" />
            ) : (
              <Image src={profile.banner} alt="" fittingType="fill" className="h-full w-full" />
            ))}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
        </div>

        {/* Avatar + nome */}
        <div className="relative -mt-9 flex flex-col items-center px-4 pb-4 text-center">
          <ProfileAvatar
            name={profile.name}
            avatar={profile.avatar}
            size="lg"
            frame={profile.frame}
            className="ring-4 ring-card"
          />
          <div className="mt-2.5 flex max-w-full items-center gap-1"><p className="min-w-0 flex-1 truncate text-sm font-bold">{profile.name}</p><CopyIdButton value={profile.user_id || profile.id} label="ID do usuário" className="h-6 w-6" /></div>
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
          {profile.user_id && (
            <Link
              to={`/mensagens?user=${encodeURIComponent(profile.user_id)}`}
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