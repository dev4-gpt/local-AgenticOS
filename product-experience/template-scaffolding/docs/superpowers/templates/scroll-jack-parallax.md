# Scroll-Jack + Cursor-Parallax Template

A copy-pasteable pattern for a "pin the background, animate it as the user
scrolls past" section — the technique behind this project's hero and chapter
intros. Two hooks, zero animation-library dependencies, works with plain CSS
transforms.

**Requirements:** React 18+ (hooks: `useState`, `useEffect`, `useRef`). The
worked example below uses plain inline `style` objects, not Tailwind — copy
it as-is into any React project, or translate to Tailwind classes if that's
your project's convention (`position: sticky; top: 0; height: 100vh` ==
`sticky top-0 h-screen`). It also doesn't depend on `next/image` or any
other framework-specific component — swap the `{/* your layer's content
*/}` placeholder for a plain `<img>`, `next/image`, or any element you like.

## 1. `useScrollProgress` — ties an animation to how far the user has
   scrolled through a tall wrapper

```ts
"use client"; // remove this line outside Next.js App Router

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
```

**Reading a value right after `scrollTo()`:** because `progress` is lerped,
it will lag slightly behind the true scroll position for a few frames after
any sudden jump (roughly 500ms-1s to settle within 0.05% of the target at
the `0.12`/frame rate above). This is the intended smoothing effect, not a
bug — if you're testing/debugging a specific checkpoint value, wait for it
to settle before asserting on it.

## 2. `useMouseParallax` — shifts layers toward the cursor, independent of
   scroll

```ts
"use client"; // remove this line outside Next.js App Router

import { useEffect, useRef, useState } from "react";

/**
 * Tracks cursor position relative to a container's center and returns
 * normalized offsets in [-1, 1] on each axis, smoothed with a simple lerp so
 * layers ease toward the cursor instead of snapping.
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
```

## 3. Worked example — combining both

```tsx
"use client";

import { useScrollProgress } from "./useScrollProgress";
import { useMouseParallax } from "./useMouseParallax";

export function MySection() {
  // wrapperRef goes on the OUTER tall element; its height minus one
  // viewport IS the scroll distance the animation plays over.
  const { ref: wrapperRef, progress } = useScrollProgress<HTMLElement>();
  // parallaxRef goes on the INNER pinned panel — the thing the mouse
  // actually moves over.
  const { ref: parallaxRef, offset } = useMouseParallax<HTMLDivElement>();

  // Example: a layer that scales up over the first half of the scroll,
  // then fades out over the second half. Adjust thresholds/multipliers to
  // taste — these are just illustrative numbers, not fixed constants.
  const growT = Math.min(1, progress / 0.5);
  const fadeT = Math.max(0, (progress - 0.5) / 0.5);

  return (
    // Total height = (content you want visible while pinned, usually
    // 100vh) + (however much scroll distance you want the animation to
    // play over). 220vh total (120vh of actual scroll distance at a
    // 100vh viewport) reads as a substantial but not sluggish transition
    // — that's the value used throughout this project.
    <section ref={wrapperRef} style={{ height: "220vh", position: "relative" }}>
      <div
        ref={parallaxRef}
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            transform: `scale(${1 + growT}) translate(${offset.x * 20}px, ${offset.y * 20}px)`,
            opacity: 1 - fadeT,
            transition: "transform 100ms ease-out",
          }}
        >
          {/* your layer's content */}
        </div>
      </div>
    </section>
  );
}
```

## Adapting this to a new section

- **Wrapper height** controls how much scroll distance the animation gets.
  `220vh` (120vh of actual scroll room past the first viewport) is a good
  default; shorter (`~140vh`) reads as punchier, longer (`~320vh`) reads as
  more cinematic.
- **Progress thresholds** (the `0.5` in the example) carve the `[0,1]` range
  into stages — a "hold" at the start where nothing moves yet, an
  "animate" range, an "exit" range. Each stage's own local progress is
  `Math.min(1, Math.max(0, (progress - stageStart) / (stageEnd - stageStart)))`
  — this clamped-linear-interpolation pattern is reused for every stage.
- **Parallax strength** is the multiplier on `offset.x`/`offset.y`
  (`* 20` in the example above) — background layers should use a small
  multiplier, foreground layers a larger (and often opposite-signed) one,
  so they visually separate in depth as the cursor moves.
- **Multiple pinned sections on one page:** each one calls its own
  `useScrollProgress`/`useMouseParallax` independently — the
  `IntersectionObserver` gating in `useScrollProgress` means only the
  section(s) actually near the viewport run their scroll listener, so this
  scales to many sections on one long page without jank (verified on a
  12-section page in the project this was extracted from).
- **Smoothing rate** is the `0.12` multiplier inside `useScrollProgress`'s
  `tick()` (and `0.08` in `useMouseParallax`'s) — the fraction of the
  remaining distance to `targetProgress`/`target` closed each frame. Higher
  (e.g. `0.2`) feels snappier and more directly tied to the scrollbar;
  lower (e.g. `0.06`) feels heavier and more cinematic, at the cost of
  visibly lagging behind fast scroll input. `0.12` for scroll and `0.08`
  for mouse (slightly heavier, since cursor movement is finer-grained than
  a scroll gesture) is a reasonable starting split.
