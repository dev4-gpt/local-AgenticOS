import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { loadReviewModule } from "./helpers/load-review-module";
const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const budget = loadReviewModule("src/lib/adapterBudget.ts", { "./adapterContracts": contracts });
const lanes = loadReviewModule("src/lib/clientNotebookLanes.ts", {});
const provenance = loadReviewModule("src/lib/clientNotebookExecutionProvenance.ts", { "@/lib/clientNotebookLanes": lanes });
const host = loadReviewModule("src/lib/commerceHostDraft.ts", { "./adapterContracts": contracts, "./adapterBudget": budget, "./clientNotebookExecutionProvenance": provenance, "./clientNotebookLanes": lanes });
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const now = Date.parse("2026-10-26T12:00:00Z"), id = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
function fixture() {
  const source = { id, title: "Fictional service scope", content: "Prepare one page using approved copy.", createdAt: "2026-10-25T12:00:00Z", metadata: {} };
  const review = { tenantSlug: "owner-dev", sourceId: id, revision: "review-1", reviewState: "approved", sensitivity: "ordinary", requesterActive: true, reviewerActive: true, reviewerRole: "admin", requesterId: "33333333-3333-4333-8333-333333333333", reviewerId: "44444444-4444-4444-8444-444444444444", reviewedAt: "2026-10-25T13:00:00Z", retentionExpiresAt: "2026-11-01T12:00:00Z", contentSha256: hash(source.content), sourceMetadataSha256: provenance.notebookSourceMetadataSha256({ id, title: source.title, sourceUrl: null, links: [], recordCreatedAt: source.createdAt }) };
  const batch = { tenantSlug: "owner-dev", retentionDays: 28, records: [source], reviews: [review] };
  const config = { enabled: true, tenantSlug: "owner-dev", adapterId: "veloce-commerce", workerToken: "test-worker-token-with-thirty-characters", provider: "test-existing-provider", model: "test-existing-model", maxDraftMicros: 5000, tenantMonthlyCapMicros: 10000 };
  const request = { taskId, sourceIds: [id], instruction: "Draft only the source-supported scope." };
  const draft = { title: "A service page", body: `## Deliverables\nOne service page. [source:${id}]\n## Source register\n[source:${id}]`, provider: config.provider, model: config.model, costMicros: 1000 as number | null, costStatus: "verified_fixture_cost" };
  const calls: { name: string; body: Record<string, unknown> }[] = []; const payloads: unknown[] = []; let loads = 0;
  const deps = {
    clock: () => now,
    rpc: async (name: string, body: Record<string, unknown>) => { calls.push({ name, body }); return { ok: true, status: 200, value: name.endsWith("reserve") ? "reserved" : name.endsWith("settle") ? "settled" : "released" }; },
    loadAuthorizedSources: async () => { loads++; return structuredClone(batch); },
    runDraft: async (input: unknown) => { expect(calls.map(c => c.name)).toEqual(["client_adapter_budget_reserve"]); payloads.push(input); return { ...draft }; },
  };
  return { source, review, batch, config, request, draft, deps, calls, payloads, loads: () => loads };
}

test("host maps only fresh reviewed ordinary Notebook snapshots and preserves original hashes/clock", () => {
  const f = fixture(); const sources = host.prepareCommerceNotebookSources("owner-dev", [id], f.batch, now);
  expect(sources).toHaveLength(1); expect(sources[0]).toMatchObject({ tenant: "owner-dev", id, revision: "review-1", contentHash: f.review.contentSha256, metadataHash: f.review.sourceMetadataSha256, createdAt: "2026-10-25T12:00:00.000Z", expiresAt: "2026-11-01T12:00:00.000Z", sensitivity: "ordinary" });
  sources[0].content = "Changed detached output"; expect(f.source.content).toBe("Prepare one page using approved copy.");
  for (const change of [{ reviewerActive: false }, { requesterActive: false }, { reviewerRole: "member" }, { reviewState: "quarantined" }, { sensitivity: "sensitive" }, { sensitivity: "unknown" }, { tenantSlug: "other-dev" }, { reviewerId: f.review.requesterId }, { contentSha256: hash("changed") }, { revision: "" }, { retentionExpiresAt: "2026-12-01T00:00:00Z" }, { retentionExpiresAt: "2026-10-26T12:00:00Z" }]) {
    expect(host.prepareCommerceNotebookSources("owner-dev", [id], { ...f.batch, reviews: [{ ...f.review, ...change }] }, now)).toBeNull();
  }
  expect(host.prepareCommerceNotebookSources("owner-dev", [id], { ...f.batch, reviews: [] }, now)).toBeNull();
  expect(host.prepareCommerceNotebookSources("owner-dev", [id], { ...f.batch, records: [{ ...f.source, title: "Changed metadata" }] }, now)).toBeNull();
  for (const change of [{ tenant_slug: "other-dev" }, { status: "deleted" }, { deletedAt: "2026-10-26T00:00:00Z" }]) expect(host.prepareCommerceNotebookSources("owner-dev", [id], { ...f.batch, records: [{ ...f.source, ...change }] }, now)).toBeNull();
});

test("central reservation precedes draft, uses distinct idempotency keys, and settles exact verified micros", async () => {
  const f = fixture(); const result = await host.runCommerceHostDraft(f.config, f.deps, f.request);
  expect(result).toMatchObject({ ok: true, budgetState: "settled", draft: { costMicros: 1000 } });
  expect(f.calls.map(c => c.name)).toEqual(["client_adapter_budget_reserve", "client_adapter_budget_settle"]);
  expect(f.calls[0].body).toMatchObject({ p_tenant_slug: "owner-dev", p_adapter_id: "veloce-commerce", p_amount_micros: 5000, p_tenant_monthly_cap_micros: 10000 });
  expect(f.calls[1].body.p_actual_amount_micros).toBe(1000); expect(f.calls[0].body.p_idempotency_key).not.toBe(f.calls[1].body.p_idempotency_key);
  expect(JSON.stringify(f.payloads)).not.toContain(f.config.workerToken); expect(JSON.stringify(result)).not.toContain(f.config.workerToken);
});

test("disabled, invalid cap, missing review and refused budgets dispatch nothing", async () => {
  for (const change of [{ enabled: false }, { maxDraftMicros: 0 }, { maxDraftMicros: 0.5 }, { maxDraftMicros: 10001 }]) {
    const f = fixture(); expect((await host.runCommerceHostDraft({ ...f.config, ...change }, f.deps, f.request)).ok).toBe(false); expect(f.calls).toHaveLength(0); expect(f.payloads).toHaveLength(0);
  }
  const f = fixture(); f.batch.reviews = []; expect((await host.runCommerceHostDraft(f.config, f.deps, f.request)).reason).toBe("source_review_unavailable"); expect(f.calls).toHaveLength(0);
  const g = fixture(); g.deps.rpc = async () => ({ ok: true, status: 200, value: "tenant_cap_exceeded" });
  expect(await host.runCommerceHostDraft(g.config, g.deps, g.request)).toMatchObject({ ok: false, reason: "budget_refused", budgetState: "not_reserved" }); expect(g.payloads).toHaveLength(0);
});

test("duplicate or uncertain reservations never repeat the model call", async () => {
  for (const answer of ["already_reserved", "unexpected"]) {
    const f = fixture(); f.deps.rpc = async () => ({ ok: true, status: 200, value: answer });
    expect((await host.runCommerceHostDraft(f.config, f.deps, f.request)).budgetState).toBe("reconciliation_required"); expect(f.payloads).toHaveLength(0);
  }
});

test("source withdrawal between reservation and dispatch releases only the unused reservation", async () => {
  const f = fixture(); let loads = 0;
  f.deps.loadAuthorizedSources = async () => { const next = structuredClone(f.batch); if (++loads > 1) next.reviews[0].reviewState = "withdrawn"; return next; };
  expect(await host.runCommerceHostDraft(f.config, f.deps, f.request)).toMatchObject({ ok: false, reason: "source_changed_before_dispatch", budgetState: "released" });
  expect(f.calls.map(c => c.name)).toEqual(["client_adapter_budget_reserve", "client_adapter_budget_release"]); expect(f.payloads).toHaveLength(0);
});

test("unknown subscription cost or ambiguous provider outcome keeps the central reservation", async () => {
  const f = fixture(); f.draft.costMicros = null; f.draft.costStatus = "subscription_usage_only";
  expect(await host.runCommerceHostDraft(f.config, f.deps, f.request)).toMatchObject({ ok: true, budgetState: "reserved_cost_unknown", draft: { costMicros: null } }); expect(f.calls).toHaveLength(1);
  const g = fixture(); g.deps.runDraft = async () => { throw new Error("PRIVATE_PROVIDER_BODY"); };
  const result = await host.runCommerceHostDraft(g.config, g.deps, g.request); expect(result).toMatchObject({ ok: false, reason: "draft_outcome_unknown", budgetState: "reconciliation_required" }); expect(g.calls).toHaveLength(1); expect(JSON.stringify(result)).not.toContain("PRIVATE");
});

test("invalid citations, over-reservation and failed settlement never become an admitted draft", async () => {
  for (const change of [{ provider: "unexpected-provider" }, { model: "unexpected-model" }, { body: "Uncited commitments" }, { costMicros: -1 }, { costMicros: 10000 }]) {
    const f = fixture(); Object.assign(f.draft, change); expect((await host.runCommerceHostDraft(f.config, f.deps, f.request)).ok).toBe(false); expect(f.calls).toHaveLength(1);
  }
  const f = fixture(); const rpc = f.deps.rpc; f.deps.rpc = async (name, body) => name.endsWith("settle") ? { ok: false, status: 503, value: null as unknown as string } : rpc(name, body);
  expect(await host.runCommerceHostDraft(f.config, f.deps, f.request)).toMatchObject({ ok: false, reason: "budget_settlement_reconciliation_required", budgetState: "reconciliation_required" });
});


test("source revocation during the runtime call hides the stale draft but does not erase actual cost", async () => {
  for (const cost of [1000, null]) {
    const f = fixture(); f.draft.costMicros = cost; let loads = 0;
    f.deps.loadAuthorizedSources = async () => { const next = structuredClone(f.batch); if (++loads > 2) next.reviews[0].reviewState = "withdrawn"; return next; };
    const result = await host.runCommerceHostDraft(f.config, f.deps, f.request);
    expect(result).toMatchObject({ ok: false, reason: "source_changed_during_draft", budgetState: cost === null ? "reconciliation_required" : "settled" });
    expect(f.calls.map(c => c.name)).not.toContain("client_adapter_budget_release"); expect(f.payloads).toHaveLength(1);
  }
});

test("mutating caller objects during authorization cannot redirect tenant, model, token or budget", async () => {
  const f = fixture(); const token = f.config.workerToken; const selected = [...f.request.sourceIds];
  f.deps.loadAuthorizedSources = async () => { f.config.tenantSlug = "other-dev"; f.config.workerToken = "changed-worker-token-with-thirty-chars"; f.config.maxDraftMicros = 999999; f.request.sourceIds = []; return structuredClone(f.batch); };
  const result = await host.runCommerceHostDraft(f.config, f.deps, f.request);
  expect(result.ok).toBe(true); expect(f.calls[0].body).toMatchObject({ p_tenant_slug: "owner-dev", p_worker_token: token, p_amount_micros: 5000 });
  expect((f.payloads[0] as { sources: { id: string }[] }).sources.map(s => s.id)).toEqual(selected);
});
