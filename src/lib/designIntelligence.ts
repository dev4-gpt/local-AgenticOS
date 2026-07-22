export type DesignProfileId = "conversion-editorial" | "immersive-operational" | "product-clarity";

export interface DesignProfile {
  id: DesignProfileId;
  label: string;
  intent: string;
  composition: string;
  motion: string;
  constraints: string;
}

export const DESIGN_PROFILES: DesignProfile[] = [
  {
    id: "conversion-editorial",
    label: "Conversion editorial",
    intent: "A confident service story with an explicit point of view, proof, and one clear next action.",
    composition: "Asymmetric editorial hierarchy, real evidence before claims, and no decorative card grids.",
    motion: "One decisive hero moment, section reveals, and responsive feedback on meaningful actions.",
    constraints: "Use readable type, visible focus, stable layouts, and a mobile-first conversion path.",
  },
  {
    id: "immersive-operational",
    label: "Immersive operational",
    intent: "A scroll-led product world that makes systems work feel spatial, credible, and human-governed.",
    composition: "One full-bleed original scene per chapter, paired with a real operating artifact and a clear reset.",
    motion: "Scroll-linked depth, bounded Three.js or Motion layers, and a complete reduced-motion DOM fallback.",
    constraints: "Canvas is never the only carrier of copy, state, or CTA. Load scenes lazily and preserve keyboard reading order.",
  },
  {
    id: "product-clarity",
    label: "Product clarity",
    intent: "A quiet, high-trust product narrative for teams making a considered B2B decision.",
    composition: "Dense but scan-friendly sections, inspectable product states, and explicit security and implementation boundaries.",
    motion: "Short purposeful transitions only; motion clarifies state change rather than adding spectacle.",
    constraints: "Prioritize performance, accessibility, pricing clarity, and obvious paths through complex information.",
  },
];

export function getDesignProfile(id?: string) {
  return DESIGN_PROFILES.find((profile) => profile.id === id) ?? DESIGN_PROFILES[0];
}

export function designProfilePrompt(id?: string) {
  const profile = getDesignProfile(id);
  return `## Veloce Design Intelligence: ${profile.label}\n- Intent: ${profile.intent}\n- Composition: ${profile.composition}\n- Motion: ${profile.motion}\n- Constraints: ${profile.constraints}\n\nUse reviewed UI/UX principles for hierarchy, accessibility, responsive behavior, and conversion. Treat 21st.dev, Aceternity, Magic UI, and Kokonut as component research sources only: inspect a specific candidate, reproduce or import only the minimum reviewed code, and never bulk-install a visual library.`;
}
