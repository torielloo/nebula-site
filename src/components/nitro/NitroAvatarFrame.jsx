import React from "react";
import { cn } from "@/lib/utils";

export const NITRO_FRAME_OPTIONS = [
  { value: "", label: "Sem moldura", hint: "Visual limpo" },
  { value: "neon", label: "Neon", hint: "Brilho contínuo" },
  { value: "gold", label: "Gold", hint: "Dourado premium" },
  { value: "aurora", label: "Aurora", hint: "Ciano suave" },
  { value: "fire", label: "Fire", hint: "Chamas quentes" },
  { value: "galaxy", label: "Galaxy", hint: "Violeta espacial" },
  { value: "electric", label: "Electric", hint: "Pulso azul" },
  { value: "diamond", label: "Diamond", hint: "Cristal gelado" },
  { value: "inferno", label: "Inferno X", hint: "Anel em rotação" },
  { value: "cosmos", label: "Cosmos", hint: "Nebulosa orbital" },
  { value: "plasma", label: "Plasma", hint: "Energia líquida" },
  { value: "prism", label: "Prism", hint: "RGB holográfico" },
  { value: "void", label: "Void", hint: "Pulso escuro" },
  { value: "orbit", label: "Orbit", hint: "Satélites animados" },
  { value: "custom", label: "Importada", hint: "PNG/GIF/WEBP próprio" },
];

export default function NitroAvatarFrame({
  children,
  frame = "",
  customFrameUrl = "",
  className = "",
  innerClassName = "",
}) {
  return (
    <div className={cn("nitro-avatar-frame relative inline-grid h-fit w-fit place-items-center align-top leading-none", frame && `nitro-frame-${frame}`, className)}>
      <div className={cn("relative z-[2] overflow-hidden rounded-full", innerClassName)}>{children}</div>
      {frame === "custom" && customFrameUrl ? (
        <img
          src={customFrameUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[16%] z-[4] h-[132%] w-[132%] select-none object-contain"
        />
      ) : null}
      {frame === "orbit" ? (
        <>
          <span className="nitro-orbit-dot nitro-orbit-dot-a" />
          <span className="nitro-orbit-dot nitro-orbit-dot-b" />
        </>
      ) : null}
    </div>
  );
}
