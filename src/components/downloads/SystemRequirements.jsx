import React from "react";
import { Cpu, HardDrive, MemoryStick, Monitor, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
const SYSTEM_REQUIREMENTS_IMAGE = "data:image/webp;base64,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";

function WindowsMark() {
  return (
    <span aria-hidden="true" className="grid h-4 w-4 grid-cols-2 gap-[2px]">
      <span className="bg-[#38bdf8]" />
      <span className="bg-[#38bdf8]" />
      <span className="bg-[#38bdf8]" />
      <span className="bg-[#38bdf8]" />
    </span>
  );
}

const rows = [
  { icon: Cpu, labelKey: "requirements.minimum_label", textKey: "requirements.minimum" },
  { icon: MemoryStick, labelKey: "requirements.recommended_label", textKey: "requirements.recommended" },
  { icon: HardDrive, labelKey: "requirements.storage_label", textKey: "requirements.storage" },
];

export default function SystemRequirements() {
  const { t } = useI18n();
  return (
    <section id="system-requirements" className="scroll-mt-24 overflow-hidden rounded-[1.4rem] border border-white/[0.07] bg-[#060606] shadow-[0_26px_80px_-58px_rgba(0,0,0,1)] sm:rounded-[2rem]">
      <div className="relative border-b border-white/[0.06] p-4 sm:p-6 md:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_0%,hsl(var(--primary)/0.11),transparent_34%)]" />
        <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.035em] text-primary sm:gap-2 sm:text-[13px]">
              <Monitor className="h-3.5 w-3.5" />
              {t("requirements.kicker")}
            </div>
            <h2 className="font-fortnite-exact mt-2 text-2xl uppercase leading-[0.9] tracking-[-0.012em] text-white sm:text-4xl">
              {t("requirements.title")}
            </h2>
            <p className="mt-2 text-[12px] font-medium leading-[1.45] text-white/65 sm:mt-3 sm:text-[15px]">{t("requirements.subtitle")}</p>
          </div>

          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] sm:h-20 sm:w-20 sm:rounded-2xl">
            <img
              src={SYSTEM_REQUIREMENTS_IMAGE}
              alt="Nébula"
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 md:p-8">
        <div className="flex items-center gap-2">
          <WindowsMark />
          <span className="font-fortnite-exact-readable text-[13px] uppercase tracking-[0.035em] text-white sm:text-base">{t("requirements.windows")}</span>
          <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-1 text-xs font-medium text-emerald-300 sm:inline-flex">
            <ShieldCheck className="h-3 w-3" />
            {t("requirements.official")}
          </span>
        </div>

        <div className="mt-4 grid gap-3">
          {rows.map(({ icon: Icon, labelKey, textKey }) => (
            <article
              key={labelKey}
              className="group flex gap-3 rounded-xl border border-white/[0.07] bg-[#0c0c0d] p-3 transition hover:border-white/[0.13] hover:bg-[#0f0f10] sm:items-center sm:rounded-2xl sm:p-4"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.035] text-primary sm:h-10 sm:w-10 sm:rounded-xl">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.065em] text-muted-foreground sm:text-xs">{t(labelKey)}</span>
                <p className="break-words text-[12px] font-medium leading-5 text-white/82 sm:text-[15px] sm:leading-6">{t(textKey)}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
