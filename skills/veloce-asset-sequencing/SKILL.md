---
name: veloce-asset-sequencing
description: Plan and implement original Veloce scroll-linked motion using procedural scenes, SVG drawing, owned video, or optimized image-frame sequences. Use when Flow Lab, Web Studio, Claude, Codex, or another provider needs an accessible animation production brief or a reusable frame-by-frame canvas implementation.
---

# Veloce Asset Sequencing

Choose the lightest medium that carries the story:

1. Use DOM and Motion for interface state and short reveals.
2. Use original SVG paths for diagrams and line drawing.
3. Use procedural Three.js for spatial systems, particles, routes, and responsive depth.
4. Use owned video for a short emotional or documentary moment.
5. Use a frame sequence only when the viewer must control meaningful intermediate states.

## Frame-Sequence Workflow

1. Define one transformation with a locked subject, camera, lighting, scale, and background.
2. Create or supply an owned start frame and end frame. List the parts or state changes explicitly.
3. Generate the in-between motion using an approved tool, then inspect drift, flicker, text, logos, reflections, and edge stability.
4. Export numbered frames and convert them to responsive WebP or AVIF.
5. Cap the first release at 120 frames. Prefer 60-96 frames when the motion remains readable.
6. Use `assets/ScrollFrameSequence.tsx` as the default React implementation.
7. Load frame zero and the final frame first, then maintain a small window around the current frame.
8. Map natural scroll progress to the frame index. Do not hijack wheel or touch input.
9. Keep copy, state, navigation, and CTAs in semantic DOM outside the canvas.
10. Provide a poster, loading state, error state, and `prefers-reduced-motion` behavior.

## Production Contract

Record these in the Flow Lab brief before implementation:

- source owner and license basis;
- frame count, format, aspect ratio, and filename pattern;
- intended route and scroll distance;
- contain or cover behavior per breakpoint;
- poster/static fallback;
- estimated compressed weight and mobile policy;
- approval owner and acceptance criteria.

## Quality Gates

- Verify forward and reverse scrolling at desktop and mobile sizes.
- Verify canvas dimensions use device-pixel ratio capped at 2 on desktop and 1.25 on mobile.
- Verify no horizontal overflow, trapped scroll, blank canvas, or layout shift.
- Verify the page remains understandable with JavaScript disabled or motion reduced.
- Verify no third-party reference frames, protected product imagery, source copy, or logos ship in the result.
- Verify the sequence is lazy-mounted and does not delay the page's first meaningful content.

Use GSAP ScrollTrigger only when the target project already uses GSAP or needs a coordinated long timeline. The bundled component uses browser primitives and `requestAnimationFrame`, which keeps the skill portable across React projects.
