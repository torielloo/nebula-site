import React from "react";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";
import { NEBULA_LOGO_URL } from "@/lib/brandAssets";

/** Logo Nébula em composição estática, sem rotação ou flutuação. */
export default function NebulaCoin({ className = "h-20 w-20" }) {
  return (
    <div className={cn("relative", className)}>
      <Image
        src={NEBULA_LOGO_URL}
        alt="Logo Nébula OS"
        fittingType="fit"
        className="h-full w-full object-contain"
      />
    </div>
  );
}
