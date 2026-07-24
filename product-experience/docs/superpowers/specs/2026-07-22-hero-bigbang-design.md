# Hero "Big Bang" Opening — Design

## Context

The hero (`src/components/editions/HeroSection.tsx`) currently renders as a
static `100vh` section: the construction-line diagram (`DavinciLines`) behind
a centered title box reading "The Ren*ai*ssance Edition", with mouse-driven
parallax on both layers (`useMouseParallax`). Immediately after it in the DOM,
`ChapterSection` renders Sidekick's `ChapterIntro` — its own `220vh`
scroll-jack wrapper with a `position: sticky` inner panel that pins a
Rembrandt self-portrait while the "Sidekick" title and floating cards fade in.

Today the handoff from hero to Sidekick's intro is an ordinary document-flow
boundary — scrolling past the hero's `100vh` just reveals the next section
with no transition. This spec replaces that flat handoff with a scroll-driven
"big bang": the construction lines and title explode outward and the scene
zooms through into Sidekick's painting.

## 1. Font treatment for "ai"

In the `<h1>` inside `HeroSection`, the `<span>` wrapping "ai" changes from
`font-sans font-light` to a bold monospace face, upright (not italic), colored
`#c9a24d` (antique gold). The rest of the title ("Ren", "ssance", "Edition")
stays as-is: `font-display` (Instrument Serif), italic, white.

No new font needs to be loaded — Tailwind's default monospace stack
(`font-mono`) is sufficient; only the weight/color/style change.

```tsx
<span className="not-italic font-mono font-bold" style={{ color: "#c9a24d" }}>
  ai
</span>
```

## 2. Architecture

`HeroSection` changes from a flat `100vh` section to the same scroll-jack
pattern already used by `ChapterIntro`:

```
<section id="hero" className="relative h-[320vh]">      outer wrapper (scroll distance)
  <div class="theme-dark-region sticky top-0 h-screen">  pinned panel, same as ChapterIntro
    <DavinciLines />       radiating layer, scroll-progress driven + parallax
    <title box>            scaling/fading layer, scroll-progress driven + parallax
    <Sidekick painting>    cross-fades in underneath, scroll-progress driven
  </div>
</section>
```

`320vh` = `100vh` initial hold + `220vh` scrollable explosion distance,
matching the scroll distance already used by every `ChapterIntro` (`220vh`
total wrapper height, `220vh - 100vh = 120vh` of which is actually
scrollable given a `100vh` viewport — same progress formula reused here,
see section 3).

**No changes to `ChapterIntro.tsx` or `ChapterSection.tsx`.** Sidekick's
existing chapter intro (already showing the same Rembrandt painting) starts
its own progress from 0 as soon as the hero's wrapper scrolls past. The
hero's own reveal of that painting and Sidekick's intro fading its title in
over it are two independent, uncoordinated animations that happen to end up
looking continuous because they show the same image at the seam. This keeps
`ChapterIntro` fully generic — no "is this the first chapter" special case.

`HeroSection` imports `paintingFor("sidekick")` from `src/data/paintings.ts`
(existing data, no changes needed there) to render that same image.

## 3. Choreography

Scroll progress `p` for the hero wrapper is computed exactly like
`ChapterIntro` already does: `p = clamp((scrollY_into_wrapper) / (wrapperHeight - viewportHeight), 0, 1)`.

| Progress range | Behavior |
|---|---|
| `0.00 – 0.15` | Hold: title box and lines fully visible, no scale/opacity change (matches today's static feel before scrolling) |
| `0.15 – 0.60` | **Explosion**: `DavinciLines` layer scales `1x → ~4x` (radiating outward); title box scales `1x → ~2.5x` while opacity fades `1 → 0` |
| `0.40 – 1.00` | **Reveal** (overlaps explosion's tail): Sidekick painting layer fades `opacity 0 → 1` and scales `~1.3x → 1x` (settling), reading as "flying through the lines into the painting" |
| `1.00` | Hero wrapper's scroll distance is exhausted; sticky panel releases; Sidekick's own `ChapterIntro` (unrelated component, its own progress from 0) takes over |

All ranges are linear interpolations clamped to `[0, 1]` within their own
sub-range (same `Math.min/Math.max` pattern already used in `ChapterIntro`
for `enter`/`exit`).

Mouse parallax (`useMouseParallax`) continues to apply to the lines and title
layers at the same strength as today throughout the whole sequence — it is
not itself progress-dependent; it just becomes less visually noticeable as
those layers fade out during the explosion phase, which is fine and requires
no special handling.

## 4. Files touched

- `src/components/editions/HeroSection.tsx` — restructured into the
  scroll-jack pattern; add scroll-progress tracking (same
  `IntersectionObserver`-gated pattern as `ChapterIntro`, extracted or
  duplicated — see open question below); font span update; painting reveal
  layer added.
- No changes to `ChapterIntro.tsx`, `ChapterSection.tsx`, `DavinciLines.tsx`
  (still receives a `stage` prop as today; only the wrapper around it
  changes how it's transformed), `useMouseParallax.ts`, or `paintings.ts`.

## Open question for implementation

`ChapterIntro.tsx` already contains scroll-progress-tracking logic
(`IntersectionObserver` gating + `rAF`-throttled scroll listener computing
`progress` from a wrapper ref). `HeroSection` needs the identical mechanic.
The plan should decide: duplicate that ~20 lines directly into
`HeroSection`, or extract it into a shared `useScrollProgress(wrapperRef)`
hook used by both. Given DRY and that a third scroll-jack section is
plausible later, extracting the hook is likely worth the small refactor —
the implementation plan should confirm this.

## Out of scope

- No changes to any other chapter's intro.
- No new animation library — pure CSS transforms driven by React state, same
  technique as the rest of the site.
- No changes to the mobile hero (this scroll-jack applies at all viewport
  sizes since `ChapterIntro` already does the same without a mobile
  exception — consistent, no new special-casing).
