import React from "react";
import { Image } from "@/components/ui/image";
import { NEBULA_LOGO_URL, NEBULA_WALLPAPER_URL } from "@/lib/brandAssets";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <img src={NEBULA_WALLPAPER_URL} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.30]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/45 via-background/75 to-background" />
      <div className="pointer-events-none absolute left-1/2 top-[-18rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-white/[0.018] blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="relative mx-auto mb-4 h-16 w-28 sm:h-20 sm:w-36">
            <Image
              src={NEBULA_LOGO_URL}
              alt="Nébula OS"
              fittingType="fit"
              className="h-full w-full object-contain"
            />
          </div>
          {Icon && (
            <span className="mx-auto mb-3 grid h-9 w-9 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="rounded-3xl border border-white/[0.08] bg-card/80 p-6 shadow-[0_24px_70px_-34px_rgba(0,0,0,0.95)] backdrop-blur-xl sm:p-8">
          {children}
        </div>
        {footer && (
          <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
        )}
      </div>
    </div>
  );
}