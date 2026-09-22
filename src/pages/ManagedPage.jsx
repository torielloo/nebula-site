import React from "react";
import { Navigate, useParams } from "react-router-dom";
import { useSiteConfig } from "@/lib/SiteConfigContext";
import PageShell from "@/components/PageShell";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import OwnerGlobalBannerEditor, { inferBannerKind } from "@/components/OwnerGlobalBannerEditor";

export default function ManagedPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { slug } = useParams();
  const { config, loading } = useSiteConfig();
  if (loading) return <div className="mx-auto max-w-3xl p-8 text-sm text-muted-foreground">{t("common.loading_page")}</div>;
  const page = (config.pages || []).find((item) => item?.slug === slug && item?.enabled !== false);
  if (!page) return <Navigate to="/" replace />;

  const safeSlug = String(slug || "page").replace(/[^a-z0-9_-]/gi, "_");
  const bannerKey = `managed_page_${safeSlug}`;
  const bannerOverride = config?.banners?.[bannerKey];
  const bannerUrl = bannerOverride?.url || page.hero_image || "";
  const bannerKind = inferBannerKind(bannerUrl, bannerOverride?.kind || "image");

  return (
    <PageShell
      label={page.label || "Nébula OS"}
      title={page.title || page.nav_label || slug}
      subtitle={page.description || ""}
    >
      <article className="mx-auto max-w-4xl rounded-2xl border border-border/60 bg-card p-5 md:p-8">
        {(bannerUrl || user?.role === "owner") && (
          <div className={bannerUrl ? "relative mb-6 overflow-hidden rounded-xl" : "relative mb-3 min-h-10"}>
            {bannerUrl && (
              bannerKind === "video" ? (
                <video src={bannerUrl} autoPlay loop muted playsInline preload="metadata" className="max-h-[420px] w-full object-cover" />
              ) : (
                <img src={bannerUrl} alt="" className="max-h-[420px] w-full object-cover" />
              )
            )}
            <OwnerGlobalBannerEditor
              bannerKey={bannerKey}
              label="Trocar banner"
              className="absolute right-2 top-2 z-20"
              compact
            />
          </div>
        )}
        <div className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90 md:text-base">
          {page.body || ""}
        </div>
      </article>
    </PageShell>
  );
}
