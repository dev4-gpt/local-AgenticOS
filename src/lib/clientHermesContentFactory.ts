import {
  HERMES_CONTENT_FACTORY_RUN_STATUSES,
  HERMES_CONTENT_FACTORY_STEPS,
  canPublishHermesContentFactoryPlan,
  createHermesContentFactoryPlan,
  type HermesContentFactoryApproval,
  type HermesContentFactoryPlan,
  type HermesContentFactoryRunStatus,
  type HermesContentFactoryStageRecord,
  type HermesContentFactoryType,
  type HermesContentFactoryQualityReport,
  type HermesContentFactoryCitation,
  type HermesContentFactoryDeliveryRecord,
} from "@/lib/hermesContentFactory";

export const HERMES_FACTORY_TABLE = "client_hermes_content_factory_runs";

export type ClientHermesContentFactoryRun = {
  id: string;
  tenantSlug: string;
  createdBy: string | null;
  workflowId: string;
  idempotencyKey: string;
  plan: HermesContentFactoryPlan;
  stages: HermesContentFactoryStageRecord[];
  citations: HermesContentFactoryCitation[];
  qualityReport: HermesContentFactoryQualityReport | null;
  approval: HermesContentFactoryApproval | null;
  delivery: HermesContentFactoryDeliveryRecord | null;
  status: HermesContentFactoryRunStatus;
  currentStage: string;
  jobId: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

function text(value: unknown, max = 4000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function nullableText(value: unknown, max = 4000) {
  const output = text(value, max);
  return output || null;
}

function json<T>(value: unknown, fallback: T): T {
  return value && typeof value === "object" ? value as T : fallback;
}

export function initialHermesFactoryStages(plan: HermesContentFactoryPlan): HermesContentFactoryStageRecord[] {
  return HERMES_CONTENT_FACTORY_STEPS.map((step) => ({
    workflowId: plan.workflowId,
    tenantSlug: plan.tenantSlug,
    stage: step.id,
    status: "pending",
  }));
}

export function normalizeClientHermesFactoryRun(row: Record<string, unknown>): ClientHermesContentFactoryRun {
  const plan = json<HermesContentFactoryPlan>(row.plan, createHermesContentFactoryPlan({
    tenantSlug: text(row.tenant_slug, 63),
    brief: text(row.brief, 4000) || "Placeholder brief for an invalid stored row.",
    contentType: (text(row.content_type, 20) || "article") as HermesContentFactoryType,
    workflowId: text(row.workflow_id, 100) || "hermes-content-invalid",
  }));
  const status = text(row.status, 24);
  return {
    id: text(row.id, 36),
    tenantSlug: text(row.tenant_slug, 63),
    createdBy: nullableText(row.created_by, 36),
    workflowId: text(row.workflow_id, 100),
    idempotencyKey: text(row.idempotency_key, 128),
    plan,
    stages: Array.isArray(row.stages) ? row.stages as HermesContentFactoryStageRecord[] : initialHermesFactoryStages(plan),
    citations: Array.isArray(row.citations) ? row.citations as HermesContentFactoryCitation[] : [],
    qualityReport: row.quality_report && typeof row.quality_report === "object" ? row.quality_report as HermesContentFactoryQualityReport : null,
    approval: row.approval && typeof row.approval === "object" ? row.approval as HermesContentFactoryApproval : null,
    delivery: row.delivery && typeof row.delivery === "object" ? row.delivery as HermesContentFactoryDeliveryRecord : null,
    status: (HERMES_CONTENT_FACTORY_RUN_STATUSES as readonly string[]).includes(status) ? status as HermesContentFactoryRunStatus : "failed",
    currentStage: text(row.current_stage, 20) || "brief",
    jobId: nullableText(row.job_id, 36),
    errorCode: nullableText(row.error_code, 120),
    createdAt: text(row.created_at, 40),
    updatedAt: text(row.updated_at, 40),
  };
}

export function hermesFactoryCanPublish(run: ClientHermesContentFactoryRun) {
  return canPublishHermesContentFactoryPlan(run.plan, run.approval);
}

export function hermesFactoryDeliveryReplay(run: ClientHermesContentFactoryRun) {
  return run.status === "published" && run.delivery !== null;
}

export function hermesFactoryApprovalPatch(run: ClientHermesContentFactoryRun, approvedBy: string, approvedAt = new Date().toISOString()) {
  const approval: HermesContentFactoryApproval = {
    id: `approval-${run.id}`,
    workflowId: run.workflowId,
    tenantSlug: run.tenantSlug,
    approvedBy: approvedBy.trim(),
    approvedAt,
  };
  if (!canPublishHermesContentFactoryPlan(run.plan, approval)) return null;
  return { approval, status: "approved" as const, current_stage: "publish" };
}
