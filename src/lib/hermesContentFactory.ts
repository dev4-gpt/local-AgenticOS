import { V96_CONTRACT_VERSION } from "./v96Contracts";

export const HERMES_CONTENT_FACTORY_SOURCE = "https://rajaashok.github.io/hermes-content-factory-workflow";

export type HermesContentFactoryStage =
  | "brief"
  | "research"
  | "plan"
  | "draft"
  | "assets"
  | "quality"
  | "approval"
  | "publish";

export const HERMES_CONTENT_TYPES = ["article", "social", "email", "video", "campaign"] as const;
export type HermesContentFactoryType = (typeof HERMES_CONTENT_TYPES)[number];
export const HERMES_CONTENT_FACTORY_RUN_STATUSES = ["queued", "running", "awaiting_approval", "approved", "published", "failed"] as const;
export type HermesContentFactoryRunStatus = (typeof HERMES_CONTENT_FACTORY_RUN_STATUSES)[number];

export interface HermesContentFactoryStep {
  id: HermesContentFactoryStage;
  owner: "client" | "hermes" | "research" | "media" | "review" | "delivery";
  required: boolean;
  approvalRequired: boolean;
  output: string;
}

export const HERMES_CONTENT_FACTORY_STEPS: readonly HermesContentFactoryStep[] = [
  { id: "brief", owner: "client", required: true, approvalRequired: false, output: "content_brief" },
  { id: "research", owner: "research", required: true, approvalRequired: false, output: "citation_record" },
  { id: "plan", owner: "hermes", required: true, approvalRequired: false, output: "content_outline" },
  { id: "draft", owner: "hermes", required: true, approvalRequired: false, output: "draft_artifact" },
  { id: "assets", owner: "media", required: false, approvalRequired: false, output: "media_artifact_set" },
  { id: "quality", owner: "review", required: true, approvalRequired: false, output: "quality_report" },
  { id: "approval", owner: "review", required: true, approvalRequired: true, output: "approval_record" },
  { id: "publish", owner: "delivery", required: true, approvalRequired: true, output: "delivery_record" },
];

export interface HermesContentFactoryPlan {
  contractVersion: typeof V96_CONTRACT_VERSION;
  workflowId: string;
  tenantSlug: string;
  brief: string;
  contentType: HermesContentFactoryType;
  stages: readonly HermesContentFactoryStage[];
  autoPublish: false;
  source: typeof HERMES_CONTENT_FACTORY_SOURCE;
}

/**
 * An approval is a record about one workflow, not a boolean. A bare `true`
 * cannot say *what* was approved, so it can be carried from one workflow to
 * another — which is exactly the confusion an approval gate exists to prevent.
 */
export interface HermesContentFactoryApproval {
  id: string;
  workflowId: string;
  tenantSlug: string;
  approvedBy: string;
  approvedAt: string;
}

export interface HermesContentFactoryCitation {
  id: string;
  url: string;
  title?: string;
  retrievedAt: string;
  evidence: string;
}

export interface HermesContentFactoryQualityReport {
  id: string;
  workflowId: string;
  tenantSlug: string;
  passed: boolean;
  score: number;
  citationCount: number;
  findings: readonly string[];
  checkedAt: string;
}

export interface HermesContentFactoryStageRecord {
  workflowId: string;
  tenantSlug: string;
  stage: HermesContentFactoryStage;
  status: "pending" | "running" | "complete" | "failed";
  outputRecordId?: string;
  artifactId?: string;
  citationRecordId?: string;
  qualityReportId?: string;
  errorCode?: string;
}

export interface HermesContentFactoryDeliveryRecord {
  id: string;
  workflowId: string;
  tenantSlug: string;
  destination: string;
  status: "blocked" | "queued" | "recorded";
  approvalId?: string;
  artifactId?: string;
}

function validTenantSlug(value: string) {
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(value);
}

function validWorkflowId(value: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,99}$/.test(value);
}

function validIdempotencyKey(value: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
}

/**
 * FNV-1a. Deliberately not node:crypto — this is contract code that may be
 * imported from a client component, and the identifier only needs to be stable
 * and collision-resistant enough to deduplicate a retry.
 */
function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

export function createHermesContentFactoryPlan(input: {
  tenantSlug: string;
  brief: string;
  contentType?: HermesContentFactoryType;
  workflowId?: string;
  idempotencyKey?: string;
}): HermesContentFactoryPlan {
  const tenantSlug = input.tenantSlug.trim();
  const brief = input.brief.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 4000);
  const contentType = input.contentType || "article";
  if (!validTenantSlug(tenantSlug)) throw new Error("tenantSlug is invalid");
  if (brief.length < 12) throw new Error("content brief is too short");
  if (!(HERMES_CONTENT_TYPES as readonly string[]).includes(contentType)) throw new Error("contentType is invalid");
  const idempotencyKey = input.idempotencyKey?.trim() || "default";
  if (!validIdempotencyKey(idempotencyKey)) throw new Error("idempotencyKey is invalid");

  // This used to default to `hermes-content-${Date.now()}`, a new value on every
  // call. Retrying a submission therefore produced a second workflow with a
  // second brief, draft and delivery action — precisely the duplication the
  // plan's own exit gate forbids. Deriving the id from the tenant, content type
  // and brief makes an identical resubmission resolve to the identical
  // workflow, so a retry is idempotent by construction rather than by the
  // caller remembering to pass an id.
  const workflowId = (input.workflowId?.trim()
    || `hermes-content-${tenantSlug}-${stableHash(`${tenantSlug}|${contentType}|${idempotencyKey}|${brief}`)}`).slice(0, 100);
  if (!workflowId || !validWorkflowId(workflowId)) throw new Error("workflowId is invalid");

  return {
    contractVersion: V96_CONTRACT_VERSION,
    workflowId,
    tenantSlug,
    brief,
    contentType,
    stages: HERMES_CONTENT_FACTORY_STEPS.map((step) => step.id),
    autoPublish: false,
    source: HERMES_CONTENT_FACTORY_SOURCE,
  };
}

export function canPublishHermesContentFactoryPlan(plan: HermesContentFactoryPlan, approval: HermesContentFactoryApproval | null) {
  return plan.autoPublish === false
    && Boolean(approval)
    && (approval?.id ?? "").trim().length > 0
    && approval?.workflowId === plan.workflowId
    && approval.tenantSlug === plan.tenantSlug
    && approval.approvedBy.trim().length > 0
    && Number.isFinite(Date.parse(approval.approvedAt));
}

export function hermesContentFactoryIdempotencyKey(input: {
  tenantSlug: string;
  brief: string;
  contentType?: HermesContentFactoryType;
  idempotencyKey?: string;
}) {
  return `hermes-content-${stableHash(`${input.tenantSlug.trim()}|${input.contentType || "article"}|${input.idempotencyKey?.trim() || "default"}|${input.brief.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 4000)}`)}`;
}

export function hermesContentFactoryPrompt(plan: HermesContentFactoryPlan, stage: HermesContentFactoryStage) {
  const step = HERMES_CONTENT_FACTORY_STEPS.find((candidate) => candidate.id === stage);
  if (!step) throw new Error("Unknown Hermes content-factory stage");
  return [
    "You are Hermes operating one bounded Veloce content-factory stage.",
    `Tenant: ${plan.tenantSlug}`,
    `Workflow: ${plan.workflowId}`,
    `Stage: ${step.id}`,
    `Required output: ${step.output}`,
    `Content type: ${plan.contentType}`,
    "Never publish, send, or contact an external destination from this prompt.",
    "Return structured work for the next stage and preserve citations, approvals, and tenant scope.",
    `Brief: ${plan.brief}`,
  ].join("\n");
}
