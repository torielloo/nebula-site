import React from "react";
import { Navigate, useParams } from "react-router-dom";
import { useSiteConfig } from "@/lib/SiteConfigContext";
import PageShell from "@/components/PageShell";
import { useI18n } from "@/lib/i18n";

export default function ManagedPage() {
  const { t } = useI18n();
  const { slug } = useParams();
  const { config, loading } = useSiteConfig();
  if (loading) return <div className="mx-auto max-w-3xl p-8 text-sm text-muted-foreground">{t("common.loading_page")}</div>;
  const page = (config.pages || []).find((item) => item?.slug === slug && item?.enabled !== false);
  if (!page) return <Navigate to="/" replace />;

  return (
    <PageShell
      label={page.label || "Nébula OS"}
      title={page.title || page.nav_label || slug}
      subtitle={page.description || ""}
    >
      <article className="mx-auto max-w-4xl rounded-2xl border border-border/60 bg-card p-5 md:p-8">
        {page.hero_image ? (
          <img src={page.hero_image} alt="" className="mb-6 max-h-[420px] w-full rounded-xl object-cover" />
        ) : null}
        <div className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90 md:text-base">
          {page.body || ""}
        </div>
      </article>
    </PageShell>
  );
}
