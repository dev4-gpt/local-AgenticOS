import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServiceInsert, supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";

// This route is deliberately narrower than normal onboarding. It is for one
// disposable prepare-only control-plane proof, never for a customer tenant.
// Do not point it at an existing dogfood environment.
const canarySlug = "cp-canary-b903-rollback";
const canaryEmail = "aryamandev777@gmail.com";
const canaryProject = "veloce-agenticos-2026";
const canaryRegion = "asia-south1";
// Pin the canary to the same immutable runtime image currently serving the
// verified client runtime. Never inherit a dogfood image or mutable tag.
const canaryImage = "asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v3-3-295bdd3b5efe@sha256:8498b6fa61645b9168db74b1454738c6ffb1d33155303d52fd8f6a90dfe39765";
const expectedInventory = {
  serviceAccount: "veloce-cp-canary-b903-run@veloce-agenticos-2026.iam.gserviceaccount.com",
  storageBucket: "veloce-agenticos-2026-veloce-cp-canary-b903-rollback",
  taskQueue: "veloce-cp-canary-b903-rollback",
  secrets: ["veloce-cp-canary-b903-rollback-client-credential-inbox"],
  cloudRunService: null,
  cloudRunJobs: [],
};

function authorized(request: Request) {
  const expected = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim();
  const provided = request.headers.get("x-control-plane-secret")?.trim() || "";
  if (!expected || !provided) return false;
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(provided)); } catch { return false; }
}

function enabled() {
  return process.env.CONTROL_PLANE_CANARY_ENABLED?.trim() === "1";
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  // The dispatch gate protects only the mutating action. Status and cleanup
  // recording must remain available after we close that gate, otherwise a
  // completed canary cannot be evidenced or safely rolled back.
  if (body.action === "start") {
    if (!enabled()) return NextResponse.json({ ok: false, error: "canary_disabled" }, { status: 409 });
    return start(request, body.manifest);
  }
  if (body.action === "status") return status(body);
  if (body.action === "record_cleanup") return recordCleanup(body);
  return NextResponse.json({ ok: false, error: "unsupported_canary_action" }, { status: 400 });
}

async function start(request: Request, manifest: unknown) {
  if (!isFixedPrepareOnlyManifest(manifest)) return NextResponse.json({ ok: false, error: "canary_manifest_not_allowed" }, { status: 400 });
  const existing = await supabaseServiceSelect("client_onboarding_accounts", { tenant_slug: `eq.${canarySlug}` });
  if (!existing.ok) return NextResponse.json({ ok: false, error: "canary_lookup_failed" }, { status: 502 });
  if (existing.rows.length) return NextResponse.json({ ok: false, error: "canary_slug_already_exists" }, { status: 409 });
  const requestRecord = await supabaseServiceInsert("deployment_requests", {
    name: "Veloce Disposable Control Plane Canary",
    email: canaryEmail,
    company: "Veloce AgenticOS",
    role: "owner",
    workflow: "Disposable prepare-only control-plane provisioning canary; exact cloud cleanup evidence is mandatory.",
    credential_model: "client_owned",
    monthly_budget_cap: "10",
    approval_rule: "approve_external_actions",
    status: "manifest_review",
    billing_status: "not_started",
    idempotency_key: `canary-${canarySlug}-${Date.now()}`,
    source: "control-plane-canary",
    scope_inputs: {},
    meta: { canary: true, canarySlug, phase: "prepare", cleanupRequired: true, expectedInventory },
  });
  const requestId = typeof requestRecord.rows[0]?.id === "string" ? requestRecord.rows[0].id : "";
  if (!requestRecord.ok || !requestId) return NextResponse.json({ ok: false, error: "canary_request_create_failed" }, { status: 502 });
  const onboarding = await supabaseServiceInsert("client_onboarding_accounts", {
    request_id: requestId,
    email: canaryEmail,
    tenant_slug: canarySlug,
    status: "manifest_review",
    commercial_scope_status: "approved",
    commercial_scope_inputs: {},
    commercial_scope_recommendation: { canary: true },
    commercial_scope_quote: { canary: true, amount: 0 },
    commercial_scope_approved_by: "Aryaman",
    commercial_scope_approved_at: new Date().toISOString(),
  });
  const onboardingId = typeof onboarding.rows[0]?.id === "string" ? onboarding.rows[0].id : "";
  if (!onboarding.ok || !onboardingId) return NextResponse.json({ ok: false, error: "canary_onboarding_create_failed", requestId }, { status: 502 });
  const secret = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";
  const approval = await fetch(new URL("/api/onboarding/approve", request.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-control-plane-secret": secret },
    body: JSON.stringify({ requestId, manifestVersion: "control-plane-disposable-canary-v1", manifest }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  const approved = await approval?.json().catch(() => null) as Record<string, unknown> | null;
  if (approval?.status !== 200 || approved?.ok !== true || approved?.status !== "queued" || typeof approved?.runId !== "string") {
    return NextResponse.json({ ok: false, error: "canary_dispatch_failed", requestId, onboardingId }, { status: 502 });
  }
  return NextResponse.json({ ok: true, status: "queued", requestId, onboardingId, runId: approved.runId });
}

async function status(body: Record<string, unknown>) {
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const onboardingId = typeof body.onboardingId === "string" ? body.onboardingId.trim() : "";
  if (!runId || !onboardingId) return NextResponse.json({ ok: false, error: "missing_canary_identifiers" }, { status: 400 });
  const onboarding = await supabaseServiceSelect("client_onboarding_accounts", { id: `eq.${onboardingId}` });
  const runRows = await supabaseServiceSelect("client_provisioning_runs", { id: `eq.${runId}` });
  const account = onboarding.rows[0];
  const run = runRows.rows[0];
  if (!onboarding.ok || !runRows.ok || account?.tenant_slug !== canarySlug || run?.onboarding_id !== onboardingId) {
    return NextResponse.json({ ok: false, error: "canary_status_not_found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    onboarding: { id: onboardingId, status: account.status },
    run: {
      id: runId,
      status: run.status,
      currentStep: run.current_step,
      completedSteps: Array.isArray(run.completed_steps) ? run.completed_steps : [],
      errorCode: typeof run.error_code === "string" ? run.error_code : null,
      imageDigest: typeof run.image_digest === "string" ? run.image_digest : null,
      resourceManifest: run.resource_manifest && typeof run.resource_manifest === "object" ? run.resource_manifest : {},
      evidenceBundle: run.evidence_bundle && typeof run.evidence_bundle === "object" ? run.evidence_bundle : {},
    },
  });
}

async function recordCleanup(body: Record<string, unknown>) {
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const onboardingId = typeof body.onboardingId === "string" ? body.onboardingId.trim() : "";
  if (!runId || !onboardingId) return NextResponse.json({ ok: false, error: "missing_canary_identifiers" }, { status: 400 });
  const onboarding = await supabaseServiceSelect("client_onboarding_accounts", { id: `eq.${onboardingId}` });
  if (!onboarding.ok || onboarding.rows[0]?.tenant_slug !== canarySlug) return NextResponse.json({ ok: false, error: "canary_onboarding_not_found" }, { status: 404 });
  const runs = await supabaseServiceSelect("client_provisioning_runs", { id: `eq.${runId}` });
  const run = runs.rows[0];
  if (!runs.ok || run?.onboarding_id !== onboardingId) return NextResponse.json({ ok: false, error: "canary_run_not_found" }, { status: 404 });
  const cleanupEvidence = body.cleanupEvidence;
  if (!isVerifiedCleanupEvidence(cleanupEvidence)) {
    return NextResponse.json({ ok: false, error: "canary_cleanup_evidence_required" }, { status: 400 });
  }
  const priorEvidence = run.evidence_bundle && typeof run.evidence_bundle === "object" && !Array.isArray(run.evidence_bundle) ? run.evidence_bundle : {};
  const updatedRun = await supabaseServiceUpdate("client_provisioning_runs", { id: `eq.${runId}` }, {
    status: "rolled_back",
    current_step: "canary_cleanup_complete",
    evidence_bundle: { ...priorEvidence, canaryCleanup: cleanupEvidence },
    finished_at: new Date().toISOString(),
  });
  const updatedOnboarding = await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${onboardingId}` }, {
    status: "offboarded",
    offboarded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (!updatedRun.ok || !updatedOnboarding.ok) return NextResponse.json({ ok: false, error: "canary_cleanup_record_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, status: "rolled_back", runId, onboardingId });
}

function isFixedPrepareOnlyManifest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const manifest = value as Record<string, unknown>;
  const gcp = manifest.gcp as Record<string, unknown> | undefined;
  const access = manifest.access as Record<string, unknown> | undefined;
  const provisioning = manifest.provisioning as Record<string, unknown> | undefined;
  const canary = manifest.canary as Record<string, unknown> | undefined;
  return manifest.clientSlug === canarySlug
    && manifest.approved === true
    && manifest.acknowledgeClientSafeRuntime === true
    && manifest.providerCallsEnabled === false
    && manifest.intentRoutingEnabled === false
    && provisioning?.phase === "prepare"
    && gcp?.projectId === canaryProject
    && gcp?.region === canaryRegion
    && gcp?.image === canaryImage
    && gcp?.minInstances === 0
    && gcp?.maxInstances === 1
    && gcp?.cpu === "1"
    && gcp?.memory === "1Gi"
    && gcp?.concurrency === 1
    && gcp?.timeout === "900s"
    && access?.mode === "app-auth"
    && Array.isArray(access?.allowedUserEmails)
    && access.allowedUserEmails.length === 1
    && access.allowedUserEmails[0] === canaryEmail
    && manifestRuntimeMatches(manifest.runtimeEnv)
    && sameSet(manifest.enabledCapabilities, ["tenant-data"])
    && sameSet(manifest.providerAllowlist, [])
    && sameSet(manifest.modelAllowlist, [])
    && hasCanaryBudget(manifest.budget)
    && storageMatches(manifest.storage)
    && canary?.disposable === true
    && inventoryMatches(canary?.expectedInventory);
}

function manifestRuntimeMatches(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const runtime = value as Record<string, unknown>;
  return runtime.VELOCE_CLIENT_EDITION === "1"
    && runtime.AGENTIC_OS_DISABLE_LOCAL_CLI === "1"
    && runtime.AGENTIC_OS_DISABLE_LOCAL_FILES === "1"
    && runtime.AGENTIC_OS_REQUIRE_APPROVALS === "1"
    && runtime.CLIENT_RUNTIME_ENFORCE_AUTH === "1"
    && runtime.CLIENT_RUNTIME_WORKER_ENABLED === "0"
    && runtime.CLIENT_INTENT_ROUTING_ENABLED === "0"
    && runtime.CLIENT_RUNTIME_DATA_MODE === "supabase";
}

function sameSet(value: unknown, expected: string[]) {
  return Array.isArray(value) && value.length === expected.length && expected.every((item) => value.includes(item));
}

function hasCanaryBudget(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const budget = value as Record<string, unknown>;
  return budget.monthlyCap === "1" && budget.warningThreshold === "0.5";
}

function storageMatches(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const storage = value as Record<string, unknown>;
  return storage.namespace === canarySlug && sameSet(storage.corsOrigins, ["https://app.veloceos.cloud"]);
}

function isVerifiedCleanupEvidence(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const evidence = value as Record<string, unknown>;
  const resources = Array.isArray(evidence.resources) ? evidence.resources : null;
  if (evidence.schemaVersion !== 1 || evidence.canarySlug !== canarySlug || typeof evidence.verifiedAt !== "string" || !resources) return false;
  const expected = [
    ["serviceAccount", expectedInventory.serviceAccount],
    ["storageBucket", expectedInventory.storageBucket],
    ["taskQueue", expectedInventory.taskQueue],
    ...expectedInventory.secrets.map((secret) => ["secret", secret]),
  ];
  return expected.every(([kind, name]) => resources.some((resource: unknown) => {
    return resource && typeof resource === "object" && !Array.isArray(resource)
      && (resource as Record<string, unknown>).kind === kind
      && (resource as Record<string, unknown>).name === name
      && (resource as Record<string, unknown>).absent === true;
  }));
}

function inventoryMatches(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const inventory = value as Record<string, unknown>;
  const secrets = Array.isArray(inventory.secrets) ? inventory.secrets : null;
  const cloudRunJobs = Array.isArray(inventory.cloudRunJobs) ? inventory.cloudRunJobs : null;
  return inventory.serviceAccount === expectedInventory.serviceAccount
    && inventory.storageBucket === expectedInventory.storageBucket
    && inventory.taskQueue === expectedInventory.taskQueue
    && inventory.cloudRunService === null
    && cloudRunJobs?.length === 0
    && secrets?.length === expectedInventory.secrets.length
    && expectedInventory.secrets.every((secret) => secrets?.includes(secret));
}
