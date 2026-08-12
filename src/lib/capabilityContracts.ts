/**
 * Shared, dependency-free envelopes for governed Veloce capabilities.
 *
 * This module is deliberately safe to import from client-facing code. It does
 * not read secrets, call providers, or decide whether a capability is enabled;
 * it only defines the record shape and validates the boundary that every local
 * worker, hosted worker, and client adapter must share.
 */

export const CAPABILITY_CONTRACT_VERSION = "v96" as const;

export const GOVERNED_CAPABILITIES = [
  "notebook",
  "research",
  "seo",
  "context-compiler",
  "output-quality",
  "visual-qa",
  "media",
  "video-generation",
  "provider-routing",
  "resumable-worktree",
  "security-assessment",
  "voice",
  "communications",
] as const;

export type GovernedCapability = (typeof GOVERNED_CAPABILITIES)[number];
export type CapabilityStatus = "queued" | "running" | "paused" | "succeeded" | "failed" | "discarded";
export type CapabilityApprovalRequirement = "none" | "review-before-apply" | "human-before-external-action";

export interface CapabilityBudget {
  maxMicros: number;
  reservedMicros?: number;
  spentMicros?: number;
}

export interface CapabilityApproval {
  required: CapabilityApprovalRequirement;
  status: "not_required" | "pending" | "approved" | "rejected";
  approvalId?: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface CapabilityArtifactReference {
  id: string;
  kind: string;
  tenantSlug: string;
  checksum?: string;
}

export interface CapabilityCitationReference {
  id: string;
  url: string;
  retrievedAt: string;
  evidence: string;
}

export type CapabilityFailureDisposition = "blocked" | "review" | "partial" | "succeeded";

export interface CapabilityTraitSnapshot {
  version: string;
  capability: string;
  provider: string | null;
  surface: string | null;
  traits: readonly {
    id: string;
    version: string;
    required: boolean;
    onFailure: Exclude<CapabilityFailureDisposition, "succeeded">;
    evidenceKind: string;
  }[];
  sourceReferences: readonly {
    id: string;
    sourceUrl: string;
    sourceCommit: string;
    license: string;
  }[];
  policy: {
    failClosedTraits: readonly string[];
    reviewTraits: readonly string[];
    partialTraits: readonly string[];
  };
}

export interface CapabilityEvidenceReference {
  id: string;
  traitId: string;
  status: CapabilityFailureDisposition;
  message?: string;
  recordedAt: string;
}

export interface CapabilityEnvelope {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  capability: GovernedCapability;
  tenantSlug: string;
  requestId: string;
  idempotencyKey: string;
  status: CapabilityStatus;
  budget: CapabilityBudget;
  approval: CapabilityApproval;
  artifactIds: readonly string[];
  citationIds: readonly string[];
  traitSnapshot: CapabilityTraitSnapshot;
  evidence: readonly CapabilityEvidenceReference[];
  failureDisposition: CapabilityFailureDisposition;
  createdAt: string;
  updatedAt: string;
}

const TENANT_SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
const REQUEST_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,127}$/;
const IDEMPOTENCY_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,179}$/;

export function isValidCapabilityTenantSlug(value: string) {
  return TENANT_SLUG.test(value);
}

export function isValidCapabilityRequestId(value: string) {
  return REQUEST_ID.test(value);
}

export function isValidCapabilityIdempotencyKey(value: string) {
  return IDEMPOTENCY_KEY.test(value);
}

/**
 * Stable non-cryptographic identity for retries. It is not a secret or a
 * security token; it only gives equivalent requests the same record key.
 */
export function deterministicCapabilityIdempotencyKey(namespace: string, parts: readonly string[]) {
  const input = `${namespace}|${parts.join("|")}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${namespace}-${hash.toString(36).padStart(7, "0")}`;
}

export function validateCapabilityBudget(budget: Partial<CapabilityBudget> | undefined) {
  const errors: string[] = [];
  const maxMicros = budget?.maxMicros;
  if (!Number.isSafeInteger(maxMicros) || (maxMicros ?? -1) < 0) errors.push("budget.maxMicros must be a non-negative safe integer");
  for (const key of ["reservedMicros", "spentMicros"] as const) {
    const value = budget?.[key];
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) errors.push(`budget.${key} must be a non-negative safe integer`);
  }
  const comparisonMaxMicros = maxMicros ?? 0;
  if ((budget?.reservedMicros ?? 0) > comparisonMaxMicros) errors.push("budget.reservedMicros cannot exceed maxMicros");
  if ((budget?.spentMicros ?? 0) > comparisonMaxMicros) errors.push("budget.spentMicros cannot exceed maxMicros");
  return errors;
}

export function validateCapabilityApproval(approval: Partial<CapabilityApproval> | undefined) {
  const errors: string[] = [];
  if (!approval || !approval.required) errors.push("approval.required is required");
  if (!approval || !approval.status) errors.push("approval.status is required");
  if (approval?.status === "approved") {
    if (!approval.approvalId?.trim()) errors.push("approved capability requires approvalId");
    if (!approval.approvedBy?.trim()) errors.push("approved capability requires approvedBy");
    if (!approval.approvedAt || !Number.isFinite(Date.parse(approval.approvedAt))) errors.push("approved capability requires a valid approvedAt");
  }
  return errors;
}

export function validateCapabilityEnvelope(input: Partial<CapabilityEnvelope>) {
  const errors: string[] = [];
  if (input.contractVersion !== CAPABILITY_CONTRACT_VERSION) errors.push("contractVersion must be v96");
  if (!input.capability || !(GOVERNED_CAPABILITIES as readonly string[]).includes(input.capability)) errors.push("capability is not governed");
  if (!input.tenantSlug || !isValidCapabilityTenantSlug(input.tenantSlug)) errors.push("tenantSlug is invalid");
  if (!input.requestId || !isValidCapabilityRequestId(input.requestId)) errors.push("requestId is invalid");
  if (!input.idempotencyKey || !isValidCapabilityIdempotencyKey(input.idempotencyKey)) errors.push("idempotencyKey is invalid");
  if (!input.status || !(["queued", "running", "paused", "succeeded", "failed", "discarded"] as readonly string[]).includes(input.status)) errors.push("status is invalid");
  errors.push(...validateCapabilityBudget(input.budget));
  errors.push(...validateCapabilityApproval(input.approval));
  if (!Array.isArray(input.artifactIds) || input.artifactIds.some((id) => typeof id !== "string" || !id.trim())) errors.push("artifactIds must contain non-empty strings");
  if (!Array.isArray(input.citationIds) || input.citationIds.some((id) => typeof id !== "string" || !id.trim())) errors.push("citationIds must contain non-empty strings");
  if (!input.traitSnapshot || typeof input.traitSnapshot !== "object") errors.push("traitSnapshot is required");
  if (!Array.isArray(input.evidence)) errors.push("evidence must be an array");
  if (!input.failureDisposition || !( ["blocked", "review", "partial", "succeeded"] as readonly string[]).includes(input.failureDisposition)) errors.push("failureDisposition is invalid");
  if (!input.createdAt || !Number.isFinite(Date.parse(input.createdAt))) errors.push("createdAt must be a valid timestamp");
  if (!input.updatedAt || !Number.isFinite(Date.parse(input.updatedAt))) errors.push("updatedAt must be a valid timestamp");
  return errors;
}
