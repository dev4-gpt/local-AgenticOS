/**
 * Shared source of truth for the hero → first-chapter visual seam.
 *
 * `HeroSection`'s big-bang reveal ends by scrolling its Sidekick painting to
 * exactly these values, and `ChapterIntro` starts its own painting at exactly
 * these values on its `progress = 0` rest state. Because the two components
 * animate independently (they just happen to show the same painting at the
 * boundary where the hero's 320vh wrapper ends and Sidekick's 220vh wrapper
 * begins), the handoff only reads as one continuous motion while these three
 * numbers match on both sides.
 *
 * Keep both consumers pointed at these constants — do not re-inline the
 * literals. A silent divergence here reintroduces a visible jump at the seam
 * with no type error, test failure, or lint warning to catch it.
 *
 * Consumers:
 *  - HeroSection.tsx  — reveal end state (paintingOpacity/paintingScale target, scrim ramp target)
 *  - ChapterIntro.tsx — progress=0 rest state (painting opacity/scale, bg-black/45 scrim)
 */

/** Painting opacity at the seam (hero reveal end === chapter rest state). */
export const SEAM_PAINTING_OPACITY = 0.85;

/** Painting scale at the seam (hero reveal end === chapter rest state). */
export const SEAM_PAINTING_SCALE = 1.03;

/**
 * Black scrim opacity over the painting at the seam. `ChapterIntro` renders
 * this as the Tailwind class `bg-black/45` (0.45) at full strength on its
 * rest state; the hero ramps a matching scrim up to this value across its
 * reveal so the painting's composite brightness lines up at the boundary.
 */
export const SEAM_SCRIM_OPACITY = 0.45;
