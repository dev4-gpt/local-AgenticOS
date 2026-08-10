/**
 * Stable, dependency-free contracts for the first v96 infrastructure slice.
 *
 * These types deliberately describe inputs and outputs rather than runtimes.
 * A local worker, a future Cloud Run adapter, and a GPU host can implement the
 * same contract without importing their dependencies into the Next.js app.
 */

export const V96_CONTRACT_VERSION = "v96" as const;

export type V96BudgetClass = "small" | "standard" | "heavy";
export type V96ApprovalRequirement = "none" | "review-before-apply" | "human-before-external-action";

export interface V96SkillManifest {
  id: string;
  label: string;
  sourceRepository: string;
  sourceCommit: string;
  license: string;
  supportedSurfaces: readonly string[];
  allowedContext: readonly string[];
  allowedTools: readonly string[];
  modelLane: "local" | "approved-provider";
  budgetClass: V96BudgetClass;
  deliverable: {
    kind: string;
    requiredFields: readonly string[];
  };
  approval: V96ApprovalRequirement;
}

export interface V96StructuredResearchRequest {
  contractVersion: typeof V96_CONTRACT_VERSION;
  tenantSlug: string;
  provider: "scrapegraphai" | "firecrawl" | "agentreach" | "other";
  sourceUrls: readonly string[];
  fields: readonly string[];
  maxPages: number;
  maxDepth: number;
}

export interface V96ResearchCitation {
  url: string;
  title?: string;
  retrievedAt: string;
  evidence: string;
}

export interface V96StructuredResearchRecord {
  contractVersion: typeof V96_CONTRACT_VERSION;
  id: string;
  tenantSlug: string;
  provider: V96StructuredResearchRequest["provider"];
  sourceUrl: string;
  retrievedAt: string;
  fields: Readonly<Record<string, string | number | boolean | null>>;
  citations: readonly V96ResearchCitation[];
  confidence: number;
  status: "complete" | "partial" | "failed";
  failureReason?: string;
}

export interface V96VisualQaFinding {
  code: string;
  severity: "info" | "warning" | "error";
  frame: number;
  confidence: number;
  message: string;
}

export interface V96VisualQaReport {
  contractVersion: typeof V96_CONTRACT_VERSION;
  tenantSlug: string;
  artifactId: string;
  worker: "supervision" | "other";
  framesSampled: number;
  runtimeMs: number;
  findings: readonly V96VisualQaFinding[];
  warnings: readonly string[];
  status: "passed" | "review" | "failed";
}

export interface V96VideoGenerationRequest {
  contractVersion: typeof V96_CONTRACT_VERSION;
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

export interface V96VideoGenerationResult {
  contractVersion: typeof V96_CONTRACT_VERSION;
  requestId: string;
  status: "queued" | "succeeded" | "failed";
  artifactId?: string;
  provider: V96VideoGenerationRequest["provider"];
  warnings: readonly string[];
  errorCode?: string;
}

export interface V96ResumableWorktreeRun {
  contractVersion: typeof V96_CONTRACT_VERSION;
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
export function isAllowedV96ResearchUrl(value: string) {
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

export function validateV96ResearchRequest(input: Partial<V96StructuredResearchRequest>) {
  const errors: string[] = [];
  if (input.contractVersion !== V96_CONTRACT_VERSION) errors.push("contractVersion must be v96");
  if (!input.tenantSlug || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.tenantSlug)) errors.push("tenantSlug is invalid");
  if (!input.provider) errors.push("provider is required");
  if (!Array.isArray(input.sourceUrls) || input.sourceUrls.length < 1 || input.sourceUrls.length > 8) errors.push("sourceUrls must contain 1 to 8 URLs");
  if (Array.isArray(input.sourceUrls)) {
    for (const url of input.sourceUrls) if (typeof url !== "string" || !isAllowedV96ResearchUrl(url)) errors.push(`source URL is not an allowed public https URL: ${String(url)}`);
  }
  if (!Array.isArray(input.fields) || input.fields.length < 1 || input.fields.length > 32) errors.push("fields must contain 1 to 32 names");
  if (!Number.isInteger(input.maxPages) || (input.maxPages ?? 0) < 1 || (input.maxPages ?? 0) > 20) errors.push("maxPages must be between 1 and 20");
  if (!Number.isInteger(input.maxDepth) || (input.maxDepth ?? -1) < 0 || (input.maxDepth ?? 99) > 3) errors.push("maxDepth must be between 0 and 3");
  return errors;
}

/**
 * The closed vocabulary a curated role may draw on.
 *
 * Agency Agents is a source library, not a second runtime, so importing a role
 * must never widen what the platform can do. That is the skill pack's exit gate
 * in the STAR plan: a role improves a task *without increasing tool
 * permissions*. Without a closed list, `allowedTools` is free text and a future
 * manifest could grant `execute-shell` past every existing check.
 *
 * Every verb here is read-only, a test run, or writing a reviewable
 * deliverable. Nothing executes a shell, reaches the network directly, reads
 * credentials, or mutates tenant data. Adding an entry is a deliberate
 * permission grant — argue for it on its own merits rather than letting it
 * arrive attached to a new role.
 */
export const V96_PERMITTED_SKILL_TOOLS = [
  "read-artifacts",
  "read-files",
  "read-preview",
  "read-public-source",
  "run-tests",
  "write-citations",
  "write-draft",
  "write-review",
  "write-storyboard",
  "write-worktree",
] as const;

/**
 * Surfaces a role may claim. A role advertising a surface that does not exist
 * is a control a client can see and never reach, so the list is closed too.
 */
export const V96_PERMITTED_SKILL_SURFACES = [
  "agent-kanban",
  "agent-room",
  "flow-lab",
  "loop",
  "memory",
  "openmontage",
  "product-experience",
  "quality-review",
  "radar",
  "seo",
  "video",
  "web-studio",
] as const;

const PERMITTED_TOOLS = new Set<string>(V96_PERMITTED_SKILL_TOOLS);
const PERMITTED_SURFACES = new Set<string>(V96_PERMITTED_SKILL_SURFACES);

/**
 * Validates one curated role manifest. Returns the reasons it is unpublishable,
 * empty when it is sound.
 */
export function validateV96SkillManifest(input: V96SkillManifest) {
  const errors: string[] = [];
  if (!input.id || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.id)) errors.push("id must be a lowercase slug");
  if (!input.label?.trim()) errors.push("label is required");
  // Provenance is what makes a role auditable rather than something a client
  // takes on trust, so it is required, not merely encouraged.
  if (!/^https:\/\/[^\s]+$/.test(input.sourceRepository ?? "")) errors.push("sourceRepository must be an https URL");
  if (!input.sourceCommit || input.sourceCommit.length < 5) errors.push("sourceCommit must be a pinned revision");
  if (!input.license?.trim()) errors.push("license is required");
  if (!input.supportedSurfaces?.length) errors.push("supportedSurfaces must not be empty");
  for (const surface of input.supportedSurfaces ?? []) {
    if (!PERMITTED_SURFACES.has(surface)) errors.push(`surface is not a real Veloce surface: ${surface}`);
  }
  if (!input.allowedContext?.length) errors.push("allowedContext must not be empty");
  if (!input.allowedTools?.length) errors.push("allowedTools must not be empty");
  for (const tool of input.allowedTools ?? []) {
    if (!PERMITTED_TOOLS.has(tool)) errors.push(`tool is outside the permitted vocabulary: ${tool}`);
  }
  if (!input.deliverable?.kind) errors.push("deliverable.kind is required");
  if (!input.deliverable?.requiredFields?.length) errors.push("deliverable.requiredFields must not be empty");
  return errors;
}

export function normalizeV96ResearchRecord(input: V96StructuredResearchRecord): V96StructuredResearchRecord | null {
  if (input.contractVersion !== V96_CONTRACT_VERSION || !input.id || !input.tenantSlug || !isAllowedV96ResearchUrl(input.sourceUrl)) return null;
  if (!Number.isFinite(input.confidence)) return null;
  if (!input.citations.length && input.status !== "failed") return null;
  if (input.status === "failed" && !input.failureReason) return null;
  if (input.citations.some((citation) => !isAllowedV96ResearchUrl(citation.url) || !citation.evidence.trim() || !citation.retrievedAt)) return null;
  return {
    ...input,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    fields: Object.freeze({ ...input.fields }),
    citations: input.citations.map((citation) => ({ ...citation })),
  } as V96StructuredResearchRecord;
}
