# Page Topology — shopify.com/editions/winter2026

Total scroll height: ~48,400px desktop (1440px viewport). This is a long-form
"release notes" marketing page: 12 chapters, 200 feature articles (matches the
page's own "150+ product updates" claim — some chapters group multiple minor
updates per article).

## Global layout

- **Scroll container:** native `<html>` with Lenis smooth-scroll (`class="lenis"` on `<html>`).
- **Column structure:** persistent 2-column layout below the hero — a narrow
  sticky left rail (chapter list + copyright/legal links, fixed position,
  present the entire scroll) and a wide right content column that holds all
  chapter content stacked vertically.
- **Z-index layers:** fixed top nav (z-top) > sticky left rail > flowing
  content > hero background SVG (behind hero text).
- **Theme system:** `<html>` carries `data-nav-theme`, `data-sidebar-theme`,
  `data-title-theme` attributes, each `"light"` (light-colored text, used over
  dark backgrounds like the hero) or `"dark"` (dark text, used over the
  beige/white content background). These flip via scroll position /
  IntersectionObserver as the user crosses section boundaries — NOT a
  user-toggled dark mode.

## Section order (top to bottom)

1. **Fixed top nav** (sticky/fixed overlay, present at all scroll positions)
   - Logo + "Shopify Editions / Winter '26" wordmark, "Editions" dropdown
     (past editions list: Spring '26 Everywhere, Winter '26 Renaissance,
     Summer '25 Horizons, ...), Search, "Shopify.com" link, "Start for free" pill button, hamburger (mobile only, <~948px).
   - Interaction model: static position; background/text theme flips via
     `data-nav-theme`.

2. **Hero** (`section`, full black background, ~1x viewport tall)
   - Golden-ratio / Vitruvian construction-line SVG (`svg.davinci-lines`,
     exact markup captured in `hero-davinci-lines.svg`) centered, animated
     line-groups drawn in via `stroke-dasharray`/`pathLength=1` + revealed
     progressively via `data-group`/`data-active`/`data-shown` attributes as
     you scroll (scroll-driven, not click-driven).
   - Headline: "The Ren*ai*ssance Edition" — serif display font (HWCigars)
     with the "ai" in "Renaissance" italicized/styled as a distinct accent
     (AI branding wordplay). Sits inside one of the SVG's construction
     rectangles.
   - Interaction model: scroll-driven (SVG line reveal), static content.

3. **Persistent left rail** (sticky, spans the rest of the page height)
   - Roman-numeral chapter nav: Sidekick (I) … Developer (XII). Class
     `.sidebar-link`. Active chapter highlights via scroll-spy
     (IntersectionObserver, not click-required — clicking also jumps/smooth-scrolls).
   - Below the nav list: "© Shopify Inc / Terms of Service / Privacy Policy"
     (class `terms-of-service`, `font-cigars` display serif at 10px) — this is
     the page's only "footer" content; there is no traditional bottom
     `<footer>`.
   - Interaction model: sticky positioning + scroll-spy highlight; hover
     underline on legal links.

4. **12 chapters**, each a `headline-1` chapter title ("Sidekick", "Agentic",
   "Online", "Retail", "Marketing", "Checkout", "Operations", "Shop app",
   "B2B", "Finance", "Shipping", "Developer") followed by 1+ sub-sections.
   Each sub-section has an italic serif `headline-3`/`headline-4` intro line
   (e.g. "Designs, refined", "Tedious tasks, simplified") followed by a run of
   `<article>` feature blocks. See COMPONENT_INVENTORY / spec files for the
   3 repeating article variants.

   Approx. article counts per chapter (from `articles-raw.json`):
   Sidekick 20, Agentic 2, Online 23, Retail 17, Marketing 13, Checkout 10,
   Operations 22, Shop app 6, B2B 14, Finance 12, Shipping 7, Developer 54.

## Article (feature block) variants

All 200 `<article>` elements reduce to 3 visual/structural patterns:

- **A — Full-width feature** (`FeatureBlockFull`): large image/video on one
  side (offset/bleeding past the grid edge, `left-[-20cqw]` style), eyebrow
  (h4, bold), description (p), CTA link ("Read help doc" / "Get app" with
  external-link icon). Used for major/flagship features.
- **B — Grid feature** (`FeatureBlockGrid`): same fields as A but laid out
  3-up in a row, smaller image (mockup screenshot inside a browser/phone
  chrome frame), used for related feature clusters (e.g. the "studio-quality
  photos / mobile image editor / email editing" row).
- **C — List item** (`FeatureListItem`): no image at all — just a bold linked
  title (h4 > a) and a description paragraph, arranged 2/5 + 3/5 grid columns
  in a single row with a top border divider. Used for minor/API-level updates
  (dominant pattern in "Developer" and "Operations" chapters — 143 of 200
  articles have no media at all).

## Responsive breakpoints observed

- **Mobile (<948px approx, Tailwind `lg`/`global-lg` breakpoint):** top nav
  collapses to hamburger → full-screen mobile menu (dark overlay, chapter
  list styled as large `headline-6` links with `border-t border-white/10`
  dividers). Persistent left rail disappears (chapter nav + legal links move
  into a different position — legal links appear inline below hero content on
  mobile, chapter list only reachable via the hamburger menu). Feature grid
  (variant B) collapses to a single column. Hero switches from centered
  construction-line diagram to a scattered/collage layout of floating product
  cards (Pulse widget, order status chip, abstract gradient blob) over a
  faded, cropped hero title.
- **Desktop (≥1440):** 2-column persistent-rail layout described above.

## Assets

- Images are served from Shopify's CDN with resize query params
  (`?v=...&width=100&height=NN&crop=center`); request `width=1200` (or strip
  params) for full-resolution downloads. See `articles-raw.json` for all 57
  image URLs (thumbnail-sized as scraped).
- ~10 articles use `hasVideo` (play-button overlay); no direct `<video src>`
  was resolvable without clicking play (likely lazy-loaded on click). Scope
  decision: render these as the same image/poster treatment as variant A/B
  with a play-button overlay icon (no functional video playback) — see
  CLAUDE.md-equivalent scope note in SKILL.md ("mock data for demo purposes",
  "no real-time features").
