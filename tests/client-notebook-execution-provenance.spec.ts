import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { NOTEBOOK_STUDIO_OUTPUTS, notebookSourceLinks, notebookStudioGoal, safeNotebookSourceUrl } from "../src/lib/clientNotebookLanes";
import { auditNotebookDraftCitations, buildNotebookExecutionGoal, notebookSourceMetadataSha256 } from "../src/lib/clientNotebookExecutionProvenance";
import { loadReviewModule } from "./helpers/load-review-module";

const recordId = "00000000-0000-4000-8000-000000000001";
const record = {
  id: recordId,
  tenant_slug: "tenant-a",
  kind: "notebook",
  status: "active",
  title: "Client discovery notes",
  content: "The client needs a weekly implementation report.",
  metadata: {
    source_url: "https://example.org/discovery",
    source_links: [{ url: "https://example.org/brief", text: "Approved brief" }, { url: "https://example.org/private?api_key=secret", text: "Unsafe" }],
  },
  notebook_id: "00000000-0000-4000-8000-000000000002",
  created_at: "2026-10-01T12:00:00Z",
};

function executionRoute(sourceRecords = [record], selectResponses: Record<string, Record<string, unknown>[]> = {}) {
  const enqueued: Array<Record<string, unknown>> = [];
  const selects: Array<{ table: string; filters: Record<string, string> }> = [];
  const route = loadReviewModule("src/app/api/client-runtime/executions/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "member-a" }), currentClientMember: async () => true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      selectClientRecords: async (table: string, filters: Record<string, string>) => {
        selects.push({ table, filters });
        if (selectResponses[table]) return { ok: true, records: selectResponses[table] };
        if (table === "client_runtime_records") return { ok: true, records: sourceRecords };
        if (table === "client_notebooks") return { ok: true, records: [{ id: "00000000-0000-4000-8000-000000000002", tenant_slug: "tenant-a", status: "active" }] };
        return { ok: true, records: [] };
      },
      enqueueClientRuntimeJob: async (input: Record<string, unknown>) => { enqueued.push(input); return "job-1"; },
      cancelClientRuntimeJob: async () => undefined,
      refundClientRuntimeRateLimit: async () => undefined,
    },
    "@/lib/cloudTasks": { enqueueClientRuntimeTask: async () => ({ ok: true, status: 200 }) },
    "@/lib/clientInputSafety": { containsClientSecretLike: () => false },
    "@/lib/clientProviderAdapter": { clientProviderRequestAllowed: () => ({ ok: true, provider: "groq", model: "test-model" }) },
    "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true, clientProviderCallsEnabled: () => true },
    "@/lib/clientCloudRunJobs": { clientWorkspaceJobConfigured: () => false },
    "@/lib/clientWorkspaceExecution": { isClientWorkspaceSurface: () => true, workspaceTerminalEvents: () => [] },
    "@/lib/clientJobUsage": { presentClientJobUsage: () => ({}) },
    "@/lib/clientNotebookLanes": { NOTEBOOK_STUDIO_OUTPUTS, notebookSourceLinks, notebookStudioGoal, safeNotebookSourceUrl },
    "@/lib/clientNotebookExecutionProvenance": { notebookSourceMetadataSha256 },
  });
  return { route, enqueued, selects };
}

test("execution reads expose only citation audits bound to selected source IDs", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const unknownId = "00000000-0000-4000-8000-000000000099";
  const references = [{ id: recordId, title: "Client discovery notes", sourceUrl: "https://example.org/discovery", links: [] }];
  const { route } = executionRoute([record], {
    client_runtime_jobs: [
      { id: "job-good", status: "succeeded", requested_by: "member-a", created_at: "2026-10-10T12:00:00Z", input_metadata: { surface: "notebook", sourceReferences: references }, output_metadata: { artifactId: "artifact-good", citationAudit: { ok: true, citedSourceIds: [recordId] } } },
      { id: "job-bad", status: "failed", requested_by: "member-a", created_at: "2026-10-09T12:00:00Z", input_metadata: { surface: "notebook", sourceReferences: references }, output_metadata: { citationAudit: { ok: true, citedSourceIds: [unknownId] } } },
    ],
    client_runtime_budget_ledger: [],
  });
  const response = await route.GET(new Request("https://agentos.example/api/client-runtime/executions?surface=notebook"));
  const body = await response.json() as { executions: Array<{ id: string; citationAudit: unknown }> };
  expect(response.status).toBe(200);
  expect(body.executions.find((execution) => execution.id === "job-good")?.citationAudit).toEqual({ ok: true, citedSourceIds: [recordId] });
  expect(body.executions.find((execution) => execution.id === "job-bad")?.citationAudit).toEqual({ ok: false, reason: "citation_unknown_source" });
});

test.afterEach(() => { delete process.env.CLIENT_SLUG; });

test("notebook executions resolve selected IDs from active records in the current tenant and persist provenance", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const { route, enqueued, selects } = executionRoute();
  const response = await route.POST(new Request("https://agentos.example/api/client-runtime/executions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      surface: "notebook", title: "Weekly client report", notebookOutput: "weekly-report", instruction: "Keep it concise.",
      sourceIds: [recordId], notebookScope: "00000000-0000-4000-8000-000000000002", goal: "UNTRUSTED BROWSER GOAL", artifactIntent: "brief",
    }),
  }));

  expect(response.status).toBe(202);
  expect(selects.find((select) => select.table === "client_runtime_records")).toMatchObject({ table: "client_runtime_records", filters: {
    id: `in.(${recordId})`, tenant_slug: "eq.tenant-a", kind: "eq.notebook", status: "eq.active", notebook_id: "eq.00000000-0000-4000-8000-000000000002",
  } });
  const metadata = enqueued[0].inputMetadata as Record<string, unknown>;
  expect(metadata.goal).toBeUndefined();
  expect(JSON.stringify(metadata)).not.toContain("The client needs a weekly implementation report.");
  expect(JSON.stringify(metadata)).not.toContain("UNTRUSTED BROWSER GOAL");
  expect(metadata.notebookOutput).toBe("weekly-report");
  expect(metadata.sourceIds).toEqual([recordId]);
  expect(metadata.sourceReferences).toEqual([{
    id: recordId,
    title: "Client discovery notes",
    contentSha256: createHash("sha256").update(record.content).digest("hex"),
    sourceMetadataSha256: notebookSourceMetadataSha256({
      id: recordId,
      title: "Client discovery notes",
      sourceUrl: "https://example.org/discovery",
      links: [{ url: "https://example.org/brief", text: "Approved brief" }],
      recordCreatedAt: record.created_at,
    }),
    sourceUrl: "https://example.org/discovery",
    links: [{ url: "https://example.org/brief", text: "Approved brief" }],
    recordCreatedAt: record.created_at,
  }]);
});

test("notebook executions reject missing, duplicate, or oversized source selections before queueing", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const { route, enqueued } = executionRoute([]);
  const send = (sourceIds: unknown) => route.POST(new Request("https://agentos.example/api/client-runtime/executions", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ surface: "notebook", title: "Draft", notebookOutput: "proposal", sourceIds, notebookScope: "all", artifactIntent: "brief" }),
  }));
  expect((await send([recordId])).status).toBe(422);
  expect((await send([recordId, recordId])).status).toBe(400);
  expect((await send(Array(6).fill(recordId))).status).toBe(400);
  expect(enqueued).toHaveLength(0);
});

test("notebook execution rejects records returned outside the requested notebook scope", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const { route, enqueued } = executionRoute([{ ...record, notebook_id: "00000000-0000-4000-8000-000000000099" }]);
  const response = await route.POST(new Request("https://agentos.example/api/client-runtime/executions", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ surface: "notebook", title: "Draft", notebookOutput: "proposal", sourceIds: [recordId], notebookScope: "00000000-0000-4000-8000-000000000002", artifactIntent: "brief" }),
  }));
  expect(response.status).toBe(422);
  expect(enqueued).toHaveLength(0);
});

test("notebook output presets include the three candidate client deliverables", () => {
  expect(NOTEBOOK_STUDIO_OUTPUTS.map((item) => item.key)).toEqual(expect.arrayContaining(["proposal", "audit-report", "weekly-report"]));
  expect(safeNotebookSourceUrl("http://example.org")).toBeNull();
  expect(safeNotebookSourceUrl("https://example.org/?access_token=private")).toBeNull();
});

test("worker-side prompt reconstruction verifies source hashes and cites only queued source IDs", () => {
  const reference = {
    id: recordId,
    contentSha256: createHash("sha256").update(record.content).digest("hex"),
    sourceMetadataSha256: notebookSourceMetadataSha256({
      id: recordId,
      title: record.title,
      sourceUrl: "https://example.org/discovery",
      links: [{ url: "https://example.org/brief", text: "Approved brief" }],
      recordCreatedAt: record.created_at,
    }),
  };
  const built = buildNotebookExecutionGoal({
    output: "proposal", instruction: "List unknowns.", sourceIds: [recordId], sourceReferences: [reference], records: [{ ...record, createdAt: record.created_at }],
  });
  expect(built.ok).toBe(true);
  if (built.ok) {
    expect(built.goal).toContain("The client needs a weekly implementation report.");
    expect(built.goal).toContain(`allowed tokens: [source:${recordId}]`);
  }
  expect(buildNotebookExecutionGoal({
    output: "proposal", instruction: "", sourceIds: [recordId], sourceReferences: [{ ...reference, contentSha256: "a".repeat(64) }], records: [{ ...record, createdAt: record.created_at }],
  })).toEqual({ ok: false, error: "notebook_source_changed" });
  const changedMetadata = { ...record, metadata: { ...record.metadata, source_url: "https://example.org/replaced" } };
  expect(buildNotebookExecutionGoal({
    output: "proposal", instruction: "", sourceIds: [recordId], sourceReferences: [reference], records: [{ ...changedMetadata, createdAt: record.created_at }],
  })).toEqual({ ok: false, error: "notebook_source_changed" });
});

test("draft citation audit requires a valid source token and a source register", () => {
  const references = [{ id: recordId }];
  expect(auditNotebookDraftCitations(`Finding [source:${recordId}]\n\n## Source register\n- Client discovery`, references))
    .toEqual({ ok: true, citedSourceIds: [recordId] });
  expect(auditNotebookDraftCitations("Uncited finding\n\n## Source register", references))
    .toEqual({ ok: false, reason: "citation_missing" });
  expect(auditNotebookDraftCitations("Finding [source:00000000-0000-4000-8000-000000000099]\n\n## Source register", references))
    .toEqual({ ok: false, reason: "citation_unknown_source" });
  expect(auditNotebookDraftCitations(`Finding [source:${recordId}]`, references))
    .toEqual({ ok: false, reason: "source_register_missing" });
});
