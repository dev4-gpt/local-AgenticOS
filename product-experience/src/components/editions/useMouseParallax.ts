"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks cursor position relative to a container's center and returns
 * normalized offsets in [-1, 1] on each axis, smoothed with a simple lerp so
 * layers ease toward the cursor instead of snapping. Mirrors the live site's
 * mouse-driven depth parallax on its Three.js hero/chapter scenes (moving
 * the cursor shifts foreground/background layers at different rates even
 * with no scrolling — see docs/research/www.shopify.com/BEHAVIORS.md).
 */
export function useMouseParallax<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const target = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      target.current = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    }
    function onLeave() {
      target.current = { x: 0, y: 0 };
    }

    let raf = 0;
    function tick() {
      setOffset((prev) => {
        const dx = target.current.x - prev.x;
        const dy = target.current.y - prev.y;
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return prev;
        return { x: prev.x + dx * 0.08, y: prev.y + dy * 0.08 };
      });
      raf = requestAnimationFrame(tick);
    }

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return { ref, offset };
}
