import type { CapabilityTraitId } from "@/lib/capabilityTraits";
import type { ClientIntentSurface, ClientPlaybook } from "@/lib/clientPlaybooks";

/**
 * Wave 4A: a small Veloce-authored specialist slice.
 *
 * These are native playbook contracts, not imported prompts or executable
 * upstream skills. They make the most common business outcomes discoverable by
 * intent routing while retaining the existing capability and approval gates.
 */

const BASE_TRAITS: readonly CapabilityTraitId[] = [
  "tenant-isolation", "provenance", "budget", "idempotency", "audit", "resumability", "approval", "output-quality",
];
const PROVIDER_TRAITS: readonly CapabilityTraitId[] = [...BASE_TRAITS, "model-allowlist", "context-compression"];
const RESEARCH_TRAITS: readonly CapabilityTraitId[] = [...BASE_TRAITS, "source-policy", "citations", "confidence", "partial-results"];
const QUALITY_TRAITS: readonly CapabilityTraitId[] = [...BASE_TRAITS, "accessibility"];
const CHAT_SURFACES: readonly ClientIntentSurface[] = ["chat", "create", "guide", "orchestrate"];

export const NATIVE_WAVE4A_SPECIALIST_PLAYBOOKS: readonly ClientPlaybook[] = [
  {
    id: "specialist-competitor-intelligence",
    label: "Competitor intelligence brief",
    description: "Compare approved public evidence and turn it into a cited, decision-ready competitor brief.",
    intents: ["competitor intelligence", "pricing landscape", "compare competitors", "competitive brief", "market positioning"],
    eligibleCapabilities: ["research"],
    skillIds: ["research"],
    requiredTraits: RESEARCH_TRAITS,
    riskClass: "review",
    approval: "review-before-apply",
    outputType: "competitive-intelligence-brief",
    supportedSurfaces: ["chat", "notebook", "orchestrate", "guide"],
  },
  {
    id: "specialist-seo-content-plan",
    label: "SEO content plan",
    description: "Turn an approved search or market brief into a cited content plan with measurable next steps.",
    intents: ["seo content plan", "search content plan", "keyword brief", "organic growth plan", "content opportunities"],
    eligibleCapabilities: ["seo-research"],
    skillIds: ["research", "technical-writing"],
    requiredTraits: RESEARCH_TRAITS,
    riskClass: "review",
    approval: "review-before-apply",
    outputType: "seo-content-plan",
    supportedSurfaces: ["chat", "create", "guide", "orchestrate"],
  },
  {
    id: "specialist-launch-content",
    label: "Launch content brief",
    description: "Create a channel-aware launch brief with audience, claims, review questions, and reusable drafts.",
    intents: ["launch announcement", "campaign brief", "content launch", "social launch", "product announcement"],
    eligibleCapabilities: ["text-agents"],
    skillIds: ["technical-writing"],
    requiredTraits: PROVIDER_TRAITS,
    riskClass: "review",
    approval: "review-before-apply",
    outputType: "launch-content-brief",
    supportedSurfaces: CHAT_SURFACES,
  },
  {
    id: "specialist-customer-response",
    label: "Customer response draft",
    description: "Draft a clear, empathetic customer response while marking unknowns and approval-sensitive promises.",
    intents: ["customer response", "support reply", "reply to customer", "customer email draft", "support response"],
    eligibleCapabilities: ["text-agents"],
    skillIds: ["technical-writing"],
    requiredTraits: PROVIDER_TRAITS,
    riskClass: "review",
    approval: "review-before-apply",
    outputType: "customer-response-draft",
    supportedSurfaces: ["chat", "create", "guide"],
  },
  {
    id: "specialist-product-requirements",
    label: "Product requirements brief",
    description: "Convert an outcome into a bounded product brief with assumptions, acceptance criteria, and open decisions.",
    intents: ["product requirements", "write a prd", "feature brief", "acceptance criteria", "product specification"],
    eligibleCapabilities: ["orchestration"],
    skillIds: ["architecture"],
    requiredTraits: BASE_TRAITS,
    riskClass: "low",
    approval: "none",
    outputType: "product-requirements-brief",
    supportedSurfaces: ["chat", "orchestrate", "create", "guide"],
  },
  {
    id: "specialist-operations-checklist",
    label: "Operations checklist",
    description: "Produce an owner-readable operating checklist with dependencies, owners, checkpoints, and escalation paths.",
    intents: ["operations checklist", "runbook", "operating procedure", "process checklist", "handoff checklist"],
    eligibleCapabilities: ["orchestration"],
    skillIds: ["architecture"],
    requiredTraits: BASE_TRAITS,
    riskClass: "low",
    approval: "none",
    outputType: "operations-checklist",
    supportedSurfaces: ["chat", "orchestrate", "create", "guide"],
  },
  {
    id: "specialist-accessibility-review",
    label: "Accessibility review",
    description: "Review an approved preview or artifact for accessibility findings and produce remediation guidance for human review.",
    intents: ["accessibility audit", "accessibility review", "wcag review", "a11y check", "make this accessible"],
    eligibleCapabilities: ["quality"],
    skillIds: ["accessibility"],
    requiredTraits: QUALITY_TRAITS,
    riskClass: "review",
    approval: "review-before-apply",
    outputType: "accessibility-review",
    supportedSurfaces: ["chat", "create", "guide", "integrations"],
  },
  {
    id: "specialist-release-readiness",
    label: "Release readiness review",
    description: "Check a proposed release against evidence, quality, approval, and rollback expectations before publication.",
    intents: ["release readiness", "go live review", "launch readiness", "release checklist", "ship review"],
    eligibleCapabilities: ["quality"],
    skillIds: ["code-review", "architecture"],
    requiredTraits: BASE_TRAITS,
    riskClass: "review",
    approval: "review-before-apply",
    outputType: "release-readiness-review",
    supportedSurfaces: ["chat", "create", "guide", "integrations", "orchestrate"],
  },
] as const;

/**
 * Wave 4B: six additional outcome slices selected from the starred role,
 * design, content, and knowledge references. These remain Veloce-authored
 * contracts and inherit the same manifest and trait validation as Wave 4A.
 */
export const NATIVE_WAVE4B_SPECIALIST_PLAYBOOKS: readonly ClientPlaybook[] = [
  {
    id: "specialist-system-design",
    label: "System design brief",
    description: "Turn a product or infrastructure outcome into a bounded architecture brief with trade-offs and failure modes.",
    intents: ["system design", "architecture brief", "design the architecture", "scale this system", "technical architecture"],
    eligibleCapabilities: ["orchestration"],
    skillIds: ["architecture"],
    requiredTraits: BASE_TRAITS,
    riskClass: "low",
    approval: "none",
    outputType: "system-design-brief",
    supportedSurfaces: ["chat", "orchestrate", "create", "guide"],
  },
  {
    id: "specialist-content-strategy",
    label: "Content strategy brief",
    description: "Build an audience-aware content strategy with themes, evidence needs, production steps, and review questions.",
    intents: ["content strategy", "editorial strategy", "content pillars", "audience content plan", "content roadmap"],
    eligibleCapabilities: ["text-agents"],
    skillIds: ["technical-writing"],
    requiredTraits: PROVIDER_TRAITS,
    riskClass: "review",
    approval: "review-before-apply",
    outputType: "content-strategy-brief",
    supportedSurfaces: CHAT_SURFACES,
  },
  {
    id: "specialist-social-content-pack",
    label: "Social content pack",
    description: "Draft platform-aware social variants from an approved brief without publishing or contacting recipients.",
    intents: ["social content", "linkedin post", "social media pack", "post variants", "social campaign draft"],
    eligibleCapabilities: ["text-agents"],
    skillIds: ["technical-writing"],
    requiredTraits: PROVIDER_TRAITS,
    riskClass: "review",
    approval: "review-before-apply",
    outputType: "social-content-pack",
    supportedSurfaces: ["chat", "create", "guide", "integrations"],
  },
  {
    id: "specialist-design-direction",
    label: "Design direction brief",
    description: "Translate a product goal into an original, accessible design direction with hierarchy, states, and review criteria.",
    intents: ["design direction", "ux direction", "ui concept", "design system brief", "product experience direction"],
    eligibleCapabilities: ["text-agents"],
    skillIds: ["architecture", "technical-writing"],
    requiredTraits: PROVIDER_TRAITS,
    riskClass: "review",
    approval: "review-before-apply",
    outputType: "design-direction-brief",
    supportedSurfaces: ["chat", "create", "guide"],
  },
  {
    id: "specialist-growth-experiment",
    label: "Growth experiment brief",
    description: "Frame a measurable growth hypothesis with evidence needs, guardrails, success criteria, and a reviewable next step.",
    intents: ["growth experiment", "conversion experiment", "ab test plan", "growth hypothesis", "trial conversion"],
    eligibleCapabilities: ["research"],
    skillIds: ["research", "architecture"],
    requiredTraits: RESEARCH_TRAITS,
    riskClass: "review",
    approval: "review-before-apply",
    outputType: "growth-experiment-brief",
    supportedSurfaces: ["chat", "notebook", "orchestrate", "guide"],
  },
  {
    id: "specialist-knowledge-synthesis",
    label: "Knowledge synthesis brief",
    description: "Synthesize approved tenant knowledge into a traceable brief while preserving retention, deletion, and chunk lineage.",
    intents: ["knowledge synthesis", "synthesize my notes", "executive summary from notes", "summarize our knowledge", "knowledge brief"],
    eligibleCapabilities: ["notebook"],
    skillIds: ["research", "technical-writing"],
    requiredTraits: [...BASE_TRAITS, "retention", "deletion-lineage", "chunk-provenance", "reviewed-activation"],
    riskClass: "review",
    approval: "review-before-apply",
    outputType: "knowledge-synthesis-brief",
    supportedSurfaces: ["chat", "notebook", "guide"],
  },
] as const;

export const NATIVE_SPECIALIST_PLAYBOOKS: readonly ClientPlaybook[] = [
  ...NATIVE_WAVE4A_SPECIALIST_PLAYBOOKS,
  ...NATIVE_WAVE4B_SPECIALIST_PLAYBOOKS,
];
