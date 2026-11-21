import { test, expect } from "@playwright/test";
import { generateKeyPairSync, createHash } from "node:crypto";
import { loadReviewModule } from "./helpers/load-review-module";
const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const tokens = loadReviewModule("src/lib/adapterTokens.ts", { "./adapterContracts": contracts });
const budget = loadReviewModule("src/lib/adapterBudget.ts", { "./adapterContracts": contracts });
const lanes = loadReviewModule("src/lib/clientNotebookLanes.ts", {});
const provenance = loadReviewModule("src/lib/clientNotebookExecutionProvenance.ts", { "@/lib/clientNotebookLanes": lanes });
const host = loadReviewModule("src/lib/commerceHostDraft.ts", { "./adapterContracts": contracts, "./adapterBudget": budget, "./clientNotebookExecutionProvenance": provenance, "./clientNotebookLanes": lanes });
const transportModule = loadReviewModule("src/lib/commerceDraftTransport.ts", { "./adapterContracts": contracts });
const now = Date.parse("2026-10-26T12:00:00Z"), id = "11111111-1111-4111-8111-111111111111", taskId = "22222222-2222-4222-8222-222222222222";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

test("actual host tokens, central budget wrappers and HTTP runtime interoperate without sharing a worker credential", async () => {
  const { CommerceDraftJournal } = await import("../commerce/src/draft-journal.mjs");
  const { createCommerceDraftRuntime } = await import("../commerce/src/draft-runtime.mjs");
  const { createOllamaDrafter } = await import("../commerce/src/drafting.mjs");
  const keys = generateKeyPairSync("ed25519"), tenant = "owner-dev", workerToken = "fixture-worker-token-never-sent-to-runtime";
  const source = { id, title: "Fictional service brief", content: "Prepare one service page.", createdAt: "2026-10-25T12:00:00Z", metadata: {} };
  const review = { tenantSlug: tenant, sourceId: id, revision: "review-1", reviewState: "approved", sensitivity: "ordinary", requesterActive: true, reviewerActive: true, reviewerRole: "admin", requesterId: "33333333-3333-4333-8333-333333333333", reviewerId: "44444444-4444-4444-8444-444444444444", reviewedAt: "2026-10-25T13:00:00Z", retentionExpiresAt: "2026-11-01T12:00:00Z", contentSha256: hash(source.content), sourceMetadataSha256: provenance.notebookSourceMetadataSha256({ id, title: source.title, sourceUrl: null, links: [], recordCreatedAt: source.createdAt }) };
  let modelCalls = 0; const ledger: { name: string; body: Record<string, unknown> }[] = [];
  const drafter = createOllamaDrafter({ model: "fixture-existing-model", fetchImpl: async () => {
    modelCalls++; expect(ledger[0].name).toBe("client_adapter_budget_reserve");
    return Response.json({ message: { content: JSON.stringify({ title: "One service page", requirements: [{ text: "Prepare one page.", sourceIds: [id] }], deliverables: [{ title: "One page", details: "Use the reviewed service brief.", sourceIds: [id] }], questions: ["Who supplies final copy?"], assumptions: [] }) } });
  } });
  const journal = new CommerceDraftJournal(":memory:", { clock: () => now });
  const server = createCommerceDraftRuntime({ allowVolatileJournalForTests: true, tenant, publicKeys: [keys.publicKey], journal, provider: "ollama", model: "fixture-existing-model", maxBudgetMicros: 5000, drafter, clock: () => now });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("missing fixture port");
  const wireBodies: string[] = [], mintedClaims: { scope: string[]; requestSha256: string; handles?: string[] }[] = [];
  const transport = transportModule.createCommerceDraftTransport({ baseUrl: `http://127.0.0.1:${address.port}`, tenantSlug: tenant, provider: "ollama", model: "fixture-existing-model", maxBudgetMicros: 5000, allowInsecureLoopback: true }, {
    mintToken: (input: { operation: string; handles?: string[]; requestSha256: string }) => {
      const minted = tokens.mintAdapterToken({ privateKey: keys.privateKey, tenant, adapterId: "veloce-commerce", scope: [input.operation], ...(input.handles ? { handles: input.handles } : {}), requestSha256: input.requestSha256, now: Math.floor(now / 1000) }); mintedClaims.push(minted.claims); return minted.token;
    },
    fetchImpl: (url: string, options: RequestInit) => { wireBodies.push(String(options.body ?? "")); return fetch(url, options); },
  });
  try {
    expect((await transport.readManifest()).sideEffectCeiling).toBe("draft");
    const config = { enabled: true, tenantSlug: tenant, adapterId: "veloce-commerce", workerToken, provider: "ollama", model: "fixture-existing-model", maxDraftMicros: 5000, tenantMonthlyCapMicros: 10000 };
    const deps = { clock: () => now, loadAuthorizedSources: async () => ({ tenantSlug: tenant, retentionDays: 28, records: [source], reviews: [review] }), runDraft: transport.runDraft, rpc: async (name: string, body: Record<string, unknown>) => { ledger.push({ name, body }); return { ok: true, status: 200, value: ledger.length === 1 ? "reserved" : "already_reserved" }; } };
    const request = { taskId, sourceIds: [id], instruction: "Draft the fictional service brief." };
    const result = await host.runCommerceHostDraft(config, deps, request);
    expect(result).toMatchObject({ ok: true, budgetState: "reserved_cost_unknown", draft: { costMicros: null } });
    expect(result.sourceReferences[0].contentHash).toBe(review.contentSha256); expect(modelCalls).toBe(1);
    expect(await host.runCommerceHostDraft(config, deps, request)).toMatchObject({ ok: false, reason: "dispatch_reconciliation_required" }); expect(modelCalls).toBe(1);
    expect((await transport.readResult(taskId, [id])).body).toBe(result.draft.body); expect(modelCalls).toBe(1);
    expect(JSON.stringify(wireBodies)).not.toContain(workerToken);
    expect(mintedClaims.map(c => c.scope)).toEqual([["manifest"], ["task.run"], ["task.result"]]);
    expect(mintedClaims.every(c => /^[a-f0-9]{64}$/.test(c.requestSha256))).toBe(true);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); journal.close(); }
});

test("transport refuses insecure remote addresses and keeps provider failures opaque", async () => {
  const config = { baseUrl: "http://remote.example", tenantSlug: "owner-dev", provider: "test", model: "test", maxBudgetMicros: 5000 };
  const deps = { mintToken: () => "body.signature" };
  expect(() => transportModule.createCommerceDraftTransport(config, deps)).toThrow("invalid_commerce_transport");
  expect(() => transportModule.createCommerceDraftTransport({ ...config, allowInsecureLoopback: true }, deps)).toThrow();
  const transport = transportModule.createCommerceDraftTransport({ ...config, baseUrl: "https://configured-runtime.example" }, { ...deps, fetchImpl: async () => new Response("PRIVATE_PROVIDER_BODY", { status: 500 }) });
  await expect(transport.readManifest()).rejects.toThrow("commerce_draft_reconciliation_required");
  const oversized = transportModule.createCommerceDraftTransport({ ...config, baseUrl: "https://configured-runtime.example" }, { ...deps, fetchImpl: async () => new Response("x".repeat(192001)) });
  await expect(oversized.readManifest()).rejects.toThrow("commerce_draft_reconciliation_required");
});
