import React, { useState } from "react";
import { Globe2, Loader2, RotateCcw, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useSiteConfig } from "@/lib/SiteConfigContext";
import { cn } from "@/lib/utils";

const DEFAULT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm";
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);

export const inferBannerKind = (url = "", explicitKind = "") => {
  if (explicitKind === "video" || explicitKind === "image") return explicitKind;
  return /\.(mp4|webm)(?:$|[?#])/i.test(url) ? "video" : "image";
};

export default function OwnerGlobalBannerEditor({
  bannerKey,
  className,
  label = "Trocar banner",
  accept = DEFAULT_ACCEPT,
  maxBytes = DEFAULT_MAX_BYTES,
  compact = false,
}) {
  const { user } = useAuth();
  const { config, reload } = useSiteConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (user?.role !== "owner") return null;

  const currentOverride = config?.banners?.[bannerKey];

  const saveBannerEntry = async (entry) => {
    const rows = await base44.entities.SiteConfig.filter({ key: "global" }, "-updated_date", 1);
    const current = rows?.[0];
    const nextBanners = { ...(current?.data?.banners || {}) };

    if (entry) nextBanners[bannerKey] = entry;
    else delete nextBanners[bannerKey];

    const nextData = {
      ...(current?.data || {}),
      banners: nextBanners,
    };

    if (current?.id) await base44.entities.SiteConfig.update(current.id, { data: nextData });
    else await base44.entities.SiteConfig.create({ key: "global", data: nextData });

    await reload();
  };

  const onUpload = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file || busy) return;

    setError("");

    if (!allowedMimeTypes.has(file.type)) {
      setError("Use PNG, JPG, WEBP, GIF, MP4 ou WEBM.");
      return;
    }

    if (file.size > maxBytes) {
      setError(`Arquivo muito grande. Máximo: ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      return;
    }

    const confirmed = window.confirm("Este banner é GLOBAL e será alterado para TODOS os usuários do site. Deseja continuar?");
    if (!confirmed) return;

    setBusy(true);
    try {
      const uploaded = await base44.integrations.Core.UploadPublicFile({ file });
      if (!uploaded?.file_url) throw new Error("O upload não retornou uma URL válida.");

      await saveBannerEntry({
        url: uploaded.file_url,
        kind: file.type.startsWith("video/") ? "video" : "image",
        filename: file.name,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      setError(err?.message || "Não foi possível substituir o banner.");
    } finally {
      setBusy(false);
    }
  };

  const resetBanner = async () => {
    if (!currentOverride || busy) return;
    const confirmed = window.confirm("Restaurar o banner padrão para TODOS os usuários?");
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      await saveBannerEntry(null);
    } catch (err) {
      setError(err?.message || "Não foi possível restaurar o banner.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex max-w-[calc(100vw-1rem)] flex-col items-end gap-1.5", className)}>
      <div className="flex max-w-full items-center gap-1.5">
        <label
          title="Somente Owner · alteração global para todos os usuários"
          className={cn(
            "inline-flex max-w-[calc(100vw-4.25rem)] cursor-pointer items-center gap-2 overflow-hidden rounded-full border border-white/15 bg-black/70 font-bold text-white shadow-xl backdrop-blur-xl transition hover:border-white/30 hover:bg-black/85",
            compact ? "h-8 px-2.5 text-[10px]" : "h-9 px-3 text-[11px] sm:h-10 sm:px-3.5 sm:text-xs"
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span className="min-w-0 truncate">{busy ? "Enviando..." : label}</span>
          {!busy && !compact && (
            <>
              <span className="hidden h-4 w-px bg-white/15 sm:block" />
              <span className="hidden items-center gap-1 rounded-full border border-amber-300/15 bg-amber-300/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-amber-100/90 sm:inline-flex">
                <Globe2 className="h-3 w-3" />
                Global
              </span>
            </>
          )}
          <input
            type="file"
            accept={accept}
            className="hidden"
            disabled={busy}
            onChange={onUpload}
          />
        </label>

        {currentOverride && (
          <button
            type="button"
            onClick={resetBanner}
            disabled={busy}
            title="Restaurar banner padrão"
            className={cn(
              "grid place-items-center rounded-full border border-white/15 bg-black/70 text-white/80 shadow-xl backdrop-blur-xl transition hover:bg-black/85 hover:text-white disabled:opacity-50",
              compact ? "h-8 w-8" : "h-10 w-10"
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {error && (
        <span className="max-w-[280px] rounded-lg border border-red-400/20 bg-red-950/85 px-2.5 py-1.5 text-right text-[10px] font-semibold text-red-100 shadow-xl backdrop-blur-xl">
          {error}
        </span>
      )}
    </div>
  );
}
