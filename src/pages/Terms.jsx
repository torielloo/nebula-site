import React from "react";
import { ArrowLeft, ArrowUp, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";

const sections = [
  { title: "terms.s1.title", paragraphs: ["terms.s1.p1", "terms.s1.p2"] },
  { title: "terms.s2.title", paragraphs: ["terms.s2.p1"] },
  { title: "terms.s3.title", paragraphs: ["terms.s3.p1"], bullets: ["terms.s3.b1", "terms.s3.b2", "terms.s3.b3"] },
  { title: "terms.s4.title", paragraphs: ["terms.s4.p1"], bullets: ["terms.s4.b1", "terms.s4.b2", "terms.s4.b3"] },
  { title: "terms.s5.title", paragraphs: ["terms.s5.p1", "terms.s5.p2", "terms.s5.p3"] },
  { title: "terms.s6.title", paragraphs: ["terms.s6.p1", "terms.s6.p2"], bullets: ["terms.s6.b1", "terms.s6.b2", "terms.s6.b3", "terms.s6.b4"] },
  { title: "terms.s7.title", paragraphs: ["terms.s7.p1"], bullets: ["terms.s7.b1", "terms.s7.b2", "terms.s7.b3", "terms.s7.b4"], after: ["terms.s7.after"] },
  { title: "terms.s8.title", paragraphs: ["terms.s8.p1"], bullets: ["terms.s8.b1", "terms.s8.b2", "terms.s8.b3", "terms.s8.b4"], after: ["terms.s8.after"] },
  { title: "terms.s9.title", paragraphs: ["terms.s9.p1"] },
  { title: "terms.s10.title", paragraphs: ["terms.s10.p1"], bullets: ["terms.s10.b1", "terms.s10.b2", "terms.s10.b3", "terms.s10.b4", "terms.s10.b5"] },
  { title: "terms.s11.title", paragraphs: ["terms.s11.p1"] },
];

export default function Terms() {
  const { t } = useI18n();
  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <div id="terms-top" className="min-h-screen bg-[#07080b] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-10%,hsl(var(--primary)/0.10),transparent_32rem),linear-gradient(180deg,#0a0b0f_0%,#07080b_60%,#050506_100%)]" />

      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#07080b]/88 backdrop-blur-2xl">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-bold text-white/65 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            {t("terms.back")}
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.035] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/55">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              {t("terms.legal")}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="border-b border-white/[0.08] pb-8 sm:pb-10">
          <h1 className="font-fortnite text-5xl uppercase leading-none tracking-[0.02em] text-white sm:text-6xl md:text-7xl">
            {t("terms.title")}
          </h1>

          <div className="mt-5 space-y-1 text-sm leading-7 text-white/70">
            <p><span className="text-primary">{t("terms.last_update_label")}</span> <strong className="text-white">{t("terms.date")}</strong></p>
            <p><span className="text-primary">{t("terms.effective_label")}</span> <strong className="text-white">{t("terms.date")}</strong></p>
          </div>

          <p className="mt-6 max-w-4xl text-sm leading-7 text-white/80">
            {t("terms.intro")}
          </p>

          <div className="mt-6 rounded-2xl border border-white/[0.10] bg-white/[0.035] p-4 sm:p-5">
            <p className="text-sm font-black text-white">{t("terms.purchase_notice")}</p>
            <p className="mt-2 text-sm leading-7 text-white/78">
              <strong className="text-white">{t("terms.purchase_notice_bold")}</strong>{" "}
              {t("terms.purchase_notice_tail")}
            </p>
          </div>
        </section>

        <div className="divide-y divide-white/[0.065]">
          {sections.map((section) => (
            <section key={section.title} className="py-7 sm:py-8">
              <h2 className="font-fortnite text-2xl uppercase tracking-wide text-white sm:text-3xl">{t(section.title)}</h2>

              {section.paragraphs?.map((key) => (
                <p key={key} className="mt-4 text-sm leading-7 text-white/78">
                  {t(key)}
                </p>
              ))}

              {section.bullets && (
                <ul className="mt-4 space-y-2 pl-5 text-sm leading-6 text-white/78">
                  {section.bullets.map((key) => (
                    <li key={key} className="list-disc pl-1 marker:text-white/65">
                      {t(key)}
                    </li>
                  ))}
                </ul>
              )}

              {section.after?.map((key) => (
                <p key={key} className="mt-5 text-sm leading-7 text-white/78">
                  {t(key)}
                </p>
              ))}
            </section>
          ))}
        </div>

        <footer className="mt-3 flex flex-col gap-4 border-t border-white/[0.08] py-8 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <span>{t("terms.footer")}</span>
          <button
            type="button"
            onClick={scrollTop}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.035] px-4 py-2 font-bold text-white transition hover:bg-white/[0.07]"
          >
            {t("terms.top")}
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </footer>
      </main>
    </div>
  );
}
