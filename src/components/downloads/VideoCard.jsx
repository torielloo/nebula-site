import React, { useState } from "react";
import { motion } from "framer-motion";
import { Play } from "lucide-react";

export default function VideoCard({ id, title, description, badge, index = 0 }) {
  const [playing, setPlaying] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="group overflow-hidden rounded-2xl border border-border/30 bg-card/40 shadow-[0_10px_36px_-18px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-colors duration-300 hover:border-primary/40"
    >
      <div className="relative aspect-video w-full bg-black">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button
            onClick={() => setPlaying(true)}
            className="absolute inset-0 grid h-full w-full place-items-center"
            aria-label={`Assistir: ${title}`}
          >
            <img
              src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
              alt={title}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-80 transition-all duration-500 group-hover:scale-[1.03] group-hover:opacity-60"
            />
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
            <span className="relative grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_30px_-4px_hsl(var(--primary)/0.7)] transition-transform duration-300 group-hover:scale-110">
              <Play className="ml-0.5 h-6 w-6 fill-current" />
            </span>
          </button>
        )}
      </div>
      <div className="p-4">
        {badge && (
          <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-primary">{badge}</p>
        )}
        <h3 className="mt-1 font-heading text-sm font-bold leading-snug">{title}</h3>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
    </motion.div>
  );
}