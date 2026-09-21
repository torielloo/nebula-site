import React from "react";
import { Image } from "@/components/ui/image";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute left-1/2 top-[-18rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="nebula-glow-sm relative mx-auto mb-4 h-16 w-16 overflow-hidden rounded-full border border-white/10 bg-card">
            <Image
              src="/nebula-logo-fixed-v3.png"
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
        <div className="rounded-3xl border border-border/50 bg-card/75 p-6 shadow-[0_24px_70px_-34px_rgba(0,0,0,0.95)] backdrop-blur-xl sm:p-8">
          {children}
        </div>
        {footer && (
          <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
        )}
      </div>
    </div>
  );
}