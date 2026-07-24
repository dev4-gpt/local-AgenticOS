# Hero "Big Bang" Opening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static hero into a scroll-scrubbed "big bang" that explodes the construction-line diagram and title outward while zooming through into Sidekick's chapter-intro painting, plus a distinct gold-monospace treatment for "ai" — then extract the reusable scroll-jack + parallax pattern as a portable template.

**Architecture:** Restructure `HeroSection` from a flat `100vh` section into the same tall-wrapper + `position: sticky` scroll-jack pattern `ChapterIntro` already uses, driving lines/title/painting transforms off a `[0,1]` scroll-progress value. First extract that progress-tracking logic (currently duplicated only in `ChapterIntro`) into a shared `useScrollProgress` hook so both components use one implementation.

**Tech Stack:** Next.js 16 (App Router), React 19 + TypeScript strict, Tailwind CSS v4, `next/image`. No animation library — plain CSS transforms driven by React state, matching the rest of `src/components/editions/`. No test framework is configured in this repo (`package.json` has `dev`/`build`/`lint`/`typecheck` only, no `test` script) — verification in every task below is `tsc --noEmit` + a scripted browser check of computed style values at specific scroll/mouse positions, the same method used to verify `ChapterIntro` and `useMouseParallax` earlier in this project.

## Global Constraints

- No new npm dependencies (spec section 2, "Out of scope": "No new animation library").
- `ChapterIntro.tsx`, `ChapterSection.tsx`, `DavinciLines.tsx`, `useMouseParallax.ts`, and `src/data/paintings.ts` are **not modified** for behavior — only `ChapterIntro.tsx`'s progress-tracking is refactored to call the new shared hook, with no change to its rendered output or timing (spec section 4).
- Font swap uses Tailwind's built-in `font-mono` stack — no new font loaded (spec section 1).
- Hero's scroll distance is `220vh` (matching every `ChapterIntro`), on a `320vh` total wrapper (`100vh` hold + `220vh` scrollable) (spec section 2).
- Every color/number below is copied verbatim from the approved spec (`docs/superpowers/specs/2026-07-22-hero-bigbang-design.md`) — do not invent new values.

---

### Task 1: Extract `useScrollProgress` hook, refactor `ChapterIntro` to use it

**Files:**
- Create: `src/components/editions/useScrollProgress.ts`
- Modify: `src/components/editions/ChapterIntro.tsx:1-60`

**Interfaces:**
- Produces: `useScrollProgress<T extends HTMLElement>(): { ref: React.RefObject<T | null>, progress: number }` — a `[0,1]` value, `0` when the referenced element's top reaches the viewport top, `1` when its bottom does (i.e. `progress = clamp((-rect.top) / (rect.height - innerHeight), 0, 1)`). Gated behind an `IntersectionObserver` (`rootMargin: "100% 0px 100% 0px"`) so the scroll listener only runs while the element is within one viewport-height of the visible area.
- Consumed by: Task 3/4 (`HeroSection`) and this task's refactor of `ChapterIntro`.

- [ ] **Step 1: Create the hook**

Write `src/components/editions/useScrollProgress.ts`:

```ts
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
 * Gated behind an IntersectionObserver so the scroll listener only runs
 * while the wrapper is near the viewport — cheap to use many of on one page.
 */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
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
    let raf = 0;
    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const total = rect.height - window.innerHeight;
        const scrolled = -rect.top;
        setProgress(Math.min(1, Math.max(0, total > 0 ? scrolled / total : 0)));
      });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [near]);

  return { ref, progress };
}
```

This is the exact logic currently duplicated inline in `ChapterIntro.tsx` (its `wrapperRef`/`near`/`progress` state and two `useEffect`s), extracted verbatim and generalized to a hook.

- [ ] **Step 2: Refactor `ChapterIntro.tsx` to use the hook**

Replace lines 1-60 of `src/components/editions/ChapterIntro.tsx` (imports through the end of the second `useEffect`) with:

```tsx
"use client";

import Image from "next/image";
import type { Chapter } from "@/types/editions";
import { paintingFor } from "@/data/paintings";
import { cn } from "@/lib/utils";
import { useMouseParallax } from "./useMouseParallax";
import { useScrollProgress } from "./useScrollProgress";

/**
 * Pinned, full-viewport chapter-opening moment: a painting background stays
 * sticky while the chapter title and a couple of floating product cards
 * animate in as the user scrolls through a tall wrapper region, then the
 * whole thing fades/scales out to release into the normal feature grid.
 * Mirrors the live site's per-chapter Three.js title-card sequence (see
 * docs/research/www.shopify.com/BEHAVIORS.md) using CSS/JS instead of WebGL.
 */
export function ChapterIntro({ chapter }: { chapter: Chapter }) {
  const { ref: wrapperRef, progress } = useScrollProgress<HTMLDivElement>();
  const { ref: parallaxRef, offset } = useMouseParallax<HTMLDivElement>();
  const painting = paintingFor(chapter.slug);
  const floatingCards = chapter.items.filter((i) => i.imgSrc).slice(0, 3);

  // Title/cards fade+rise in over the first 35%, hold, then the whole panel
  // fades+scales out over the final 25% to release into the grid below.
  const enter = Math.min(1, progress / 0.35);
  const exit = Math.max(0, (progress - 0.75) / 0.25);
```

Leave everything from the `return (` statement onward (the JSX) exactly as it is — this refactor only changes how `wrapperRef`/`progress` are obtained, not what's rendered.

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no output (clean pass). If `useEffect`/`useState`/`useRef` show as unused-import errors in `ChapterIntro.tsx`, confirm they were fully removed from the top import line (they're no longer used anywhere else in the file).

- [ ] **Step 4: Verify no behavior change in the browser**

With the dev server running (`npm run dev`), navigate to the page, then run in the browser console:

```js
window.scrollTo(0, 1300);
await new Promise(r => setTimeout(r, 200));
const img = document.querySelector('#sidekick .theme-dark-region img');
JSON.stringify({ opacity: getComputedStyle(img).opacity, transform: getComputedStyle(img).transform });
```

Expected: `opacity` is `"0.85"` and `transform` contains `matrix(1.0459...` (scale ≈ `1 + 0.370*0.08+0.03` ≈ `1.0596`, wrapped in the matrix — exact matrix values only need to be non-identity and consistent with the pre-refactor behavior verified earlier in this project; the key check is that the page still renders and animates, not an exact string match).

- [ ] **Step 5: Commit**

```bash
git add src/components/editions/useScrollProgress.ts src/components/editions/ChapterIntro.tsx
git commit -m "Extract useScrollProgress hook from ChapterIntro for reuse in HeroSection"
```

---

### Task 2: Font treatment for "ai"

**Files:**
- Modify: `src/components/editions/HeroSection.tsx:14` (the `<span>` wrapping "ai")

**Interfaces:**
- Consumes: nothing new.
- Produces: no interface change — purely visual.

- [ ] **Step 1: Update the span**

In `src/components/editions/HeroSection.tsx`, change:

```tsx
          Ren<span className="not-italic font-sans font-light">ai</span>ssance
```

to:

```tsx
          Ren
          <span className="not-italic font-mono font-bold" style={{ color: "#c9a24d" }}>
            ai
          </span>
          ssance
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Verify in the browser**

```js
const span = [...document.querySelectorAll('#hero span')].find(s => s.textContent === 'ai');
JSON.stringify({ color: getComputedStyle(span).color, fontWeight: getComputedStyle(span).fontWeight, fontStyle: getComputedStyle(span).fontStyle });
```

Expected: `color` is `"rgb(201, 162, 77)"` (the RGB form of `#c9a24d`), `fontWeight` is `"700"`, `fontStyle` is `"normal"`.

- [ ] **Step 4: Commit**

```bash
git add src/components/editions/HeroSection.tsx
git commit -m "Give ai a distinct bold monospace gold treatment in the hero title"
```

---

### Task 3: Restructure HeroSection into a scroll-jack scaffold

**Files:**
- Modify: `src/components/editions/HeroSection.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useScrollProgress<HTMLElement>()` from Task 1, `useMouseParallax<HTMLDivElement>()` (existing, unchanged), `DavinciLines` (existing, unchanged, still takes `stage: number`).
- Produces: `HeroSection` now renders a `320vh` wrapper with a pinned `100vh` sticky panel inside it — same shape `ChapterIntro` uses — but with no progress-driven choreography yet (that's Task 4). This task's job is to get the pinning/layout right in isolation before adding animation math on top.

- [ ] **Step 1: Rewrite the component**

Replace the full contents of `src/components/editions/HeroSection.tsx` with:

```tsx
"use client";

import { DavinciLines } from "./DavinciLines";
import { useMouseParallax } from "./useMouseParallax";
import { useScrollProgress } from "./useScrollProgress";

export function HeroSection() {
  const { ref: wrapperRef } = useScrollProgress<HTMLElement>();
  const { ref: parallaxRef, offset } = useMouseParallax<HTMLDivElement>();

  return (
    <section ref={wrapperRef} id="hero" className="relative h-[320vh]">
      <div
        ref={parallaxRef}
        className="theme-dark-region sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden bg-black text-white"
      >
        <div
          style={{ transform: `translate(${offset.x * 14}px, ${offset.y * 14}px)` }}
          className="absolute inset-0 transition-transform duration-100 ease-out"
        >
          <DavinciLines stage={1} />
        </div>
        <div
          style={{ transform: `translate(${offset.x * -28}px, ${offset.y * -28}px)` }}
          className="relative z-10 flex h-[560px] w-[380px] max-w-[85vw] flex-col items-start justify-center border border-white/20 px-10 transition-transform duration-100 ease-out"
        >
          <h1 className="font-display text-[56px] leading-[0.95] italic sm:text-[72px]">
            The
            <br />
            Ren
            <span className="not-italic font-mono font-bold" style={{ color: "#c9a24d" }}>
              ai
            </span>
            ssance
            <br />
            Edition
          </h1>
        </div>
      </div>
    </section>
  );
}
```

This is identical in visual output to the pre-Task-3 hero (same parallax, same font treatment from Task 2) — the only change is that the outer element is now `320vh` tall with a `sticky top-0 h-screen` inner panel instead of a flat `min-h-[100svh]` section. Scrolling should now show the title/lines pinned in place for `220vh` of extra scroll before the next section (Sidekick's chapter intro) appears.

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Verify pinning in the browser**

```js
window.scrollTo(0, 0);
await new Promise(r => setTimeout(r, 100));
const before = document.querySelector('#hero .theme-dark-region').getBoundingClientRect();
window.scrollTo(0, 1000);
await new Promise(r => setTimeout(r, 100));
const after = document.querySelector('#hero .theme-dark-region').getBoundingClientRect();
JSON.stringify({ before: { top: before.top, height: before.height }, after: { top: after.top, height: after.height } });
```

Expected: `before.top` is `0`, `after.top` is also `0` (the sticky panel stays pinned at the top of the viewport regardless of scroll position within the wrapper), and `before.height === after.height` (both equal `window.innerHeight`).

Also verify the wrapper is genuinely `320vh`:

```js
JSON.stringify({ wrapperHeight: document.getElementById('hero').getBoundingClientRect().height, viewport: window.innerHeight });
```

Expected: `wrapperHeight` ≈ `viewport * 3.2` (within a few pixels, since `vh` unit rounding).

- [ ] **Step 4: Commit**

```bash
git add src/components/editions/HeroSection.tsx
git commit -m "Restructure hero into a scroll-jack scaffold matching ChapterIntro"
```

---

### Task 4: Add explosion + reveal choreography

**Files:**
- Modify: `src/components/editions/HeroSection.tsx` (full rewrite)

**Interfaces:**
- Consumes: `progress` returned from `useScrollProgress` (added back in this task — Task 3 destructured only `ref`), `paintingFor` from `@/data/paintings` (existing, unchanged), `next/image`'s `Image` (already used elsewhere in this codebase, e.g. `ChapterIntro.tsx`).
- Produces: final `HeroSection` — the complete, spec-compliant component. Nothing downstream consumes new exports from this file; `ChapterSection`/`ChapterIntro` are unaffected since the spec explicitly keeps the hero → Sidekick handoff uncoordinated (two independent components that happen to show the same image).

- [ ] **Step 1: Rewrite the component with full choreography**

Replace the full contents of `src/components/editions/HeroSection.tsx` with:

```tsx
"use client";

import Image from "next/image";
import { DavinciLines } from "./DavinciLines";
import { useMouseParallax } from "./useMouseParallax";
import { useScrollProgress } from "./useScrollProgress";
import { paintingFor } from "@/data/paintings";

const HOLD_END = 0.15;
const EXPLOSION_END = 0.6;
const REVEAL_START = 0.4;

export function HeroSection() {
  const { ref: wrapperRef, progress } = useScrollProgress<HTMLElement>();
  const { ref: parallaxRef, offset } = useMouseParallax<HTMLDivElement>();
  const painting = paintingFor("sidekick");

  // 0.00–0.15: hold (formulas below evaluate to their rest state here).
  // 0.15–0.60: explosion — lines/title scale up, title fades out.
  const explosionT = Math.min(1, Math.max(0, (progress - HOLD_END) / (EXPLOSION_END - HOLD_END)));
  const linesScale = 1 + explosionT * 3; // 1x -> 4x
  const titleScale = 1 + explosionT * 1.5; // 1x -> 2.5x
  const titleOpacity = 1 - explosionT; // 1 -> 0

  // 0.40–1.00: reveal — Sidekick's painting fades in and settles, overlapping
  // the tail of the explosion.
  const revealT = Math.min(1, Math.max(0, (progress - REVEAL_START) / (1 - REVEAL_START)));
  const paintingOpacity = revealT; // 0 -> 1
  const paintingScale = 1.3 - revealT * 0.3; // 1.3x -> 1x

  return (
    <section ref={wrapperRef} id="hero" className="relative h-[320vh]">
      <div
        ref={parallaxRef}
        className="theme-dark-region sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden bg-black text-white"
      >
        <div className="absolute inset-0">
          <Image
            src={painting.localPath}
            alt={`${painting.title} by ${painting.artist}`}
            fill
            sizes="100vw"
            className="object-cover"
            style={{
              opacity: paintingOpacity,
              transform: `scale(${paintingScale}) translate(${offset.x * 10}px, ${offset.y * 10}px)`,
            }}
            priority
            unoptimized
          />
        </div>

        <div
          className="absolute inset-0 transition-transform duration-100 ease-out"
          style={{
            transform: `scale(${linesScale}) translate(${offset.x * 14}px, ${offset.y * 14}px)`,
          }}
        >
          <DavinciLines stage={1} />
        </div>

        <div
          className="relative z-10 flex h-[560px] w-[380px] max-w-[85vw] flex-col items-start justify-center border border-white/20 px-10 transition-transform duration-100 ease-out"
          style={{
            opacity: titleOpacity,
            transform: `scale(${titleScale}) translate(${offset.x * -28}px, ${offset.y * -28}px)`,
          }}
        >
          <h1 className="font-display text-[56px] leading-[0.95] italic sm:text-[72px]">
            The
            <br />
            Ren
            <span className="not-italic font-mono font-bold" style={{ color: "#c9a24d" }}>
              ai
            </span>
            ssance
            <br />
            Edition
          </h1>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Verify choreography at each stage in the browser**

Run each block below in sequence (each does `window.scrollTo`, waits for the scroll listener's `requestAnimationFrame` to settle, then reads computed styles):

```js
async function checkAt(scrollY) {
  window.scrollTo(0, scrollY);
  await new Promise(r => setTimeout(r, 150));
  const lines = document.querySelector('#hero .absolute.inset-0.transition-transform');
  const title = document.querySelector('#hero h1').parentElement;
  const img = document.querySelector('#hero img');
  return {
    scrollY,
    linesTransform: getComputedStyle(lines).transform,
    titleOpacity: getComputedStyle(title).opacity,
    titleTransform: getComputedStyle(title).transform,
    imgOpacity: getComputedStyle(img).opacity,
  };
}
JSON.stringify(await checkAt(0));
```

Expected at `scrollY=0` (progress 0, hold phase): `titleOpacity` is `"1"`, `imgOpacity` is `"0"`, and the scale component of both transforms is `1` (matrix `a`/`d` values ≈ `1`, before any mouse-parallax translate is added).

```js
JSON.stringify(await checkAt(1188));
```

`1188` ≈ `0.6 * 1980` (at a `900px` viewport; adjust proportionally if testing at a different viewport height — the formula is `progress * (wrapperHeightPx - innerHeight)`). Expected at progress ≈ `0.6` (end of explosion): `titleOpacity` is `"0"`, and the transform matrices' scale component (`matrix(a, b, c, d, ...)` — `a`/`d`) are ≈ `4` for the lines layer and ≈ `2.5` for the title layer.

```js
JSON.stringify(await checkAt(1980));
```

Expected at `scrollY=1980` (progress 1, end of wrapper): `imgOpacity` is `"1"`, and the image transform's scale component is ≈ `1`.

- [ ] **Step 4: Verify the full production build still passes**

Run: `npm run build`
Expected: exits 0, ends with the `Route (app)` table and no error output (matches the clean builds already produced earlier in this project after the `unoptimized` image fixes).

- [ ] **Step 5: Commit**

```bash
git add src/components/editions/HeroSection.tsx
git commit -m "Add big-bang explosion and painting-reveal choreography to hero"
```

---

### Task 4b: Hero polish — title text, tagline, early painting visibility, seam continuity

> Added after Tasks 1-4 landed and were reviewed, based on re-studying the
> live site and the deployed result together. Not in the original spec —
> confirmed with the user before implementation. Supersedes the title JSX
> and painting-opacity/scale formulas from Task 4; everything else in
> `HeroSection.tsx` from Task 4 is unchanged.

**Files:**
- Modify: `src/components/editions/HeroSection.tsx` (full rewrite)

**Interfaces:** unchanged — still `HeroSection(): JSX.Element`, no new props, no new consumers.

**What's changing and why:**
1. **Title text** — "The Renaissance Edition" → "Renaissance" (drop "The" and "Edition", keep the gold-monospace "ai" treatment inside it). User's explicit request.
2. **Tagline** — add "A new world of commerce. 150+ product updates." below the title, inside the same title box (so it shares the box's opacity/scale/parallax transform). This text is copied verbatim from the live site's hero (confirmed via inspection on 2026-07-22).
3. **Early painting visibility** — the live site's hero shows a background painting faintly from the very start (progress 0), not only revealed at the end. Change `paintingOpacity` from `revealT` (0→1) to `PAINTING_BASE_OPACITY + revealT * (PAINTING_END_OPACITY - PAINTING_BASE_OPACITY)` with `PAINTING_BASE_OPACITY = 0.15`.
4. **Seam continuity fix** — Task 4's reveal ended at `paintingOpacity = 1` / `paintingScale = 1`, but `ChapterIntro.tsx`'s painting starts at `opacity: 0.85 - exit*0.85` (= `0.85` when `exit = 0`, i.e. at `ChapterIntro`'s own `progress = 0`) and `transform: scale(1 + progress*0.08 + 0.03)` (= `1.03` at `progress = 0`). That mismatch produces a visible jump exactly at the point the hero's `320vh` wrapper ends and Sidekick's own `ChapterIntro` begins. Change the reveal's target values to end at `PAINTING_END_OPACITY = 0.85` and `PAINTING_END_SCALE = 1.03` — the exact values `ChapterIntro` starts at — so the two independent components hand off with no visible discontinuity.

- [ ] **Step 1: Replace the full contents of `HeroSection.tsx`**

```tsx
"use client";

import Image from "next/image";
import { DavinciLines } from "./DavinciLines";
import { useMouseParallax } from "./useMouseParallax";
import { useScrollProgress } from "./useScrollProgress";
import { paintingFor } from "@/data/paintings";

const HOLD_END = 0.15;
const EXPLOSION_END = 0.6;
const REVEAL_START = 0.4;
const PAINTING_BASE_OPACITY = 0.15; // faintly visible behind the box from the very start
const PAINTING_END_OPACITY = 0.85; // matches ChapterIntro's own painting opacity at its progress=0
const PAINTING_START_SCALE = 1.3;
const PAINTING_END_SCALE = 1.03; // matches ChapterIntro's own painting scale at its progress=0

export function HeroSection() {
  const { ref: wrapperRef, progress } = useScrollProgress<HTMLElement>();
  const { ref: parallaxRef, offset } = useMouseParallax<HTMLDivElement>();
  const painting = paintingFor("sidekick");

  // 0.00–0.15: hold (formulas below evaluate to their rest state here).
  // 0.15–0.60: explosion — lines/title scale up, title fades out.
  const explosionT = Math.min(1, Math.max(0, (progress - HOLD_END) / (EXPLOSION_END - HOLD_END)));
  const linesScale = 1 + explosionT * 3; // 1x -> 4x
  const titleScale = 1 + explosionT * 1.5; // 1x -> 2.5x
  const titleOpacity = 1 - explosionT; // 1 -> 0

  // 0.40–1.00: reveal — Sidekick's painting fades in and settles, overlapping
  // the tail of the explosion. Ends at the exact opacity/scale ChapterIntro's
  // own painting starts at (0.85 / 1.03), so the handoff has no visible jump.
  const revealT = Math.min(1, Math.max(0, (progress - REVEAL_START) / (1 - REVEAL_START)));
  const paintingOpacity =
    PAINTING_BASE_OPACITY + revealT * (PAINTING_END_OPACITY - PAINTING_BASE_OPACITY);
  const paintingScale = PAINTING_START_SCALE - revealT * (PAINTING_START_SCALE - PAINTING_END_SCALE);

  return (
    <section ref={wrapperRef} id="hero" className="relative h-[320vh]">
      <div
        ref={parallaxRef}
        className="theme-dark-region sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden bg-black text-white"
      >
        <div className="absolute inset-0">
          <Image
            src={painting.localPath}
            alt={`${painting.title} by ${painting.artist}`}
            fill
            sizes="100vw"
            className="object-cover transition-transform duration-100 ease-out"
            style={{
              opacity: paintingOpacity,
              transform: `scale(${paintingScale}) translate(${offset.x * 10}px, ${offset.y * 10}px)`,
            }}
            priority
            unoptimized
          />
        </div>

        <div
          className="absolute inset-0 transition-transform duration-100 ease-out"
          style={{
            transform: `scale(${linesScale}) translate(${offset.x * 14}px, ${offset.y * 14}px)`,
          }}
        >
          <DavinciLines stage={1} />
        </div>

        <div
          className="relative z-10 flex h-[560px] w-[380px] max-w-[85vw] flex-col items-start justify-center border border-white/20 px-10 transition-transform duration-100 ease-out"
          style={{
            opacity: titleOpacity,
            transform: `scale(${titleScale}) translate(${offset.x * -28}px, ${offset.y * -28}px)`,
          }}
        >
          <h1 className="font-display text-[56px] leading-[0.95] italic sm:text-[72px]">
            Ren
            <span className="not-italic font-mono font-bold" style={{ color: "#c9a24d" }}>
              ai
            </span>
            ssance
          </h1>
          <p className="mt-6 max-w-[280px] font-sans text-sm not-italic text-white/70">
            A new world of commerce. 150+ product updates.
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Verify the title/tagline text and early painting visibility**

```js
const h1 = document.querySelector('#hero h1');
const tagline = document.querySelector('#hero p');
JSON.stringify({ h1Text: h1.textContent, taglineText: tagline.textContent });
```

Expected: `h1Text` is `"Renaissance"` (with "ai" inside it — the textContent concatenates the span's text, so this reads as one string), `taglineText` is `"A new world of commerce. 150+ product updates."`.

```js
window.scrollTo(0, 0);
await new Promise(r => setTimeout(r, 150));
const img = document.querySelector('#hero img');
getComputedStyle(img).opacity;
```

Expected: `"0.15"` — the painting is faintly visible at rest, not `"0"`.

- [ ] **Step 4: Verify the seam is now continuous**

```js
window.scrollTo(0, 1980);
await new Promise(r => setTimeout(r, 150));
const heroImg = document.querySelector('#hero img');
JSON.stringify({ opacity: getComputedStyle(heroImg).opacity, transform: getComputedStyle(heroImg).transform });
```

Expected: `opacity` is `"0.85"`. The transform's scale component (the `a`/`d` values in the `matrix(...)` string) should be ≈ `1.03`, matching `ChapterIntro.tsx`'s painting at its own `progress = 0` (`transform: scale(1.03) ...` — verify by comparing against a fresh check of `#sidekick img`'s transform at `ChapterIntro`'s progress 0, which should show the same ≈`1.03` scale component).

- [ ] **Step 5: Verify the full production build still passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/editions/HeroSection.tsx
git commit -m "Polish hero: shorter title, tagline, early painting visibility, seamless handoff to Sidekick intro"
```

---

### Task 4c: Border removal, scroll-progress smoothing, big-bang flash

> Added after Task 4b landed and Task 5's verification (plus a separate
> environment repair for unrelated git/node_modules corruption) completed.
> Based on further user feedback comparing the deployed result to the live
> site: the title box should have no visible border, scroll-driven motion
> should feel smooth/buttery (matching the live site's Lenis-smoothed
> scroll signal) rather than snapping per scroll event, and the explosion
> should have an actual bright "big bang" flash moment rather than just
> geometric scaling. Confirmed with the user before implementation.

**Files:**
- Modify: `src/components/editions/useScrollProgress.ts` (full rewrite — used by both `HeroSection` and every `ChapterIntro`, so this change affects scroll smoothness site-wide, not just the hero)
- Modify: `src/components/editions/HeroSection.tsx` (full rewrite)

**Interfaces:**
- `useScrollProgress<T extends HTMLElement>()` still returns `{ ref, progress }` — same shape, same callers (`ChapterIntro.tsx`, `HeroSection.tsx`), no changes needed in either caller's destructuring. Only the *timing characteristic* of `progress` changes (it now eases toward the raw scroll-derived value instead of snapping to it instantly).

**What's changing and why:**

1. **Border removal** — drop `border border-white/20` from the title box's `className` in `HeroSection.tsx`. Purely a class removal.

2. **Scroll-progress smoothing** — `useScrollProgress` currently sets `progress` directly to the raw scroll-derived value inside its scroll-event handler, so it snaps instantly to wherever the scroll position is. Change it to compute a `targetProgress` on scroll (same formula as before) and run a `requestAnimationFrame` loop that lerps the stateful `progress` toward `targetProgress` by 12% of the remaining distance each frame — the exact same lerp technique already used in `useMouseParallax.ts` (`prev + diff * 0.08`), just with rate `0.12` and the loop always running (not gated by mouse movement) while the wrapper is `near` the viewport. This is what makes scroll-driven animation feel smooth on discrete/high-delta wheel input instead of visually snapping on each tick — it's the same effect the live site gets from Lenis smoothing the underlying scroll position itself, applied here at the progress-value level instead.

   This touches the **shared hook both `HeroSection` and all 12 `ChapterIntro`s use** — it is the correct place to fix "smoother transition between everything" site-wide, not a hero-only change.

3. **Big-bang flash** — a new `pointer-events-none` layer with a radial gradient (`rgba(255,255,255,0.9)` center fading through `rgba(201,162,77,0.5)` — the same gold as the "ai" span — to transparent) whose opacity follows `Math.sin(explosionT * Math.PI) * FLASH_PEAK_OPACITY` where `FLASH_PEAK_OPACITY = 0.6`. This is 0 at the start and end of the explosion phase and peaks at `explosionT = 0.5` (the midpoint) — a bloom-and-fade flash timed to the moment the lines/title are scaling fastest, giving the "universe starting" sensation the user asked for. Stacked in the DOM between the lines layer and the title layer (so it washes over the exploding lines/painting but sits under the persistent title UI).

- [ ] **Step 1: Replace the full contents of `useScrollProgress.ts`**

```ts
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
```

- [ ] **Step 2: Replace the full contents of `HeroSection.tsx`**

```tsx
"use client";

import Image from "next/image";
import { DavinciLines } from "./DavinciLines";
import { useMouseParallax } from "./useMouseParallax";
import { useScrollProgress } from "./useScrollProgress";
import { paintingFor } from "@/data/paintings";

const HOLD_END = 0.15;
const EXPLOSION_END = 0.6;
const REVEAL_START = 0.4;
const PAINTING_BASE_OPACITY = 0.15;
const PAINTING_END_OPACITY = 0.85;
const PAINTING_START_SCALE = 1.3;
const PAINTING_END_SCALE = 1.03;
const FLASH_PEAK_OPACITY = 0.6;

export function HeroSection() {
  const { ref: wrapperRef, progress } = useScrollProgress<HTMLElement>();
  const { ref: parallaxRef, offset } = useMouseParallax<HTMLDivElement>();
  const painting = paintingFor("sidekick");

  const explosionT = Math.min(1, Math.max(0, (progress - HOLD_END) / (EXPLOSION_END - HOLD_END)));
  const linesScale = 1 + explosionT * 3;
  const titleScale = 1 + explosionT * 1.5;
  const titleOpacity = 1 - explosionT;

  // A bright flash blooms and fades across the explosion phase, peaking
  // exactly at its midpoint (explosionT = 0.5) — the "big bang" moment.
  const flashOpacity = Math.sin(explosionT * Math.PI) * FLASH_PEAK_OPACITY;

  const revealT = Math.min(1, Math.max(0, (progress - REVEAL_START) / (1 - REVEAL_START)));
  const paintingOpacity =
    PAINTING_BASE_OPACITY + revealT * (PAINTING_END_OPACITY - PAINTING_BASE_OPACITY);
  const paintingScale = PAINTING_START_SCALE - revealT * (PAINTING_START_SCALE - PAINTING_END_SCALE);

  return (
    <section ref={wrapperRef} id="hero" className="relative h-[320vh]">
      <div
        ref={parallaxRef}
        className="theme-dark-region sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden bg-black text-white"
      >
        <div className="absolute inset-0">
          <Image
            src={painting.localPath}
            alt={`${painting.title} by ${painting.artist}`}
            fill
            sizes="100vw"
            className="object-cover transition-transform duration-100 ease-out"
            style={{
              opacity: paintingOpacity,
              transform: `scale(${paintingScale}) translate(${offset.x * 10}px, ${offset.y * 10}px)`,
            }}
            priority
            unoptimized
          />
        </div>

        <div
          className="absolute inset-0 transition-transform duration-100 ease-out"
          style={{
            transform: `scale(${linesScale}) translate(${offset.x * 14}px, ${offset.y * 14}px)`,
          }}
        >
          <DavinciLines stage={1} />
        </div>

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: flashOpacity,
            background:
              "radial-gradient(circle at center, rgba(255,255,255,0.9) 0%, rgba(201,162,77,0.5) 30%, transparent 70%)",
          }}
        />

        <div
          className="relative z-10 flex h-[560px] w-[380px] max-w-[85vw] flex-col items-start justify-center px-10 transition-transform duration-100 ease-out"
          style={{
            opacity: titleOpacity,
            transform: `scale(${titleScale}) translate(${offset.x * -28}px, ${offset.y * -28}px)`,
          }}
        >
          <h1 className="font-display text-[56px] leading-[0.95] italic sm:text-[72px]">
            Ren
            <span className="not-italic font-mono font-bold" style={{ color: "#c9a24d" }}>
              ai
            </span>
            ssance
          </h1>
          <p className="mt-6 max-w-[280px] font-sans text-sm not-italic text-white/70">
            A new world of commerce. 150+ product updates.
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Verify the border is gone**

```js
const titleBox = document.querySelector('#hero h1').parentElement;
getComputedStyle(titleBox).borderStyle;
```

Expected: `"none"` (no `border border-white/20` class remains).

- [ ] **Step 5: Verify scroll-progress smoothing converges correctly**

The lerp means a value read *immediately* after `scrollTo` will lag behind the target — this is intentional, not a bug. Wait at least 1000ms (roughly 50+ frames at a 0.12/frame lerp rate) for convergence before asserting on a specific value:

```js
window.scrollTo(0, 1188); // progress ≈ 0.6 target, for a 900px viewport
await new Promise(r => setTimeout(r, 1000));
const title = document.querySelector('#hero h1').parentElement;
getComputedStyle(title).opacity;
```

Expected: `"0"` (or very close to it, e.g. `"0.00X"`), matching the same checkpoint value Task 4 originally verified — confirming the lerp reaches the correct steady-state value, just via smoothed motion rather than an instant jump.

- [ ] **Step 6: Verify the flash peaks mid-explosion and fades at both ends**

```js
async function flashAt(scrollY) {
  window.scrollTo(0, scrollY);
  await new Promise(r => setTimeout(r, 1000));
  const flash = document.querySelector('#hero .pointer-events-none.absolute.inset-0');
  return { scrollY, opacity: getComputedStyle(flash).opacity };
}
JSON.stringify([await flashAt(297), await flashAt(742), await flashAt(1188)]);
```

(`297` ≈ progress 0.15 = explosion start, `742` ≈ progress 0.375 = explosion midpoint, `1188` ≈ progress 0.6 = explosion end — for a 900px viewport; scale proportionally for other viewport heights.)

Expected: opacity is `"0"` (or near-0) at both `297` and `1188`, and noticeably higher — approaching `"0.6"` — at `742` (explosionT ≈ 0.5, where `sin(0.5π) = 1`, so `flashOpacity ≈ 0.6`).

- [ ] **Step 7: Verify a `ChapterIntro` still animates correctly with the smoothed hook**

Since `useScrollProgress` is shared, confirm `ChapterIntro` (e.g. `#sidekick`) still reaches its expected steady-state values — just via smoothed motion:

```js
window.scrollTo(0, 4000); // well within Sidekick's own 220vh range, past the hero
await new Promise(r => setTimeout(r, 1000));
const img = document.querySelector('#sidekick .theme-dark-region img');
getComputedStyle(img).opacity;
```

Expected: a plausible mid-range opacity between `0.85` (progress≈0 rest) and `0` (fully exited) — the point is that it's a sensible, non-`NaN`, non-frozen value, confirming `ChapterIntro`'s formulas still work correctly against the now-smoothed `progress`.

- [ ] **Step 8: Verify the full production build still passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/components/editions/useScrollProgress.ts src/components/editions/HeroSection.tsx
git commit -m "Smooth scroll-progress motion, remove title border, add big-bang flash"
```

---

### Task 5: End-to-end verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full check suite**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all three exit 0 with no errors (matches the clean results already established earlier in this project for the rest of the site).

- [ ] **Step 2: Verify the visual handoff into Sidekick's chapter intro**

With the dev server running, scroll to `scrollY = 1980` (end of hero) and to `scrollY = 2200` (just past it, into Sidekick's own `ChapterIntro`):

```js
window.scrollTo(0, 1980);
await new Promise(r => setTimeout(r, 150));
const heroImg = document.querySelector('#hero img');
window.scrollTo(0, 2100);
await new Promise(r => setTimeout(r, 150));
const sidekickImg = document.querySelector('#sidekick img');
JSON.stringify({
  heroImgSrc: heroImg.currentSrc,
  sidekickImgSrc: sidekickImg.currentSrc,
  sameImage: heroImg.currentSrc.includes('sidekick.jpg') && sidekickImg.currentSrc.includes('sidekick.jpg'),
});
```

Expected: `sameImage` is `true` — both the hero's reveal layer and the start of Sidekick's own intro show the same painting, which is what makes the handoff read as continuous per the spec's "Architecture" section (no coordination between the two components — they just happen to end on the same image).

- [ ] **Step 3: Verify theme flip still works across the extended hero**

```js
window.scrollTo(0, 1000); // still inside hero's 220vh scroll range
await new Promise(r => setTimeout(r, 150));
document.documentElement.dataset.navTheme;
```

Expected: `"light"` (nav/sidebar text should stay light-colored the whole time the hero's dark sticky panel is pinned, not just during the original `100vh`).

- [ ] **Step 4: No commit needed** — this task only verifies work already committed in Tasks 1-4.

---

### Task 6: Extract the reusable scroll-jack + parallax template

**Files:**
- Create: `docs/superpowers/templates/scroll-jack-parallax.md`

**Interfaces:** none — this is a documentation deliverable, not code consumed elsewhere in this repo. It exists so the pattern can be copied into a different codebase (the user's other product website).

- [ ] **Step 1: Write the template document**

Create `docs/superpowers/templates/scroll-jack-parallax.md`:

````markdown
# Scroll-Jack + Cursor-Parallax Template

A copy-pasteable pattern for a "pin the background, animate it as the user
scrolls past" section — the technique behind this project's hero and chapter
intros. Two hooks, zero animation-library dependencies, works with plain CSS
transforms.

**Requirements:** React 18+ (hooks: `useState`, `useEffect`, `useRef`).
Tailwind classes are used in the example below but are entirely optional —
every class here has a plain-CSS equivalent (`sticky top-0 h-screen` ==
`position: sticky; top: 0; height: 100vh`). `next/image`'s `fill` prop is
used in the example; swap for a plain `<img>` with `position: absolute;
inset: 0` in a non-Next project.

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
````

- [ ] **Step 2: Verify the code blocks match the real source**

The template's `useScrollProgress` code block must be a **byte-for-byte** copy of `src/components/editions/useScrollProgress.ts`, except the first line (`"use client";` in the source vs. `"use client"; // remove this line outside Next.js App Router` in the template) — this hook has no project-specific content, so nothing should differ. Verify by direct comparison, not from memory: read the current source file and diff it mentally (or with a real diff) against what you wrote.

The template's `useMouseParallax` code block is **intentionally NOT** a byte-for-byte copy of `src/components/editions/useMouseParallax.ts`: the real source's docstring references this specific project's research doc (`docs/research/www.shopify.com/BEHAVIORS.md`) and "the live site," which won't exist or make sense in whatever codebase this template gets copied into. The template's version keeps the docstring's factual content (cursor position → normalized offset → lerp) but drops the project-specific sentence. This is deliberate — do not "fix" it by copying the real source's docstring verbatim. The function body (everything from `export function useMouseParallax` onward) DOES need to match exactly; only the docstring's project-specific sentence is deliberately omitted.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/templates/scroll-jack-parallax.md
git commit -m "Add portable scroll-jack + mouse-parallax template doc"
```
