---
name: veloce-immersive-scroll-site
description: Build an original scroll-led service website with bounded procedural depth, real operating artifacts, DOM-first accessibility, and human-approved conversion. Use for Veloce Web Studio or Flow Lab briefs marked Immersive operational.
---

# Veloce Immersive Scroll Site

Use this pack for an original service story, not a generic landing page or a copied reference experience.

## Required decisions

1. Define a conversion story before choosing scenes: fragmented work -> usable system -> evidence -> human review -> measurable delivery -> one CTA.
2. Use one reusable, lazy-loaded scene system per page. The Home route may progress through a full story; deep-dive routes use one topic-matched motif.
3. Pair each chapter with one inspectable DOM operating artifact. The canvas is atmospheric only and must be `aria-hidden`.
4. Use original procedural geometry or owned/licensed media only. Never reproduce a reference site's assets, copy, source, layout, or animation choreography.
5. Provide a no-WebGL and `prefers-reduced-motion` static fallback. Keep keyboard reading order, copy, state, and CTAs fully functional without the canvas.
6. Keep contact submission behind one isolated adapter. Do not add provider keys, webhooks, publishing, or CRM integration without explicit approval.

## Provider-neutral build contract

Any Veloce-supported model may use this pack to create a brief, prototype, or implementation handoff. The model must:

- state the selected story, scene motif, DOM artifact, fallback, and primary CTA;
- preserve semantic landmarks, visible focus, mobile layout, and reduced-motion behavior;
- use approved proof only and flag any missing factual content;
- run the relevant build and browser checks before claiming completion.

## Templates

Use the `templates/` folder only after a project selects React/Next.js + Framer Motion + React Three Fiber. Adapt naming, palettes, copy, and page motifs to the project; do not copy Veloce claims into a client site.

- `templates/scene/`: reusable procedural scene, lazy loader, canvas wrapper, and fallback.
- `templates/shared/`: sticky story track, semantic sections, artifacts, reset, hero, and final CTA.
- `templates/lib-*.ts`: shared motion and WebGL support helpers.

## Verification

- Build passes.
- Check 375, 768, 1024, and 1440 px.
- Verify keyboard focus and skip navigation.
- Force no-WebGL once and verify the static fallback.
- Check reduced-motion behavior and lead-form empty/invalid/valid states.
