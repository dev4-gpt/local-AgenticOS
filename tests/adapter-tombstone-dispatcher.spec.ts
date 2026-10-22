import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const guard = loadReviewModule("src/lib/adapterMemoryGuard.ts", { "./adapterContracts": contracts });
const puller = loadReviewModule("src/lib/adapterEventsPuller.ts", { "./adapterContracts": contracts, "./adapterMemoryGuard": guard });
const dispatcher = loadReviewModule("src/lib/adapterTombstoneDispatcher.ts", { "./adapterContracts": contracts, "./adapterEventsPuller": puller });

const TENANT = "tenant-a";
const ADAPTER = "creator-os";
const BASE = "https://creator.example.test";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hex = (n: number, len: number) => n.toString(16).padStart(len, "0");
const due = (n: number) => ({ event_id: uuid(n), item_id: uuid(n + 100), adapter_event_id: hex(n, 32), content_sha256: hex(n, 64), attempts: 0 });
const receiptFor = (n: number, over: Record<string, unknown> = {}) => ({ tenantSlug: TENANT, adapterId: ADAPTER, eventId: uuid(n), receiptSha256: hex(n + 1000, 64), deletedCount: 3, ...over });

type Calls = { name: string; body: Record<string, unknown> }[];
function fakeDb(o: { due?: unknown; pendingFails?: boolean; attemptFails?: boolean; ack?: (body: Record<string, unknown>) => { ok: boolean; value: unknown }; summary?: unknown } = {}) {
  const calls: Calls = [];
  const rpc = async (name: string, body: Record<string, unknown>) => {
    calls.push({ name, body });
    if (name === "client_adapter_tombstones_pending") return o.pendingFails ? { ok: false, status: 503, value: null } : { ok: true, status: 200, value: o.due ?? [] };
    if (name === "client_adapter_tombstone_attempt") return { ok: !o.attemptFails, status: 200, value: !o.attemptFails };
    if (name === "client_adapter_tombstone_ack") return { status: 200, ...(o.ack ? o.ack(body) : { ok: true, value: true }) };
    return { ok: true, status: 200, value: o.summary ?? { pending: 0, gave_up: 0, acknowledged: 0, exposures: 0 } };
  };
  return { rpc, calls };
}

type Seen = { url: string; headers: Record<string, string>; body: Record<string, unknown>; redirect?: string };
/** A fake adapter: one scripted answer per request, in order (the last repeats). */
function fakeAdapter(answers: Array<(request: Seen) => Response | Promise<Response>>) {
  const seen: Seen[] = [];
  const fetchImpl = async (url: string, init: { headers: Record<string, string>; body: string; redirect?: string }) => {
    const request = { url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown>, redirect: init.redirect };
    seen.push(request);
    return answers[Math.min(seen.length - 1, answers.length - 1)]!(request);
  };
  return { fetchImpl: fetchImpl as unknown as typeof fetch, seen };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
/** Answers with the correct receipt for whatever event id was asked about. */
const accepts = (request: Seen) => json(200, { ok: true, receipt: { tenantSlug: TENANT, adapterId: ADAPTER, eventId: request.body.eventId, receiptSha256: hex(77, 64), deletedCount: 3 } });

function run(db: ReturnType<typeof fakeDb>, adapter: ReturnType<typeof fakeAdapter>, cfg: Record<string, unknown> = {}) {
  let tokens = 0;
  return dispatcher.dispatchTombstones({ tenantSlug: TENANT, adapterId: ADAPTER, baseUrl: BASE, ...cfg }, { rpc: db.rpc, fetchImpl: adapter.fetchImpl, mintToken: () => `token-${++tokens}` });
}
const names = (db: ReturnType<typeof fakeDb>) => db.calls.map((c) => c.name);

test("each due note is sent to the adapter with its own token and its own event id, and the receipt is recorded", async () => {
  const db = fakeDb({ due: [due(1), due(2)], summary: { pending: 0, gave_up: 0, acknowledged: 2, exposures: 1 } });
  const adapter = fakeAdapter([accepts]);
  const report = await run(db, adapter);
  expect(report).toMatchObject({ adapterId: ADAPTER, due: 2, acknowledged: 2, failed: {}, stopped: null, summary: { pending: 0, gaveUp: 0, acknowledged: 2, exposures: 1 } });
  expect(adapter.seen.map((s) => s.url)).toEqual([`${BASE}/h1/memory.tombstone`, `${BASE}/h1/memory.tombstone`]);
  expect(adapter.seen.map((s) => s.headers.authorization)).toEqual(["Bearer token-1", "Bearer token-2"]);
  expect(adapter.seen.every((s) => s.redirect === "manual")).toBe(true);
  expect(adapter.seen[0]!.body).toEqual({ tenantSlug: TENANT, adapterId: ADAPTER, eventId: uuid(1), targets: [{ adapterEventId: hex(1, 32), contentSha256: hex(1, 64) }] });
  const acks = db.calls.filter((c) => c.name === "client_adapter_tombstone_ack").map((c) => c.body);
  expect(acks).toEqual([{ p_event_id: uuid(1), p_receipt_sha256: hex(77, 64), p_deleted_count: 3 }, { p_event_id: uuid(2), p_receipt_sha256: hex(77, 64), p_deleted_count: 3 }]);
  expect(names(db)).toEqual(["client_adapter_tombstones_pending", "client_adapter_tombstone_attempt", "client_adapter_tombstone_ack", "client_adapter_tombstone_attempt", "client_adapter_tombstone_ack", "client_adapter_tombstone_summary"]);
});

test("a receipt is recorded only if it answers this very request; anything else is a failed try and nothing is recorded", async () => {
  const bad: Record<string, unknown> = {
    "another event id": { ok: true, receipt: receiptFor(9) },
    "another tenant": { ok: true, receipt: receiptFor(1, { tenantSlug: "tenant-b" }) },
    "another adapter": { ok: true, receipt: receiptFor(1, { adapterId: "someone-else" }) },
    "a short hash": { ok: true, receipt: receiptFor(1, { receiptSha256: "abc" }) },
    "a negative count": { ok: true, receipt: receiptFor(1, { deletedCount: -1 }) },
    "a fractional count": { ok: true, receipt: receiptFor(1, { deletedCount: 1.5 }) },
    "an absurd count": { ok: true, receipt: receiptFor(1, { deletedCount: 2_000_000 }) },
    "no receipt": { ok: true },
    "not ok": { ok: false, receipt: receiptFor(1) },
    "an array": [],
  };
  for (const [name, body] of Object.entries(bad)) {
    const db = fakeDb({ due: [due(1)] });
    const report = await run(db, fakeAdapter([() => json(200, body)]));
    expect(report.acknowledged, name).toBe(0);
    expect(Object.keys(report.failed), name).toHaveLength(1);
    expect(names(db), name).not.toContain("client_adapter_tombstone_ack");
    expect(names(db), name).toContain("client_adapter_tombstone_attempt"); // the adapter answered, so that was a try
  }
});

test("an adapter that refuses, redirects or breaks is a counted try with a reason; one that cannot be reached is not a try at all", async () => {
  const outcome = async (answer: () => Response | Promise<Response>) => {
    const db = fakeDb({ due: [due(1)] });
    const report = await run(db, fakeAdapter([answer]));
    return { failed: Object.keys(report.failed)[0], tried: names(db).includes("client_adapter_tombstone_attempt") };
  };
  expect(await outcome(() => json(409, { ok: false, error: "target_mismatch" }))).toEqual({ failed: "target_mismatch", tried: true });
  expect(await outcome(() => json(409, { ok: false, error: "idempotency_conflict" }))).toEqual({ failed: "idempotency_conflict", tried: true });
  expect(await outcome(() => json(401, { ok: false, error: "unauthorized" }))).toEqual({ failed: "unauthorized", tried: true });
  expect(await outcome(() => json(503, { ok: false, error: "unavailable" }))).toEqual({ failed: "unavailable", tried: true });
  expect(await outcome(() => new Response("boom", { status: 500 }))).toEqual({ failed: "http_500", tried: true });
  expect(await outcome(() => json(400, { ok: false, error: "A very long message with spaces and 123 that is not a code" }))).toEqual({ failed: "http_400", tried: true });
  expect(await outcome(() => new Response(null, { status: 302, headers: { location: "https://elsewhere.example.test/" } }))).toEqual({ failed: "redirect_refused", tried: true });
  expect(await outcome(() => new Response("not json", { status: 200 }))).toEqual({ failed: "bad_receipt", tried: true });
  expect(await outcome(() => { throw new Error("network down"); })).toEqual({ failed: "adapter_unreachable", tried: false });
});

test("a response bigger than the cap is not read, and is a failed try", async () => {
  const db = fakeDb({ due: [due(1)] });
  const report = await run(db, fakeAdapter([accepts]), { maxResponseBytes: 20 });
  expect(report.failed).toEqual({ bad_receipt: 1 });
  expect(names(db)).not.toContain("client_adapter_tombstone_ack");
});

test("a database that refuses the receipt is a failed try; one that does not answer stops the run, and the rest is sent next time", async () => {
  const refused = fakeDb({ due: [due(1), due(2)], ack: () => ({ ok: true, value: false }) });
  expect(await run(refused, fakeAdapter([accepts]))).toMatchObject({ acknowledged: 0, failed: { ack_refused: 2 }, stopped: null });
  const down = fakeDb({ due: [due(1), due(2)], ack: () => ({ ok: false, value: null }) });
  const adapter = fakeAdapter([accepts]);
  const report = await run(down, adapter);
  expect(report).toMatchObject({ acknowledged: 0, stopped: "database_unavailable" });
  expect(adapter.seen).toHaveLength(1); // the second note was not even sent
  const noCount = fakeDb({ due: [due(1)], attemptFails: true });
  const second = fakeAdapter([accepts]);
  expect(await run(noCount, second)).toMatchObject({ stopped: "database_unavailable", acknowledged: 0 });
});

test("a list the database cannot give, or one that is malformed, stops the run before anything is sent", async () => {
  for (const database of [fakeDb({ pendingFails: true }), fakeDb({ due: "nope" }), fakeDb({ due: [{ ...due(1), adapter_event_id: "short" }] }), fakeDb({ due: [{ ...due(1), event_id: "not-a-uuid" }] }), fakeDb({ due: [{ ...due(1), content_sha256: "abc" }] }), fakeDb({ due: [null] })]) {
    const adapter = fakeAdapter([accepts]);
    expect(await run(database, adapter)).toMatchObject({ stopped: "database_unavailable", due: 0, acknowledged: 0 });
    expect(adapter.seen).toHaveLength(0);
  }
});

test("nothing due is a quiet success that still reports the books", async () => {
  const db = fakeDb({ due: [], summary: { pending: 2, gave_up: 1, acknowledged: 5, exposures: 0 } });
  const adapter = fakeAdapter([accepts]);
  expect(await run(db, adapter)).toMatchObject({ due: 0, acknowledged: 0, stopped: null, summary: { pending: 2, gaveUp: 1, acknowledged: 5, exposures: 0 } });
  expect(adapter.seen).toHaveLength(0);
});

test("the address and the limits are checked before anything is asked of the database or the adapter", async () => {
  const bad = [{ baseUrl: "http://creator.example.test" }, { baseUrl: "https://user:pw@creator.example.test" }, { baseUrl: "https://creator.example.test/?x=1" }, { baseUrl: "nonsense" }, { baseUrl: "http://127.0.0.1:1" }, { tenantSlug: "Bad Tenant" }, { adapterId: "X" }, { limit: 0 }, { limit: 101 }, { limit: 1.5 }];
  for (const cfg of bad) {
    const db = fakeDb({ due: [due(1)] });
    const adapter = fakeAdapter([accepts]);
    await expect(run(db, adapter, cfg), JSON.stringify(cfg)).rejects.toThrow();
    expect(db.calls).toHaveLength(0);
    expect(adapter.seen).toHaveLength(0);
  }
  const loopback = fakeAdapter([accepts]);
  expect(await run(fakeDb({ due: [due(1)] }), loopback, { baseUrl: "http://127.0.0.1:3000", allowInsecureLoopback: true })).toMatchObject({ acknowledged: 1 });
  expect(loopback.seen[0]!.url).toBe("http://127.0.0.1:3000/h1/memory.tombstone");
});

test("the same answer repeated for the same event is accepted by the database, as when an acknowledgement was lost", async () => {
  const answers = new Map<string, string>();
  const db = fakeDb({ due: [due(1)], ack: (body) => {
    const key = body.p_event_id as string;
    const earlier = answers.get(key);
    answers.set(key, `${body.p_receipt_sha256}`);
    return { ok: true, value: earlier === undefined || earlier === body.p_receipt_sha256 };
  } });
  const adapter = fakeAdapter([accepts]);
  expect(await run(db, adapter)).toMatchObject({ acknowledged: 1 });
  expect(await run(db, adapter)).toMatchObject({ acknowledged: 1 }); // sent again, the adapter replays the same receipt
});

test("the report carries counts and reasons only", async () => {
  const db = fakeDb({ due: [due(1)] });
  const report = await run(db, fakeAdapter([() => json(409, { ok: false, error: "target_mismatch", note: "Customer Jane Doe pays 4111 1111 1111 1111" })]));
  const text = JSON.stringify(report);
  expect(text).not.toContain("Jane Doe");
  expect(text).not.toContain("4111");
});
