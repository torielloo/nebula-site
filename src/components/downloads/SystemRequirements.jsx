import React from "react";
import { Cpu, HardDrive, MemoryStick, Monitor, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";

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
            <div className="font-fortnite-exact-readable flex items-center gap-1.5 text-[10px] uppercase tracking-[0.035em] text-primary sm:gap-2 sm:text-[13px]">
              <Monitor className="h-3.5 w-3.5" />
              {t("requirements.kicker")}
            </div>
            <h2 className="font-fortnite-exact mt-2 text-2xl uppercase leading-[0.9] tracking-[-0.012em] text-white sm:text-4xl">
              {t("requirements.title")}
            </h2>
            <p className="font-fortnite-exact-readable mt-2 text-[12px] leading-[1.2] text-white/65 sm:mt-3 sm:text-[15px] sm:leading-[1.12]">{t("requirements.subtitle")}</p>
          </div>

          <div className="flex h-14 w-20 items-center justify-center overflow-hidden rounded-xl border border-white/[0.07] bg-[#e31f2b] shadow-[0_12px_30px_-18px_rgba(227,31,43,.55)] sm:h-20 sm:w-28 sm:rounded-2xl">
            <svg
              viewBox="0 0 120 84"
              aria-hidden="true"
              className="h-[48px] w-[66px] sm:h-[70px] sm:w-[96px]"
            >
              <g fill="none" stroke="#ffffff" strokeWidth="5.2" strokeLinecap="square" strokeLinejoin="miter">
                <path d="M18 13h84v50H18z" />
                <path d="M55 63v7" />
                <path d="M42 74h36" />
                <path d="M48 36h7" />
                <path d="M70 36h7" />
                <path d="M47 53c8-8 18-8 26 0" />
                <path d="M18 26l10 4-7 8" />
                <path d="M102 24l-10 5 7 8" />
                <path d="M30 14l7 7-4 8" />
                <path d="M92 14l-6 7 4 8" />
                <path d="M35 62l7-8" />
                <path d="M85 62l-7-8" />
              </g>
              <circle cx="21" cy="58" r="3.2" fill="#ffffff" />
            </svg>
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
