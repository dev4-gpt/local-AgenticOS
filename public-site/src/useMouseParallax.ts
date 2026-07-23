import { useEffect, useRef, useState } from "react";

/**
 * Cursor-driven depth parallax: tracks the pointer relative to a container's
 * centre and returns normalized offsets in [-1, 1] on each axis, lerped so
 * layers ease toward the cursor instead of snapping. Layers multiply the
 * offset by their own depth factor (small for background, larger and often
 * opposite-signed for foreground) to separate in depth as the cursor moves.
 *
 * Fully disabled under prefers-reduced-motion — the offset stays at the
 * origin, so the scene is completely still for those visitors.
 */
export function useMouseParallax<T extends HTMLElement>(reduced: boolean) {
  const ref = useRef<T>(null);
  const target = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;

    const onMove = (event: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      target.current = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    };
    const onLeave = () => {
      target.current = { x: 0, y: 0 };
    };

    let raf = 0;
    const tick = () => {
      setOffset((prev) => {
        const dx = target.current.x - prev.x;
        const dy = target.current.y - prev.y;
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return prev;
        return { x: prev.x + dx * 0.08, y: prev.y + dy * 0.08 };
      });
      raf = requestAnimationFrame(tick);
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return { ref, offset };
}
