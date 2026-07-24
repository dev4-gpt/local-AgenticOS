"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks scroll progress through a tall "scroll-jack" wrapper element as a
 * value in [0, 1]: 0 when the wrapper's top just reaches the top of the
 * viewport, 1 when its bottom does. Pair with a `position: sticky` child
 * pinned to `top: 0` inside the wrapper to drive scroll-scrubbed animation
 * (the wrapper's extra height beyond one viewport IS the scrollable
 * distance the animation plays over).
 *
 * The returned `progress` is lerped toward the raw scroll-derived value
 * every frame (same technique as useMouseParallax) rather than snapping
 * instantly on each scroll event, so scroll-driven motion feels smooth
 * even on discrete/high-delta wheel input, similar to the live site's
 * Lenis-smoothed scroll signal.
 *
 * Gated behind an IntersectionObserver so the scroll listener and rAF loop
 * only run while the wrapper is near the viewport — cheap to use many of
 * on one page.
 */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
  const targetProgress = useRef(0);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      rootMargin: "100% 0px 100% 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;

    function computeTarget() {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const scrolled = -rect.top;
      targetProgress.current = Math.min(1, Math.max(0, total > 0 ? scrolled / total : 0));
    }

    computeTarget();
    window.addEventListener("scroll", computeTarget, { passive: true });

    let raf = 0;
    function tick() {
      setProgress((prev) => {
        const diff = targetProgress.current - prev;
        if (Math.abs(diff) < 0.0005) return targetProgress.current;
        return prev + diff * 0.12;
      });
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("scroll", computeTarget);
      cancelAnimationFrame(raf);
    };
  }, [near]);

  return { ref, progress };
}
