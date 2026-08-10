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
  contentType: "article" | "social" | "email" | "video" | "campaign";
  stages: readonly HermesContentFactoryStage[];
  autoPublish: false;
  source: typeof HERMES_CONTENT_FACTORY_SOURCE;
}

function validTenantSlug(value: string) {
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(value);
}

export function createHermesContentFactoryPlan(input: {
  tenantSlug: string;
  brief: string;
  contentType?: HermesContentFactoryPlan["contentType"];
  workflowId?: string;
}): HermesContentFactoryPlan {
  const tenantSlug = input.tenantSlug.trim();
  const brief = input.brief.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 4000);
  const workflowId = (input.workflowId || `hermes-content-${Date.now()}`).trim().slice(0, 100);
  if (!validTenantSlug(tenantSlug)) throw new Error("tenantSlug is invalid");
  if (brief.length < 12) throw new Error("content brief is too short");
  if (!workflowId || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,99}$/.test(workflowId)) throw new Error("workflowId is invalid");

  return {
    contractVersion: V96_CONTRACT_VERSION,
    workflowId,
    tenantSlug,
    brief,
    contentType: input.contentType || "article",
    stages: HERMES_CONTENT_FACTORY_STEPS.map((step) => step.id),
    autoPublish: false,
    source: HERMES_CONTENT_FACTORY_SOURCE,
  };
}

export function canPublishHermesContentFactoryPlan(plan: HermesContentFactoryPlan, approvalRecorded: boolean) {
  return plan.autoPublish === false && approvalRecorded === true;
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
