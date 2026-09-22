import React from "react";
import { motion } from "framer-motion";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";
import { NEBULA_LOGO_URL } from "@/lib/brandAssets";

const PARTICLES = [
  [8, 18, 1.4, 0.22], [88, 22, 1, 0.16], [18, 78, 1, 0.18], [82, 72, 1.4, 0.2],
  [48, 4, 1, 0.16], [96, 52, 1, 0.14], [4, 54, 1, 0.14], [64, 92, 1, 0.14],
  [30, 10, 0.9, 0.13], [72, 10, 0.9, 0.12], [12, 44, 0.8, 0.12], [91, 84, 0.8, 0.11],
];

/** Logo oficial Nébula. `animated` é reservado para o pequeno destaque da Home. */
export default function NebulaLogo3D({ className = "h-40 w-40", animated = false }) {
  const logo = (
    <Image
      src={NEBULA_LOGO_URL}
      alt="Logo Nébula OS"
      fittingType="fit"
      className="h-full w-full [filter:drop-shadow(0_5px_10px_rgba(0,0,0,0.42))]"
    />
  );

  if (!animated) return <div className={className}>{logo}</div>;

  return (
    <div className={cn("relative", className)} style={{ perspective: 700 }}>
      {PARTICLES.map(([x, y, size, opacity], i) => (
        <motion.span
          key={i}
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-white"
          style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, opacity }}
          animate={{
            opacity: [opacity * 0.45, opacity, opacity * 0.45],
            x: [0, i % 2 === 0 ? 2 : -2, 0],
            y: [0, i % 3 === 0 ? -2 : 2, 0],
          }}
          transition={{ duration: 5.5 + i * 0.32, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      <motion.div
        className="relative z-10 h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: [0, 360] }}
        transition={{ duration: 52, repeat: Infinity, ease: "linear" }}
      >
        {logo}
      </motion.div>
    </div>
  );
}
