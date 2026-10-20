import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  ADAPTER_OPERATIONS,
  APPROVAL_ACTION_KINDS,
  APPROVAL_STATUSES,
  APPROVAL_TRANSITIONS,
  AdapterContractError,
  BUDGET_EVENT_KINDS,
  DELETION_GUARANTEES,
  MEMORY_ITEM_STATUSES,
  MEMORY_ITEM_TRANSITIONS,
  PROMOTION_STATUSES,
  PROMOTION_TRANSITIONS,
  adapterNamespace,
  assertDistinctReviewer,
  assertMicros,
  canTransition,
  isApprovalUsable,
  isSha256Hex,
  isValidAdapterId,
  isValidIdempotencyKey,
  isValidTenantSlug,
  microsFromUsd,
  usdFromMicros,
  validateAdapterManifest,
  validateAdapterTaskRequest,
  validateMemoryProposal,
  validateTombstoneReceipt,
} from "../src/lib/adapterContracts";
import { isValidCapabilityTenantSlug } from "../src/lib/capabilityContracts";
import { validateClientVisualQaInput } from "../src/lib/clientVisualQaAdapter";
import { validateV96ResearchRequest } from "../src/lib/v96Contracts";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const UUID_A = "00000000-0000-4000-8000-0000000000a1";
const KEY = "task-2026-10-19-0001";

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: "h1",
    adapterId: "creator-os",
    displayName: "Creator OS",
    adapterVersion: "0.1.0",
    publisher: "owner",
    license: "AGPL-3.0-only",
    operations: ["manifest", "health", "task.run", "task.get", "task.cancel", "memory.propose", "memory.tombstone"],
    tasks: [
      { name: "draft.post", sideEffect: "draft" },
      { name: "publish.post", sideEffect: "publish" },
    ],
    sideEffectCeiling: "publish",
    deletionGuarantee: "receipt",
    ...overrides,
  };
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof AdapterContractError) return error.code;
    throw error;
  }
  return "no_error";
}

test("ids, slugs, keys and hashes follow the database rules", () => {
  expect(isValidTenantSlug("tenant-a")).toBe(true);
  expect(["ab", "1abc", "Tenant", "a_b-c", "a".repeat(42)].some(isValidTenantSlug)).toBe(false);
  expect(isValidAdapterId("creator-os")).toBe(true);
  expect(isValidAdapterId("Creator OS")).toBe(false);
  expect(isValidIdempotencyKey(KEY)).toBe(true);
  expect(["short", "bad key with spaces", ""].some(isValidIdempotencyKey)).toBe(false);
  expect(isSha256Hex(sha("x"))).toBe(true);
  expect(isSha256Hex(sha("x").toUpperCase())).toBe(false);
  expect(adapterNamespace("forge")).toBe("adapter:forge");
  expect(code(() => adapterNamespace("X"))).toBe("invalid_adapter_id");
});

test("every tenant slug check in the app follows the database rule, so none accepts a slug the database refuses", () => {
  const sql = readFileSync("product-experience/supabase-client-runtime-control-plane.sql", "utf8");
  const rule = new RegExp(/slug text primary key check \(slug ~ '([^']+)'\)/.exec(sql)![1]);
  const slugs = ["tenant-a", "abc", "a".repeat(41), "ab", "1abc", "9", "a".repeat(42), "a".repeat(63), "Tenant", "tenant_a", "-abc", "tenant a", "", "tenant-a\n"];
  const v96 = (slug: string) => !validateV96ResearchRequest({ tenantSlug: slug }).includes("tenantSlug is invalid");
  const qa = (slug: string) => !validateClientVisualQaInput({ tenantSlug: slug }).includes("visual_qa_tenant_invalid");
  for (const slug of slugs) {
    const expected = rule.test(slug);
    expect(isValidTenantSlug(slug), `adapter contract: ${JSON.stringify(slug)}`).toBe(expected);
    expect(isValidCapabilityTenantSlug(slug), `capability contracts: ${JSON.stringify(slug)}`).toBe(expected);
    expect(v96(slug), `v96 research: ${JSON.stringify(slug)}`).toBe(expected);
    expect(qa(slug), `visual QA: ${JSON.stringify(slug)}`).toBe(slug.trim() === slug ? expected : rule.test(slug.trim()));
  }
});

test("money is integer micros end to end", () => {
  expect(microsFromUsd(1.5)).toBe(1_500_000);
  expect(microsFromUsd(0.0000004)).toBe(0);
  expect(usdFromMicros(2_500_000)).toBe(2.5);
  for (const bad of [1.5, -1, Number.NaN, "5", null, Number.MAX_SAFE_INTEGER + 2]) {
    expect(code(() => assertMicros(bad))).toBe("invalid_micros");
  }
  expect(code(() => microsFromUsd(-0.01))).toBe("invalid_micros");
});

test("a valid manifest is accepted and normalised", () => {
  const parsed = validateAdapterManifest(manifest());
  expect(parsed.adapterId).toBe("creator-os");
  expect(parsed.tasks.map((task) => task.sideEffect)).toEqual(["draft", "publish"]);
});

test("manifest rules reject unsafe or inconsistent adapters", () => {
  expect(code(() => validateAdapterManifest(manifest({ contractVersion: "h0" })))).toBe("version_mismatch");
  expect(code(() => validateAdapterManifest(manifest({ operations: ["manifest"] })))).toBe("invalid_input");
  expect(code(() => validateAdapterManifest(manifest({ operations: ["manifest", "health", "teleport"] })))).toBe("unknown_operation");
  expect(code(() => validateAdapterManifest(manifest({ operations: ["manifest", "health", "health"] })))).toBe("invalid_input");
  expect(code(() => validateAdapterManifest(manifest({ operations: ["manifest", "health", "task.run", "memory.tombstone"] })))).toBe("invalid_input");
  expect(code(() => validateAdapterManifest(manifest({ sideEffectCeiling: "draft" })))).toBe("side_effect_exceeds_ceiling");
  expect(code(() => validateAdapterManifest(manifest({ deletionGuarantee: "none" })))).toBe("tombstone_requires_receipt_guarantee");
  expect(code(() => validateAdapterManifest(manifest({ operations: ["manifest", "health"], deletionGuarantee: "receipt" })))).toBe("tombstone_requires_receipt_guarantee");
  expect(code(() => validateAdapterManifest(manifest({ tasks: [] })))).toBe("invalid_input");
  expect(code(() => validateAdapterManifest(manifest({ tasks: [{ name: "draft.post", sideEffect: "draft" }, { name: "draft.post", sideEffect: "read" }] })))).toBe("invalid_input");
  expect(code(() => validateAdapterManifest("not an object"))).toBe("invalid_input");
});

test("an adapter with no deletion API must declare it has none", () => {
  const readOnly = manifest({ operations: ["manifest", "health", "context.read"], tasks: [], sideEffectCeiling: "read", deletionGuarantee: "none" });
  expect(validateAdapterManifest(readOnly).deletionGuarantee).toBe("none");
});

function request(overrides: Record<string, unknown> = {}) {
  return { tenantSlug: "tenant-a", adapterId: "creator-os", task: "draft.post", idempotencyKey: KEY, budgetMaxMicros: 250_000, input: { topic: "x" }, ...overrides };
}

test("task requests take the side-effect class from the manifest, not the caller", () => {
  const parsed = validateAdapterManifest(manifest());
  const draft = validateAdapterTaskRequest(request({ sideEffect: "read" }), parsed);
  expect(draft.sideEffect).toBe("draft");
  expect(code(() => validateAdapterTaskRequest(request({ task: "delete.everything" }), parsed))).toBe("unknown_task");
  expect(code(() => validateAdapterTaskRequest(request({ adapterId: "forge" }), parsed))).toBe("invalid_adapter_id");
  expect(code(() => validateAdapterTaskRequest(request({ budgetMaxMicros: 1.5 }), parsed))).toBe("invalid_micros");
  expect(code(() => validateAdapterTaskRequest(request({ tenantSlug: "Tenant A" }), parsed))).toBe("invalid_tenant_slug");
  expect(code(() => validateAdapterTaskRequest(request({ idempotencyKey: "short" }), parsed))).toBe("invalid_idempotency_key");
});

test("publish-class tasks need an approval bound to the exact action hash", () => {
  const parsed = validateAdapterManifest(manifest());
  expect(code(() => validateAdapterTaskRequest(request({ task: "publish.post" }), parsed))).toBe("approval_required");
  expect(code(() => validateAdapterTaskRequest(request({ task: "publish.post", approval: { approvalId: "nope", actionHash: sha("a") } }), parsed))).toBe("invalid_input");
  expect(code(() => validateAdapterTaskRequest(request({ task: "publish.post", approval: { approvalId: UUID_A, actionHash: "abc" } }), parsed))).toBe("invalid_hash");
  const ok = validateAdapterTaskRequest(request({ task: "publish.post", approval: { approvalId: UUID_A, actionHash: sha("a") } }), parsed);
  expect(ok.approval?.approvalId).toBe(UUID_A);
});

function proposal(overrides: Record<string, unknown> = {}) {
  const content = "A reviewed fact that an adapter proposes for the shared workspace memory.";
  return {
    tenantSlug: "tenant-a",
    adapterId: "knowledge",
    idempotencyKey: KEY,
    content,
    contentSha256: sha(content),
    provenance: { sourceTaskId: "task-1", adapterVersion: "0.1.0", agentPrincipal: "ingest", confidence: 0.8, sourceUrl: "https://example.com/a", sourceSha256: sha("page") },
    ...overrides,
  };
}

test("memory proposals carry provenance and an honest hash", () => {
  expect(validateMemoryProposal(proposal(), { sha256: sha }).provenance.confidence).toBe(0.8);
  expect(code(() => validateMemoryProposal(proposal({ contentSha256: sha("different") }), { sha256: sha }))).toBe("invalid_hash");
  expect(code(() => validateMemoryProposal(proposal({ content: "" })))).toBe("invalid_input");
  expect(code(() => validateMemoryProposal(proposal({ content: "x".repeat(30_001) })))).toBe("invalid_input");
  expect(code(() => validateMemoryProposal(proposal({ provenance: { sourceTaskId: "t", adapterVersion: "1", agentPrincipal: "p", confidence: 1.2 } })))).toBe("invalid_input");
  expect(code(() => validateMemoryProposal(proposal({ provenance: { sourceTaskId: "t", adapterVersion: "1", agentPrincipal: "p", confidence: 0.5, sourceUrl: "file:///etc/passwd" } })))).toBe("invalid_input");
  expect(code(() => validateMemoryProposal(proposal({ provenance: { sourceTaskId: "t", adapterVersion: "1", agentPrincipal: "p", confidence: 0.5, sourceSha256: "zz" } })))).toBe("invalid_hash");
});

test("a tombstone receipt must name the event, carry a hash and a non-negative count", () => {
  const ok = validateTombstoneReceipt({ tenantSlug: "tenant-a", adapterId: "forge", eventId: UUID_A, receiptSha256: sha("r"), deletedCount: 3 });
  expect(ok.deletedCount).toBe(3);
  expect(code(() => validateTombstoneReceipt({ tenantSlug: "tenant-a", adapterId: "forge", eventId: "x", receiptSha256: sha("r"), deletedCount: 3 }))).toBe("invalid_input");
  expect(code(() => validateTombstoneReceipt({ tenantSlug: "tenant-a", adapterId: "forge", eventId: UUID_A, receiptSha256: sha("r"), deletedCount: -1 }))).toBe("invalid_input");
});

test("state machines only move forward and terminal states stay terminal", () => {
  expect(canTransition(PROMOTION_TRANSITIONS, "quarantined", "approved")).toBe(true);
  expect(canTransition(PROMOTION_TRANSITIONS, "approved", "quarantined")).toBe(false);
  expect(canTransition(PROMOTION_TRANSITIONS, "rejected", "approved")).toBe(false);
  expect(canTransition(MEMORY_ITEM_TRANSITIONS, "tombstoned", "active")).toBe(false);
  expect(canTransition(MEMORY_ITEM_TRANSITIONS, "superseded", "active")).toBe(false);
  expect(canTransition(APPROVAL_TRANSITIONS, "pending", "executed")).toBe(false);
  expect(canTransition(APPROVAL_TRANSITIONS, "approved", "executed")).toBe(true);
  expect(canTransition(APPROVAL_TRANSITIONS, "executed", "approved")).toBe(false);
});

test("the requester can never be the reviewer, however the name is written", () => {
  expect(code(() => assertDistinctReviewer("Maker@Example.com ", "maker@example.com"))).toBe("reviewer_must_differ");
  expect(code(() => assertDistinctReviewer("maker@example.com", "checker@example.com"))).toBe("no_error");
});

test("an approval is usable once, before it expires", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  expect(isApprovalUsable({ status: "approved", expiresAt: "2026-10-19T13:00:00Z" }, now)).toBe(true);
  expect(isApprovalUsable({ status: "approved", expiresAt: "2026-10-19T11:00:00Z" }, now)).toBe(false);
  expect(isApprovalUsable({ status: "executed", expiresAt: "2026-10-19T13:00:00Z" }, now)).toBe(false);
  expect(isApprovalUsable({ status: "pending", expiresAt: "2026-10-19T13:00:00Z" }, now)).toBe(false);
});

test("the TypeScript contract and the SQL data model use the same values", () => {
  const sql = readFileSync("product-experience/supabase-client-adapter-host.sql", "utf8");
  const lists: Record<string, readonly string[]> = {
    memory: MEMORY_ITEM_STATUSES,
    promotion: PROMOTION_STATUSES,
    approval: APPROVAL_STATUSES,
    actionKinds: APPROVAL_ACTION_KINDS,
    deletion: DELETION_GUARANTEES,
    budget: BUDGET_EVENT_KINDS,
  };
  for (const [name, values] of Object.entries(lists)) {
    for (const value of values) expect(sql, `${name}: ${value}`).toContain(`'${value}'`);
  }
  expect(ADAPTER_OPERATIONS).toHaveLength(10);
  expect(sql).toContain("'disabled', 'preview', 'enabled', 'suspended'");
});

// Added by the Phase 1 mutation sweep (item 16): field checks that no test reached.
test("manifest field checks: operations must be a list, enum fields must be known values, task names and adapter ids must be valid", () => {
  expect(code(() => validateAdapterManifest(manifest({ operations: "manifest,health" })))).toBe("invalid_input");
  expect(code(() => validateAdapterManifest(manifest({ operations: null })))).toBe("invalid_input");
  expect(code(() => validateAdapterManifest(manifest({ sideEffectCeiling: "root" })))).toBe("invalid_input");
  expect(code(() => validateAdapterManifest(manifest({ sideEffectCeiling: undefined })))).toBe("invalid_input");
  expect(code(() => validateAdapterManifest(manifest({ deletionGuarantee: "maybe" })))).toBe("invalid_input");
  expect(code(() => validateAdapterManifest(manifest({ tasks: [{ name: "Bad Name!", sideEffect: "draft" }] })))).toBe("invalid_input");
  expect(code(() => validateAdapterManifest(manifest({ tasks: [{ name: "draft.post", sideEffect: "everything" }] })))).toBe("invalid_input");
  for (const bad of ["Bad Adapter", "x", "-leading", 7, null]) {
    expect(code(() => validateAdapterManifest(manifest({ adapterId: bad })))).toBe("invalid_adapter_id");
    expect(code(() => validateMemoryProposal(proposal({ adapterId: bad })))).toBe("invalid_adapter_id");
  }
});
