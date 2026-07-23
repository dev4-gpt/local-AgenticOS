import { useEffect, useRef, useState } from "react";

/**
 * Continuous 0..1 scroll progress through a tall region: 0 when the region's
 * top reaches the top of the viewport, 1 when its bottom does. Pair with a
 * `position: sticky` child to drive scroll-scrubbed motion across the whole
 * pinned journey (the region's height beyond one viewport IS the scrubbable
 * distance).
 *
 * The value is lerped toward the raw scroll-derived target each frame so
 * motion glides on discrete/high-delta wheel input rather than snapping.
 * When the visitor prefers reduced motion the value tracks scroll exactly
 * with no smoothing, and callers should also disable any decorative motion
 * the progress drives.
 */
export function useScrollProgress<T extends HTMLElement>(reduced: boolean) {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
  const target = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const compute = () => {
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      target.current = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
    };
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);

    let raf = 0;
    const tick = () => {
      setProgress((prev) => {
        if (reduced) return target.current;
        const diff = target.current - prev;
        if (Math.abs(diff) < 0.0004) return target.current;
        return prev + diff * 0.12;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return { ref, progress };
}
