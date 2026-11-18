import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as traits from "../../src/lib/capabilityTraits";
import * as trace from "../../src/lib/clientJobTrace";
import * as lanes from "../../src/lib/clientNotebookLanes";
import * as provenance from "../../src/lib/clientNotebookExecutionProvenance";
import * as retention from "../../src/lib/clientRetention";
import * as workspace from "../../src/lib/clientWorkspaceExecution";
import * as artifactReview from "../../src/lib/clientArtifactReview";
import { readBoundedJsonObject } from "../../src/lib/clientNetworkSafety";
import { containsClientSecretLike } from "../../src/lib/clientInputSafety";
import { presentClientJobUsage } from "../../src/lib/clientJobUsage";
import { safeClientProviderOutput } from "../../src/lib/clientProviderAdapter";
import { safeClientFileName, safeClientObjectKey } from "../../src/lib/clientStorage";
import { loadReviewModule } from "./load-review-module";

type Row = Record<string, unknown>;
export const sourceId = "00000000-0000-4000-8000-000000000001";
export const jobId = "00000000-0000-4000-8000-000000000002";
export const artifactId = "00000000-0000-4000-8000-000000000003";
export const validDraft = `# Weekly report\n\nPrepare a weekly implementation report. [source:${sourceId}]\n\n## Source register\n- [source:${sourceId}] Discovery notes`;
export function installNotebookJourneyEnvironment() {
  const savedEnv = { ...process.env };
  const savedFetch = globalThis.fetch;
  Object.assign(process.env, {
    CLIENT_SLUG: "tenant-a", CLIENT_RETENTION_DAYS: "28", CLIENT_RUNTIME_WORKER_ENABLED: "1",
    CLIENT_WORKER_TOKEN: "synthetic-local-worker-token",
  });
  globalThis.fetch = async () => { throw new Error("Network is forbidden in the local notebook journey"); };
  return () => { process.env = { ...savedEnv }; globalThis.fetch = savedFetch; };
}

// Real handlers share synthetic service state; this is not hosted/RLS or model-quality evidence.
export function createNotebookJourney(output = `\`\`\`markdown\n${validDraft}\n\`\`\``) {
  const source = {
    id: sourceId, tenant_slug: "tenant-a", kind: "notebook", status: "active", notebook_id: null,
    title: "Discovery notes", content: "The client needs a weekly implementation report.",
    metadata: { source_url: "https://example.org/discovery", source_links: [{ url: "https://example.org/brief", text: "Approved brief" }] }, created_at: new Date().toISOString(),
  };
  const state = {
    userId: "member-a", authenticated: true, source, job: null as Row | null, artifact: null as Row | null,
    objects: new Map<string, Buffer>(), budgetAllowed: true, budgetSettlementAllowed: true, completionAllowed: true, reviewSaveAllowed: true, providerCalls: 0, downloads: 0,
    beforeStorageReturn: null as (() => void) | null,
    settlements: [] as Row[], dispatched: [] as Row[], prompts: [] as string[],
  };
  const dataPlane = {
    checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
    clientRpc: async (name: string, body: Row) => {
      expect(name).toBe("review_client_notebook_artifact");
      if (!state.reviewSaveAllowed) return { ok: false, value: false };
      Object.assign(state.artifact!, { review_decision: body.p_decision, review_sha256: body.p_sha256, reviewed_by: state.userId, reviewed_at: new Date().toISOString() });
      return { ok: true, value: true };
    },
    selectClientRecords: async (table: string) => {
      const records = table === "client_runtime_records" ? [source]
        : table === "client_runtime_jobs" ? (state.job ? [state.job] : [])
          : table === "client_runtime_artifacts" ? (state.artifact ? [state.artifact] : [])
            : table === "client_runtime_budget_ledger" ? [] : null;
      if (!records) throw new Error(`Unexpected table: ${table}`);
      return { ok: true, records };
    },
    enqueueClientRuntimeJob: async (input: Row) => {
      state.job = {
        id: jobId, tenant_slug: "tenant-a", requested_by: state.userId, status: "queued",
        capability: input.capability, provider: input.provider, model: input.model,
        created_at: new Date().toISOString(),
        input_metadata: {
          ...(input.inputMetadata as Row),
          __veloceTraits: traits.traitBundleMetadata(traits.resolveCapabilityTraits({
            capability: "workspace-execution", provider: "groq", surface: "notebook",
          })),
        },
      };
      return jobId;
    },
    reserveClientRuntimeBudgetWorker: async () => state.budgetAllowed,
    settleClientRuntimeBudgetWorker: async (input: Row) => { state.settlements.push(input); return state.budgetSettlementAllowed; },
    workerRpc: async (name: string, body: Row) => {
      expect(body.p_tenant_slug).toBe("tenant-a");
      expect(body.p_worker_token).toBe("synthetic-local-worker-token");
      if (name === "claim_client_runtime_job") {
        expect(body.p_job_id).toBe(jobId);
        expect(state.job?.status).toBe("queued");
        state.job!.status = "running";
        return { ok: true, value: structuredClone(state.job) };
      }
      if (name === "load_client_notebook_execution_sources_worker") {
        return { ok: true, value: { sources: [{ ...source, createdAt: source.created_at, notebookId: source.notebook_id }] } };
      }
      if (name === "create_client_runtime_artifact_worker") {
        state.artifact = {
          id: artifactId, tenant_slug: body.p_tenant_slug, job_id: body.p_job_id, status: "pending",
          object_key: body.p_object_key, original_name: body.p_original_name, content_type: body.p_content_type,
          byte_size: body.p_byte_size, retention_expires_at: body.p_retention_expires_at,
        };
        return { ok: true, value: artifactId };
      }
      if (name === "confirm_client_runtime_artifact_worker") {
        expect(state.objects.get(String(state.artifact?.object_key))?.length).toBe(body.p_byte_size);
        state.artifact!.status = "ready";
        return { ok: true, value: true };
      }
      if (name === "complete_client_runtime_job") {
        if (!state.completionAllowed) return { ok: false, value: false };
        Object.assign(state.job!, { status: body.p_status, error_code: body.p_error_code, output_metadata: body.p_output_metadata });
        return { ok: true, value: true };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
  const storage = {
    safeClientFileName, safeClientObjectKey,
    clientStorageConfig: () => ({ bucket: "synthetic-bucket", namespace: "tenant-a" }),
    clientGcpAccessToken: async () => "synthetic-storage-token",
    uploadClientStorageObject: async (input: { objectKey: string; bytes: Buffer; retentionExpiresAt: string }) => {
      expect(input.retentionExpiresAt).toBe(state.artifact?.retention_expires_at);
      state.objects.set(input.objectKey, Buffer.from(input.bytes));
      return true;
    },
    proxyClientStorageObject: async (input: { objectKey: string; expectedBytes: number }) => {
      state.downloads++;
      const bytes = state.objects.get(input.objectKey);
      expect(bytes?.length).toBe(input.expectedBytes);
      state.beforeStorageReturn?.();
      return { body: new Response(new Uint8Array(bytes!)).body, contentType: "text/markdown", contentLength: String(bytes!.length) };
    },
  };
  const common = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => state.authenticated ? { id: state.userId } : null, currentClientMember: async () => state.authenticated },
    "@/lib/clientDataPlane": dataPlane,
    "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true, clientProviderCallsEnabled: () => true },
    "@/lib/clientRetention": retention,
    "@/lib/clientStorage": storage,
    "@/lib/clientArtifactReview": artifactReview,
    "@/lib/clientNetworkSafety": { readBoundedJsonObject },
    "@/lib/clientWorkspaceExecution": workspace,
    "@/lib/clientNotebookExecutionProvenance": provenance,
    "@/lib/clientProviderAdapter": {
      clientProviderRequestAllowed: () => ({ ok: true, provider: "groq", model: "synthetic-model" }),
      clientTextMaxOutputTokens: () => 2048,
      estimateClientTextCostMicros: () => 100,
      safeClientProviderOutput,
      runClientTextAdapter: async (input: { prompt: string }) => {
        state.providerCalls++;
        state.prompts.push(input.prompt);
        return { ok: true, output, finishReason: "stop", provider: "groq", model: "synthetic-model" };
      },
    },
  };
  const executions = loadReviewModule("src/app/api/client-runtime/executions/route.ts", {
    ...common,
    "@/lib/clientInputSafety": { containsClientSecretLike },
    "@/lib/clientCloudRunJobs": { clientWorkspaceJobConfigured: () => false },
    "@/lib/clientJobUsage": { presentClientJobUsage },
    "@/lib/clientNotebookLanes": lanes,
    "@/lib/cloudTasks": { enqueueClientRuntimeTask: async (input: Row) => { state.dispatched.push(input); return { ok: true }; } },
  });
  const workerPath = "src/app/api/internal/client-runtime/jobs/route.ts";
  const unusedWorkerImports = Object.fromEntries([...readFileSync(workerPath, "utf8").matchAll(/from "(@\/lib\/[^\"]+)"/g)].map((match) => [match[1], {}]));
  const worker = loadReviewModule(workerPath, {
    ...unusedWorkerImports, ...common,
    "@/lib/clientTaskAuth": { validClientTaskIdentity: async () => true },
    "@/lib/clientJobTrace": trace,
    "@/lib/capabilityTraits": traits,
    "@/lib/clientRuntimeObservability": { logClientRuntimeEvent: () => undefined },
  });
  const downloadRoute = loadReviewModule("src/app/api/client-runtime/artifacts/[id]/download/route.ts", common);
  const artifacts = loadReviewModule("src/app/api/client-runtime/artifacts/route.ts", common);
  const reviewRoute = loadReviewModule("src/app/api/client-runtime/artifacts/[id]/review/route.ts", common);
  const reviewContext = { params: Promise.resolve({ id: artifactId }) };
  return {
    state,
    handle: async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      if (url.pathname === "/api/client-runtime/executions" && request.method === "POST") return executions.POST(request);
      if (url.pathname === "/api/client-runtime/executions" && request.method === "GET") return executions.GET(request);
      if (url.pathname === "/api/client-runtime/artifacts" && request.method === "GET") return artifacts.GET(request);
      if (url.pathname === `/api/client-runtime/artifacts/${artifactId}/download` && request.method === "GET") return downloadRoute.GET(request, { params: Promise.resolve({ id: artifactId }) });
      if (url.pathname === `/api/client-runtime/artifacts/${artifactId}/review` && request.method === "GET") return reviewRoute.GET(request, reviewContext);
      if (url.pathname === `/api/client-runtime/artifacts/${artifactId}/review` && request.method === "POST") return reviewRoute.POST(request, reviewContext);
      throw new Error(`Unexpected notebook journey request: ${request.method} ${url.pathname}`);
    },
    queue: () => executions.POST(new Request("https://tenant.invalid/api/client-runtime/executions", {
      method: "POST", body: JSON.stringify({ surface: "notebook", title: "Weekly report", notebookOutput: "weekly-report",
        sourceIds: [sourceId], notebookScope: "unfiled", artifactIntent: "brief", goal: "Untrusted browser instructions" }),
    })),
    run: () => worker.POST(new Request("https://tenant.invalid/api/internal/client-runtime/jobs", {
      method: "POST", body: JSON.stringify({ jobId, tenantSlug: "tenant-a" }),
    })),
    status: () => executions.GET(new Request("https://tenant.invalid/api/client-runtime/executions?surface=notebook")),
    download: () => downloadRoute.GET(new Request("https://tenant.invalid/download"), { params: Promise.resolve({ id: artifactId }) }),
    preview: () => reviewRoute.GET(new Request("https://tenant.invalid/review"), reviewContext),
    decide: (sha256: string, decision = "approved") => reviewRoute.POST(new Request("https://tenant.invalid/review", { method: "POST", body: JSON.stringify({ sha256, decision }) }), reviewContext),
  };
}
