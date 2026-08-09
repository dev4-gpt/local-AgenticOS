/**
 * Stable, dependency-free contracts for the first v90 infrastructure slice.
 *
 * These types deliberately describe inputs and outputs rather than runtimes.
 * A local worker, a future Cloud Run adapter, and a GPU host can implement the
 * same contract without importing their dependencies into the Next.js app.
 */

export const V90_CONTRACT_VERSION = "v90" as const;

export type V90BudgetClass = "small" | "standard" | "heavy";
export type V90ApprovalRequirement = "none" | "review-before-apply" | "human-before-external-action";

export interface V90SkillManifest {
  id: string;
  label: string;
  sourceRepository: string;
  sourceCommit: string;
  license: string;
  supportedSurfaces: readonly string[];
  allowedContext: readonly string[];
  allowedTools: readonly string[];
  modelLane: "local" | "approved-provider";
  budgetClass: V90BudgetClass;
  deliverable: {
    kind: string;
    requiredFields: readonly string[];
  };
  approval: V90ApprovalRequirement;
}

export interface V90StructuredResearchRequest {
  contractVersion: typeof V90_CONTRACT_VERSION;
  tenantSlug: string;
  provider: "scrapegraphai" | "firecrawl" | "agentreach" | "other";
  sourceUrls: readonly string[];
  fields: readonly string[];
  maxPages: number;
  maxDepth: number;
}

export interface V90ResearchCitation {
  url: string;
  title?: string;
  retrievedAt: string;
  evidence: string;
}

export interface V90StructuredResearchRecord {
  contractVersion: typeof V90_CONTRACT_VERSION;
  id: string;
  tenantSlug: string;
  provider: V90StructuredResearchRequest["provider"];
  sourceUrl: string;
  retrievedAt: string;
  fields: Readonly<Record<string, string | number | boolean | null>>;
  citations: readonly V90ResearchCitation[];
  confidence: number;
  status: "complete" | "partial" | "failed";
  failureReason?: string;
}

export interface V90VisualQaFinding {
  code: string;
  severity: "info" | "warning" | "error";
  frame: number;
  confidence: number;
  message: string;
}

export interface V90VisualQaReport {
  contractVersion: typeof V90_CONTRACT_VERSION;
  tenantSlug: string;
  artifactId: string;
  worker: "supervision" | "other";
  framesSampled: number;
  runtimeMs: number;
  findings: readonly V90VisualQaFinding[];
  warnings: readonly string[];
  status: "passed" | "review" | "failed";
}

export interface V90VideoGenerationRequest {
  contractVersion: typeof V90_CONTRACT_VERSION;
  tenantSlug: string;
  provider: "skyreels-v2" | "other";
  prompt: string;
  seed?: number;
  sourceFrameArtifactIds: readonly string[];
  durationSeconds: number;
  width: number;
  height: number;
  budgetMicros: number;
}

export interface V90VideoGenerationResult {
  contractVersion: typeof V90_CONTRACT_VERSION;
  requestId: string;
  status: "queued" | "succeeded" | "failed";
  artifactId?: string;
  provider: V90VideoGenerationRequest["provider"];
  warnings: readonly string[];
  errorCode?: string;
}

export interface V90ResumableWorktreeRun {
  contractVersion: typeof V90_CONTRACT_VERSION;
  runId: string;
  goal: string;
  worktreeRef: string;
  status: "queued" | "running" | "paused" | "succeeded" | "failed" | "discarded";
  approval: "pending" | "approved" | "rejected";
  budget: {
    maxTokens: number;
    maxMinutes: number;
  };
  retainedOutputIds: readonly string[];
}

const PRIVATE_IPV4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|0\.)/;

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost"
    || host === "metadata.google.internal"
    || host.endsWith(".local")
    || PRIVATE_IPV4.test(host)
    || host === "::1"
    || host === "::"
    || host.startsWith("fc")
    || host.startsWith("fd")
    || host.startsWith("fe80:");
}

/**
 * Syntactic URL gate for the adapter boundary. The worker must still resolve
 * DNS and reject private results immediately before making a request.
 */
export function isAllowedV90ResearchUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && !isPrivateHost(url.hostname);
  } catch {
    return false;
  }
}

export function validateV90ResearchRequest(input: Partial<V90StructuredResearchRequest>) {
  const errors: string[] = [];
  if (input.contractVersion !== V90_CONTRACT_VERSION) errors.push("contractVersion must be v90");
  if (!input.tenantSlug || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.tenantSlug)) errors.push("tenantSlug is invalid");
  if (!input.provider) errors.push("provider is required");
  if (!Array.isArray(input.sourceUrls) || input.sourceUrls.length < 1 || input.sourceUrls.length > 8) errors.push("sourceUrls must contain 1 to 8 URLs");
  if (Array.isArray(input.sourceUrls)) {
    for (const url of input.sourceUrls) if (typeof url !== "string" || !isAllowedV90ResearchUrl(url)) errors.push(`source URL is not an allowed public https URL: ${String(url)}`);
  }
  if (!Array.isArray(input.fields) || input.fields.length < 1 || input.fields.length > 32) errors.push("fields must contain 1 to 32 names");
  if (!Number.isInteger(input.maxPages) || (input.maxPages ?? 0) < 1 || (input.maxPages ?? 0) > 20) errors.push("maxPages must be between 1 and 20");
  if (!Number.isInteger(input.maxDepth) || (input.maxDepth ?? -1) < 0 || (input.maxDepth ?? 99) > 3) errors.push("maxDepth must be between 0 and 3");
  return errors;
}

export function normalizeV90ResearchRecord(input: V90StructuredResearchRecord): V90StructuredResearchRecord | null {
  if (input.contractVersion !== V90_CONTRACT_VERSION || !input.id || !input.tenantSlug || !isAllowedV90ResearchUrl(input.sourceUrl)) return null;
  if (!Number.isFinite(input.confidence)) return null;
  if (!input.citations.length && input.status !== "failed") return null;
  if (input.status === "failed" && !input.failureReason) return null;
  if (input.citations.some((citation) => !isAllowedV90ResearchUrl(citation.url) || !citation.evidence.trim() || !citation.retrievedAt)) return null;
  return {
    ...input,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    fields: Object.freeze({ ...input.fields }),
    citations: input.citations.map((citation) => ({ ...citation })),
  } as V90StructuredResearchRecord;
}
