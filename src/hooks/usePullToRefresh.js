import { useEffect, useRef, useState } from "react";

const THRESHOLD = 64;

/**
 * Pull-to-refresh leve: detecta arraste de toque quando a página (ou o
 * container passado via ref) está no topo e dispara o refresh.
 */
export default function usePullToRefresh(onRefresh, containerRef = null) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const pullRef = useRef(0);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    const getScroller = () =>
      (containerRef && containerRef.current) || document.scrollingElement || document.documentElement;

    const onTouchStart = (e) => {
      startY.current = getScroller().scrollTop <= 0 && !refreshing ? e.touches[0].clientY : null;
      pullRef.current = 0;
    };

    const onTouchMove = (e) => {
      if (startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && getScroller().scrollTop <= 0) {
        const next = Math.min(delta * 0.45, 80);
        pullRef.current = next;
        setPull(next);
      } else if (delta <= 0) {
        pullRef.current = 0;
        setPull(0);
      }
    };

    const onTouchEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      const reached = pullRef.current >= THRESHOLD;
      pullRef.current = 0;
      setPull(0);
      if (reached && !refreshing) {
        setRefreshing(true);
        Promise.resolve(cb.current && cb.current())
          .catch(() => {})
          .finally(() => setRefreshing(false));
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [refreshing, containerRef]);

  return { pull, refreshing };
}