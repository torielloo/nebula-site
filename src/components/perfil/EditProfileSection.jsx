import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ProfileStyleSection from "@/components/perfil/ProfileStyleSection";
import { useI18n } from "@/lib/i18n";

const inputCls =
  "h-10 rounded-lg border border-white/10 bg-white/[0.04] text-sm transition-colors placeholder:text-muted-foreground/60 focus-visible:border-white/25 focus-visible:ring-white/10";

export default function EditProfileSection({ profile, save, saving, nitroActive, handle }) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [customStatus, setCustomStatus] = useState(profile.nitro_status_text || profile.custom_status || "");
  const [bio, setBio] = useState(profile.bio || "");

  useEffect(() => {
    setDisplayName(profile.display_name || "");
    setCustomStatus(profile.nitro_status_text || profile.custom_status || "");
    setBio(profile.bio || "");
  }, [profile.display_name, profile.custom_status, profile.nitro_status_text, profile.bio]);

  const renderSaveBtn = (onClick, disabled) => (
    <Button size="sm" className="h-10 shrink-0 rounded-lg px-4" onClick={onClick} disabled={saving || disabled}>
      {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
      {t("perfil.save")}
    </Button>
  );

  return (
    <section className="rounded-2xl bg-white/[0.04] p-5 md:p-6">
      <h2 className="font-heading text-lg font-extrabold">{t("perfil.edit_title")}</h2>

      <div className="mt-5 space-y-5">
        <div>
          <label className="text-xs font-semibold text-muted-foreground">{t("perfil.public_name")}</label>
          <div className="mt-1.5 flex gap-2">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("perfil.public_name_ph")}
              maxLength={32}
              className={inputCls}
            />
            {renderSaveBtn(() => save({ display_name: displayName }), displayName === (profile.display_name || ""))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground">{t("perfil.username")}</label>
          <Input value={handle} disabled className={cn(inputCls, "mt-1.5 opacity-70")} />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground">{t("perfil.custom_status")}</label>
          <div className="mt-1.5 flex gap-2">
            <Input
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value)}
              placeholder={t("perfil.custom_status_ph")}
              maxLength={40}
              className={inputCls}
            />
            {renderSaveBtn(
              () => save(nitroActive
                ? { custom_status: customStatus, nitro_status_text: customStatus }
                : { custom_status: customStatus }),
              customStatus === (profile.nitro_status_text || profile.custom_status || "")
            )}
          </div>
        </div>

        <ProfileStyleSection profile={profile} save={save} saving={saving} nitroActive={nitroActive} />

        <div>
          <label className="text-xs font-semibold text-muted-foreground">{t("perfil.bio")}</label>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            maxLength={280}
            placeholder={t("perfil.bio_ph")}
            className="mt-1.5 resize-none border border-white/10 bg-white/[0.04] focus-visible:ring-white/10"
          />
          <div className="mt-3 flex justify-end">
            {renderSaveBtn(() => save({ bio }), bio === (profile.bio || ""))}
          </div>
        </div>
      </div>
    </section>
  );
}