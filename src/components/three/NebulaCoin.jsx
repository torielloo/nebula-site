import React from "react";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";

const LOGO_URL =
  "https://media.base44.com/images/public/6aa87196309472108abb65fb/8eaf849a6_NEBULAV2.png";

/** Logo Nébula em composição estática, sem rotação ou flutuação. */
export default function NebulaCoin({ className = "h-20 w-20" }) {
  return (
    <div className={cn("relative", className)}>
      <Image
        src={LOGO_URL}
        alt="Logo Nébula OS"
        fittingType="fit"
        className="h-full w-full object-contain"
      />
    </div>
  );
}
