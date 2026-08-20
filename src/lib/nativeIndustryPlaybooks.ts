import type { CapabilityTraitId } from "@/lib/capabilityTraits";
import type { ClientIntentSurface, ClientPlaybook } from "@/lib/clientPlaybooks";

/**
 * Wave 4C is intentionally data-driven. A family describes the business
 * vocabulary; the compiler supplies two safe native outcomes. This keeps the
 * registry broad without copying upstream prompts or creating 26 bespoke
 * execution paths.
 */

const BASE_TRAITS: readonly CapabilityTraitId[] = [
  "tenant-isolation", "provenance", "budget", "idempotency", "audit", "resumability", "approval", "output-quality",
];
const RESEARCH_TRAITS: readonly CapabilityTraitId[] = [...BASE_TRAITS, "source-policy", "citations", "confidence", "partial-results"];
const RESEARCH_SURFACES: readonly ClientIntentSurface[] = ["chat", "notebook", "orchestrate", "guide"];
const PLAN_SURFACES: readonly ClientIntentSurface[] = ["chat", "orchestrate", "create", "guide"];

interface IndustryFamily {
  id: string;
  label: string;
  evidenceTerms: readonly string[];
  planTerms: readonly string[];
  skillIds: readonly string[];
}

const INDUSTRY_FAMILIES: readonly IndustryFamily[] = [
  { id: "saas", label: "SaaS", evidenceTerms: ["saas market", "software pricing", "product-led growth"], planTerms: ["saas operating plan", "software growth plan"], skillIds: ["research", "technical-writing"] },
  { id: "ecommerce", label: "E-commerce", evidenceTerms: ["e-commerce market", "online retail", "merchandising research"], planTerms: ["e-commerce operating plan", "retail growth plan"], skillIds: ["research", "technical-writing"] },
  { id: "healthcare-operations", label: "Healthcare operations", evidenceTerms: ["healthcare operations evidence", "care delivery research", "health services brief"], planTerms: ["healthcare operating plan", "care delivery plan"], skillIds: ["research", "architecture"] },
  { id: "financial-services", label: "Financial services", evidenceTerms: ["fintech market", "financial services research", "finance evidence brief"], planTerms: ["fintech operating plan", "financial services plan"], skillIds: ["research", "architecture"] },
  { id: "education", label: "Education", evidenceTerms: ["education market", "learning research", "education evidence brief"], planTerms: ["education operating plan", "learning program plan"], skillIds: ["research", "technical-writing"] },
  { id: "real-estate", label: "Real estate", evidenceTerms: ["real estate market", "property research", "real estate evidence brief"], planTerms: ["real estate operating plan", "property growth plan"], skillIds: ["research", "technical-writing"] },
  { id: "manufacturing", label: "Manufacturing", evidenceTerms: ["manufacturing research", "industrial market", "manufacturing evidence brief"], planTerms: ["manufacturing operating plan", "factory workflow plan"], skillIds: ["research", "architecture"] },
  { id: "nonprofit", label: "Nonprofit", evidenceTerms: ["nonprofit research", "grant landscape", "nonprofit evidence brief"], planTerms: ["nonprofit operating plan", "grant program plan"], skillIds: ["research", "technical-writing"] },
  { id: "agency", label: "Agency", evidenceTerms: ["agency market research", "client services research", "agency evidence brief"], planTerms: ["agency operating plan", "client services plan"], skillIds: ["research", "technical-writing"] },
  { id: "hospitality", label: "Hospitality", evidenceTerms: ["hospitality research", "guest experience evidence", "hospitality market"], planTerms: ["hospitality operating plan", "guest experience plan"], skillIds: ["research", "technical-writing"] },
  { id: "legal-operations", label: "Legal operations", evidenceTerms: ["legal operations research", "matter workflow evidence", "legal services brief"], planTerms: ["legal operations plan", "matter workflow plan"], skillIds: ["research", "architecture"] },
  { id: "cybersecurity-readiness", label: "Cybersecurity readiness", evidenceTerms: ["cybersecurity research", "security readiness evidence", "security controls brief"], planTerms: ["cybersecurity readiness plan", "security operations plan"], skillIds: ["research", "architecture"] },
  { id: "media-production", label: "Media production", evidenceTerms: ["media market research", "editorial evidence", "media production brief"], planTerms: ["media production plan", "editorial operating plan"], skillIds: ["research", "technical-writing"] },
  { id: "developer-tools", label: "Developer tools", evidenceTerms: ["developer tools research", "api adoption research", "developer platform evidence"], planTerms: ["developer tools plan", "api adoption plan"], skillIds: ["research", "architecture"] },
] as const;

function compileIndustryPlaybooks(family: IndustryFamily): readonly ClientPlaybook[] {
  return [
    {
      id: `industry-${family.id}-evidence`,
      label: `${family.label} evidence brief`,
      description: `Build a cited, confidence-marked evidence brief for ${family.label.toLowerCase()} decisions using approved public or tenant sources.`,
      intents: family.evidenceTerms,
      eligibleCapabilities: ["research"],
      skillIds: family.skillIds,
      requiredTraits: RESEARCH_TRAITS,
      riskClass: "review",
      approval: "review-before-apply",
      outputType: `${family.id}-evidence-brief`,
      supportedSurfaces: RESEARCH_SURFACES,
    },
    {
      id: `industry-${family.id}-plan`,
      label: `${family.label} operating plan`,
      description: `Turn a ${family.label.toLowerCase()} outcome into a bounded operating plan with owners, checkpoints, risks, and reviewable next steps.`,
      intents: family.planTerms,
      eligibleCapabilities: ["orchestration"],
      skillIds: family.skillIds,
      requiredTraits: BASE_TRAITS,
      riskClass: "low",
      approval: "none",
      outputType: `${family.id}-operating-plan`,
      supportedSurfaces: PLAN_SURFACES,
    },
  ];
}

export const NATIVE_INDUSTRY_PLAYBOOKS: readonly ClientPlaybook[] = INDUSTRY_FAMILIES.flatMap(compileIndustryPlaybooks);

export const NATIVE_INDUSTRY_FAMILY_COUNT = INDUSTRY_FAMILIES.length;
