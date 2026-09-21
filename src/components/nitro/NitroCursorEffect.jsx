import { useEffect } from "react";

const COLORS = {
  spark: ["#ffffff", "#fbbf24"],
  nebula: ["#8b5cf6", "#06b6d4"],
  prism: ["#ef4444", "#f59e0b", "#22c55e", "#06b6d4", "#8b5cf6", "#ec4899"],
};

export default function NitroCursorEffect({ effect = "none" }) {
  useEffect(() => {
    if (!effect || effect === "none" || typeof window === "undefined") return undefined;
    if (window.matchMedia?.("(pointer: coarse)")?.matches) return undefined;

    const colors = COLORS[effect] || COLORS.spark;
    let last = 0;
    let index = 0;

    const move = (event) => {
      const now = performance.now();
      if (now - last < 42) return;
      last = now;

      const dot = document.createElement("span");
      dot.className = "nitro-cursor-particle";
      const color = colors[index % colors.length];
      index += 1;
      dot.style.left = `${event.clientX}px`;
      dot.style.top = `${event.clientY}px`;
      dot.style.background = color;
      dot.style.boxShadow = `0 0 10px ${color}`;
      dot.style.setProperty("--nx", `${(index % 3) * 5 - 5}px`);
      dot.style.setProperty("--ny", `${-10 - (index % 4) * 4}px`);
      document.body.appendChild(dot);
      window.setTimeout(() => dot.remove(), 650);
    };

    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [effect]);

  return null;
}
