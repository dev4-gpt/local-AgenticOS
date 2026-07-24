# Behaviors — shopify.com/editions/winter2026

## Smooth scroll

`<html class="lenis">` — Lenis smooth-scroll library is active site-wide.
Native `window.scrollTo` does not reliably trigger the same
IntersectionObserver-driven theme/line-reveal effects as a real scroll/wheel
event; effects fire on next real scroll interaction (or animation frame
after).

## Theme flip (nav / sidebar / title)

- **Mechanism:** `data-nav-theme`, `data-sidebar-theme`, `data-title-theme`
  attributes on `<html>`, values `"light"` | `"dark"`.
  - `light` = light-colored text (used when the nav/sidebar/title overlaps a
    dark background, e.g. the hero).
  - `dark` = dark-colored text (used over the beige/white content background,
    which is the vast majority of the page).
- **Trigger:** IntersectionObserver watching section backgrounds as they
  cross the nav/sidebar bounding boxes. Confirmed via test: at `scrollY=0`
  (hero, black bg) theme is `light`; after scrolling into chapter content
  (beige bg) theme flips to `dark`.
- **Transition:** text/icon color transitions (`transition-colors
  duration-300` observed on nearby elements) — implement as a 300ms color
  transition, not an instant swap.
- **Implementation approach:** IntersectionObserver on chapter section
  boundaries (or a scroll-position threshold check) toggling a data attribute
  on a root element; components read the attribute via CSS
  `[data-theme="dark"] &` selectors or a React context.

## Hero SVG line reveal

- Element: `svg.davinci-lines` (exact markup saved to `hero-davinci-lines.svg`).
- Each `<path>`/`<circle>` has `pathLength="1"` and a `data-group="n,n,..."`
  attribute listing which reveal-stages it belongs to.
- The svg itself carries `data-active` (current stage number) and
  `data-shown` (comma list of stages currently visible, e.g. `"7,6"` — stages
  fade out as new ones fade in, so 2 can be visible mid-transition).
- Two duplicate `<rect>` per shape family: `.davinci-lines__loader` (partial/
  drawing-in stroke, animated via stroke-dashoffset given `pathLength=1`) and
  `.davinci-lines__complete` (fully drawn state).
- **Interaction model:** scroll-driven. As the user scrolls down through the
  early chapters, the visible line-group stage advances (roughly one stage
  per early chapter/section crossed), lines for the new stage draw in while
  the previous stage's exclusive lines fade out; lines shared between
  consecutive `data-group` lists stay visible across the transition.
- **Implementation approach:** IntersectionObserver on early section
  boundaries advancing a `stage` state (1-8 observed); CSS transitions on
  `stroke-dashoffset` (draw-in) and `opacity` (fade) keyed off `data-group`
  membership of the current stage.

## Chapter sidebar scroll-spy

- `.sidebar-link` items in the persistent left rail. The active chapter link
  is visually distinguished (assume weight/opacity/underline change — verify
  against `hero-davinci-lines` screenshot references) as its chapter section
  is in view.
- **Trigger:** IntersectionObserver per chapter `<h2 class="headline-1">`
  section, NOT click-only — clicking a sidebar link also smooth-scrolls
  (Lenis) to that chapter's anchor (`href="/editions/winter2026#sidekick"`
  style anchors, one per chapter slug).

## Hover states

- Sidebar links, footer legal links, CTA links: `hover:underline` on text
  links (`no-underline hover:underline` pattern used throughout — links are
  NOT underlined by default, only on hover).
- Nav "Start for free" pill button and CTA buttons: standard button
  hover — exact color shift not deep-inspected given scope; apply a subtle
  background-darken/lighten hover consistent with the rest of the button
  system (`roundedButton`, `navButton` classes).
- Play-video buttons (variant A/B articles with `hasVideo`): `group-hover:`
  scale/background change on the circular play icon (`square-button
  group-hover:b...` truncated class observed — treat as a standard
  scale-up-on-hover icon button).

## Responsive sweep

Tested at ~1440px (desktop, native resize), ~948px (tablet-ish — this is
where the layout auto-collapsed to the mobile hamburger nav during testing,
so treat ~948px as the `global-lg` breakpoint), and 390px (mobile,
iPhone-width).

- **Nav:** desktop = full inline nav (logo, Editions dropdown, Search,
  Shopify.com link, Start for free button). Below `global-lg` (~948px):
  collapses to logo + Start for free + hamburger; hamburger opens a
  full-screen dark overlay menu listing chapters as large serif links.
- **Persistent left rail (chapter list + legal links):** desktop-only.
  Removed entirely below `global-lg` — mobile users navigate chapters via the
  hamburger menu instead.
- **Feature grid (variant B, 3-up):** collapses to 1 column on mobile
  (`col-span-full` on small screens per Tailwind classes observed, `global-
  lg:col-span-6` etc. gating the multi-column layout to desktop).
- **Feature list (variant C):** desktop = 2-col/3-col grid row (title +
  description side by side). Mobile: stacks vertically (`flex flex-col gap-
  10 lg:grid lg:grid-cols-5` — flex-col below `lg`, grid at `lg`+).
- **Hero:** desktop = centered construction-line SVG diagram with hero title
  inside it. Mobile = different treatment entirely — a loose collage of
  floating cards (app widget screenshot, order-status chip, abstract gradient
  circle) scattered over a large, faded/cropped hero title in the background.
  Treat as a distinct mobile-only hero layout, not a responsive reflow of the
  desktop one.

## Not implemented (scope decision, confirmed with user)

- Real video playback for `hasVideo` articles — no video `src` was
  resolvable without a click interaction per article (lazy-loaded); these
  render with their poster/thumbnail image + a static play-button overlay
  icon (matches skill's "mock data for demo purposes" / "no real-time
  features" defaults).
- Exact color/scale values for every hover/button state — the repeating
  button classes (`roundedButton`, `navButton`, `square-button`) were not
  individually re-measured before/after hover for all ~5 button contexts;
  builders should apply one consistent hover treatment (background
  darken ~8%, 200ms ease) across all CTA buttons rather than bespoke
  per-instance values.
