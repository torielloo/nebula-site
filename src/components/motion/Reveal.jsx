import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Reveal suave ao entrar na viewport (fade + deslize). */
export default function Reveal({ children, delay = 0, y = 22, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}