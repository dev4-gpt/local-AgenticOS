import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { loadReviewModule } from "./helpers/load-review-module";

const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const view = loadReviewModule("src/lib/adapterApprovalsView.ts", { "./adapterContracts": contracts });

const ME = "00000000-0000-4000-8000-0000000000a2";
const OTHER = "00000000-0000-4000-8000-0000000000a3";
const NOW = Date.parse("2026-10-20T12:00:00Z");
const iso = (offsetMinutes: number) => new Date(NOW + offsetMinutes * 60_000).toISOString();
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function canonical(extra: Record<string, unknown> = {}) {
  return JSON.stringify({ adapterId: "forge", destination: "https://example.test/post", kind: "publish", payload: { text: "hello", tags: ["a", "b"] }, policyVersion: "policy-1", v: "approval-action-h1", ...extra });
}
function row(extra: Record<string, unknown> = {}) {
  const text = canonical();
  return {
    id: "00000000-0000-4000-8000-000000000001", adapter_id: "forge", action_kind: "publish", action_hash: sha(text), action_canonical: text,
    destination: "https://example.test/post", policy_version: "policy-1", requested_by: OTHER, decided_by: null, status: "pending",
    expires_at: iso(120), decided_at: null, executed_at: null, created_at: iso(-30), ...extra,
  };
}
const body = (approvals: unknown[], extra: Record<string, unknown> = {}) => ({ ok: true, approvals, viewerId: ME, canDecide: true, ...extra });
const cardsFor = (approvals: unknown[], extra: Record<string, unknown> = {}) => view.buildApprovalCards(view.parseApprovalsResponse(body(approvals, extra)), NOW);

test("a waiting request from someone else shows what it covers and offers Approve and Reject to an admin", () => {
  const [card] = cardsFor([row()]);
  expect(card).toMatchObject({ adapterId: "forge", kindLabel: "Publish something outside Veloce", effectiveStatus: "pending", statusLabel: "Waiting for a second person", requestedByLabel: "Another member", canApprove: true, canReject: true, blockedReason: null });
  expect(card.timeLeftLabel).toBe("2 h 0 min left");
  expect(card.content.payloadText).toBe(JSON.stringify({ text: "hello", tags: ["a", "b"] }, null, 2));
  expect(card.shortHash).toBe(card.actionHash.slice(0, 12));
});

test("your own request cannot be approved or rejected by you, and a plain member cannot decide at all", () => {
  const [own] = cardsFor([row({ requested_by: ME })]);
  expect(own).toMatchObject({ requestedByLabel: "You", canApprove: false, canReject: false });
  expect(own.blockedReason).toMatch(/different owner or admin/);
  const [member] = cardsFor([row()], { canDecide: false });
  expect(member).toMatchObject({ canApprove: false, canReject: false });
  expect(member.blockedReason).toMatch(/Only owners and admins/);
});

test("expired, decided and finished requests offer no buttons, and an unexpired-looking row past its time counts as expired", () => {
  for (const status of ["approved", "rejected", "expired", "executed", "cancelled"]) {
    const [card] = cardsFor([row({ status, decided_by: OTHER, decided_at: iso(-5) })]);
    expect([card.canApprove, card.canReject], status).toEqual([false, false]);
  }
  const [late] = cardsFor([row({ expires_at: iso(-1) })]);
  expect(late).toMatchObject({ status: "pending", effectiveStatus: "expired", statusLabel: "Expired", canApprove: false, canReject: false, timeLeftLabel: "Expired" });
  const [approvedLate] = cardsFor([row({ status: "approved", expires_at: iso(-1) })]);
  expect(approvedLate.effectiveStatus).toBe("expired");
  const [done] = cardsFor([row({ status: "executed", decided_by: ME })]);
  expect(done).toMatchObject({ statusLabel: "Done", decidedByLabel: "You", timeLeftLabel: "" });
});

test("a request with no stored text, unreadable text, or text that disagrees with its row can be rejected but never approved", () => {
  const cases: Array<[string, unknown]> = [
    ["no text", null],
    ["not json", "not json"],
    ["not an object", "[1,2]"],
    ["wrong kind", canonical({ kind: "promote" })],
    ["wrong adapter", canonical({ adapterId: "knowledge" })],
    ["wrong destination", canonical({ destination: "https://example.test/other" })],
    ["wrong policy", canonical({ policyVersion: "policy-2" })],
  ];
  for (const [name, text] of cases) {
    const [card] = cardsFor([row({ action_canonical: text })]);
    expect(card, name).toMatchObject({ canApprove: false, canReject: true, content: null });
    expect(card.contentProblem, name).toBeTruthy();
    expect(card.blockedReason, name).toMatch(/can be rejected, but not approved/);
  }
});

test("waiting requests come first, soonest to expire first; the rest follow, newest first", () => {
  const ids = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const cards = cardsFor([
    row({ id: ids(1), status: "rejected", created_at: iso(-300) }),
    row({ id: ids(2), expires_at: iso(600) }),
    row({ id: ids(3), status: "approved", expires_at: iso(300) }),
    row({ id: ids(4), expires_at: iso(60) }),
    row({ id: ids(5), status: "executed", created_at: iso(-10) }),
  ]);
  expect(cards.map((c: { id: string }) => c.id)).toEqual([ids(4), ids(2), ids(3), ids(5), ids(1)]);
  expect(view.waitingCount(cards)).toBe(2);
});

test("time left is shown in plain units", () => {
  const left = (minutes: number) => view.timeLeftLabel(iso(minutes), NOW);
  expect(left(0)).toBe("Expired");
  expect(left(-5)).toBe("Expired");
  expect(left(0.5)).toBe("Less than a minute left");
  expect(left(45)).toBe("45 min left");
  expect(left(90)).toBe("1 h 30 min left");
  expect(left(60 * 47)).toBe("47 h 0 min left");
  expect(left(60 * 49)).toBe("2 days 1 h left");
  expect(view.timeLeftLabel("not a date", NOW)).toBe("Expired");
});

test("a malformed answer is rejected instead of shown", () => {
  const bad: unknown[] = [
    null, "x", { ok: false }, body("nope" as never), { ok: true, approvals: [], canDecide: true }, { ok: true, approvals: [], viewerId: ME },
    body([row({ id: "not-a-uuid" })]), body([row({ adapter_id: "BAD" })]), body([row({ action_kind: "delete" })]), body([row({ action_hash: "abc" })]),
    body([row({ status: "maybe" })]), body([row({ expires_at: "soon" })]), body([row({ requested_by: "x" })]), body([row({ decided_by: "x" })]),
    body([row({ destination: "" })]), body([row({ policy_version: "p".repeat(81) })]), body([row({ action_canonical: "x".repeat(16_385) })]),
    body([row({ action_canonical: 5 })]), body([null]), body(Array.from({ length: 101 }, () => row())), body([row()], { viewerId: "" }),
  ];
  for (const value of bad) expect(view.parseApprovalsResponse(value), JSON.stringify(value)?.slice(0, 70)).toBeNull();
  expect(view.parseApprovalsResponse(body([]))).toMatchObject({ rows: [], viewerId: ME, canDecide: true });
  // rows from before the stored text existed are still valid, they just cannot be approved
  expect(view.parseApprovalsResponse(body([row({ action_canonical: undefined })]))).not.toBeNull();
});

test("the screen's messages for decision errors are plain, and unknown errors never leak", () => {
  expect(view.decisionErrorMessage("requester_cannot_decide")).toMatch(/someone else/);
  expect(view.decisionErrorMessage("not_pending")).toMatch(/already decided or has expired/);
  expect(view.decisionErrorMessage("hash_mismatch")).toMatch(/changed/);
  expect(view.decisionErrorMessage("not_allowed")).toMatch(/owners and admins/);
  const generic = view.decisionErrorMessage("relation secret_table does not exist");
  expect(generic).toBe("The decision could not be recorded. Nothing was changed.");
  expect(view.decisionErrorMessage(undefined)).toBe(generic);
});
