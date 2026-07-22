export const IMMERSIVE_SCROLL_SKILL_ID = "veloce-immersive-scroll-site";

export const IMMERSIVE_SCROLL_PROVIDER_PROMPT = `## Veloce Immersive Scroll Site
Apply the curated Veloce immersive-scroll-site capability. Build an original service story, never a reference clone.

- Start with a conversion sequence: fragmented work -> usable system -> evidence -> human review -> measurable delivery -> one CTA.
- Use one reusable, lazy-loaded procedural depth scene per page; deep-dive routes use one topic-matched motif rather than replaying the full Home story.
- Pair every chapter with a real semantic DOM artifact. Canvas is aria-hidden and never carries copy, state, navigation, or a CTA.
- Use original procedural geometry or owned/licensed media only. Do not reproduce reference assets, copy, source, layout, or animation choreography.
- Include no-WebGL and prefers-reduced-motion fallbacks, keyboard order, visible focus, responsive layouts, and an isolated contact-submission adapter.
- Use approved proof only. Run build and desktop/mobile interaction checks before handoff.`;

export function immersiveScrollSkillApplies({ templateId, designProfile }: { templateId?: string; designProfile?: string }) {
  return templateId === "immersive" || designProfile === "immersive-operational";
}
