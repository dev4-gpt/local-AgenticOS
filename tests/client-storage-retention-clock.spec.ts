import { expect, test } from "@playwright/test";
import { uploadClientStorageObject } from "../src/lib/clientStorage";
import { evaluateClientStorageConfig } from "../scripts/lib/client-storage-config-check.mjs";
import { evaluateClientStorageObjectInventory } from "../scripts/lib/client-storage-object-inventory.mjs";
import { clientStorageRetentionClock, clientStorageLifecycleRules } from "../src/lib/clientStorageRetentionClock.mjs";

const day = 86_400_000;
const savedFetch = globalThis.fetch;
const savedEnv = { ...process.env };
test.afterEach(() => { globalThis.fetch = savedFetch; process.env = { ...savedEnv }; });

test("uploads carry the original expiry anchor instead of renewing storage age", async () => {
  process.env.CLIENT_RETENTION_DAYS = "28";
  const expiry = new Date(Date.now() + day).toISOString();
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return new Response(null, { status: 200 }); };
  expect(await uploadClientStorageObject({ bucket: "fixture-bucket", objectKey: "tenant-a/file.bin", contentType: "application/octet-stream",
    bytes: Buffer.from([0, 1, 255]), token: "fixture-only", retentionExpiresAt: expiry })).toBe(true);
  const headers = new Headers(calls[0].options?.headers);
  expect(headers.get("x-goog-custom-time")).toBe(new Date(Date.parse(expiry) - 28 * day).toISOString());
  expect(calls).toHaveLength(1);
  expect(calls[0].options?.method).toBe("PUT");
  expect(headers.get("x-goog-if-generation-match")).toBe("0");
  expect(headers.get("x-goog-meta-agentos-retention-expires-at")).toBe(expiry);
  expect(headers.get("cache-control")).toBe("private, no-store");
  expect(Buffer.from(calls[0].options?.body as Uint8Array)).toEqual(Buffer.from([0, 1, 255]));
});

test("retention clocks preserve shorter and restored deadlines, not a new upload window", () => {
  const now = Date.now();
  const expiry = new Date(now + day).toISOString();
  const clock = clientStorageRetentionClock(expiry, 28, now);
  expect(Date.parse(clock!.customTime) + 28 * day).toBe(Date.parse(expiry));
  expect(Date.parse(clock!.customTime)).toBe(now - 27 * day);
  expect(clientStorageRetentionClock(expiry, "14", now)?.customTime).toBe(new Date(now - 13 * day).toISOString());
  for (const days of ["0", "29", " 28 ", "1e1", "028", null, NaN]) expect(clientStorageRetentionClock(expiry, days, now)).toBeNull();
  for (const value of [undefined, "invalid", new Date(now).toISOString(), new Date(now + 29 * day).toISOString()]) {
    expect(clientStorageRetentionClock(value, "28", now)).toBeNull();
  }
  expect(clientStorageLifecycleRules("tenant-a", 28)).toEqual([
    { action: { type: "Delete" }, condition: { age: 28, matchesPrefix: ["tenant-a/"] } },
    { action: { type: "Delete" }, condition: { daysSinceCustomTime: 28, matchesPrefix: ["tenant-a/"] } },
  ]);
});

test("invalid or expired upload deadlines make no storage request", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(null, { status: 200 }); };
  process.env.CLIENT_RETENTION_DAYS = "28";
  const base = { bucket: "fixture-bucket", objectKey: "tenant-a/file.bin", contentType: "application/octet-stream", bytes: Buffer.from("x"), token: "fixture-only" };
  for (const retentionExpiresAt of ["invalid", new Date(Date.now() - day).toISOString()]) {
    expect(await uploadClientStorageObject({ ...base, retentionExpiresAt })).toBe(false);
  }
  process.env.CLIENT_RETENTION_DAYS = "29";
  expect(await uploadClientStorageObject({ ...base, retentionExpiresAt: new Date(Date.now() + day).toISOString() })).toBe(false);
  expect(calls).toEqual([]);
});

test("create-only upload conflicts do not overwrite or retry without the original clock", async () => {
  process.env.CLIENT_RETENTION_DAYS = "28";
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return new Response(null, { status: 412 }); };
  expect(await uploadClientStorageObject({ bucket: "fixture-bucket", objectKey: "tenant-a/name #?.bin", contentType: "application/octet-stream",
    bytes: Buffer.from("one"), token: "fixture-only", retentionExpiresAt: new Date(Date.now() + day).toISOString() })).toBe(false);
  expect(calls).toHaveLength(2);
  expect(calls.filter((call) => call.options?.method === "PUT")).toHaveLength(1);
  expect(calls[0].url).toBe("https://storage.googleapis.com/fixture-bucket/tenant-a/name%20%23%3F.bin");
  expect(new Headers(calls[0].options?.headers).get("Content-MD5")).toBe("+XxdKZQb+xsv2rCHSQargg==");
});

test("an unknown upload outcome is reusable only with identical bytes and original clock metadata", async () => {
  process.env.CLIENT_RETENTION_DAYS = "28";
  const expiry = new Date(Date.now() + day).toISOString();
  const clock = clientStorageRetentionClock(expiry, 28)!;
  const original = { size: "3", contentType: "text/plain", md5Hash: "+XxdKZQb+xsv2rCHSQargg==", customTime: clock.customTime,
    metadata: { "agentos-retention-clock": clock.policy, "agentos-retention-expires-at": expiry } };
  let stored: Record<string, unknown> = original;
  const writes: string[] = [];
  globalThis.fetch = async (url, options) => {
    if (options?.method === "PUT") { writes.push(String(url)); return new Response(null, { status: 412 }); }
    return Response.json(stored);
  };
  const input = { bucket: "fixture-bucket", objectKey: "tenant-a/file.txt", contentType: "text/plain", bytes: Buffer.from("one"), token: "fixture-only", retentionExpiresAt: expiry };
  expect(await uploadClientStorageObject(input)).toBe(true);
  for (const patch of [{ size: "4" }, { contentType: "text/html" }, { md5Hash: "changed" },
    { customTime: new Date().toISOString() }, { metadata: {} }]) {
    stored = { ...original, ...patch };
    expect(await uploadClientStorageObject(input)).toBe(false);
  }
  expect(writes).toHaveLength(6);
});

test("an age-only bucket rule cannot accept restored or delayed-upload deadlines", () => {
  const expected = { bucket: "fixture-bucket", namespace: "tenant-a", origin: "https://tenant.invalid", retentionDays: 28, recoveryDays: 7 };
  const result = evaluateClientStorageConfig({ name: expected.bucket,
    lifecycle: { rule: [{ action: { type: "Delete" }, condition: { age: 28, matchesPrefix: ["tenant-a/"] } }] },
    softDeletePolicy: { retentionDurationSeconds: "604800" },
  }, expected);
  expect(result.ok).toBe(false);
});

test("object inventory rejects bytes past their original deadline despite a fresh storage creation time", () => {
  const now = Date.now();
  const expected = { project: "fixture-project", bucket: "fixture-bucket", namespace: "tenant-a", account: null, retentionDays: 28, recoveryDays: 7 };
  const expiry = new Date(now - day).toISOString();
  const report = evaluateClientStorageObjectInventory({ schemaVersion: 1, bucket: expected.bucket, prefix: "tenant-a/", checkedAt: new Date(now).toISOString(),
    liveListingComplete: true, softDeletedListingComplete: true, softDeletedObjects: [],
    liveObjects: [{ name: "tenant-a/file.bin", generation: "42", timeCreated: new Date(now).toISOString(),
      customTime: new Date(Date.parse(expiry) - 28 * day).toISOString(), eventBasedHold: false, temporaryHold: false,
      metadata: { "agentos-retention-expires-at": expiry, "agentos-retention-clock": "expiry-minus-bucket-days-v1" } }],
    source: { collector: "verify-client-storage-object-inventory-v1", project: expected.project, account: null,
      liveListingMode: "all_versions", softDeletedListingMode: "soft_deleted_exhaustive", liveListingSha256: "a".repeat(64), softDeletedListingSha256: "b".repeat(64) },
  }, expected);
  expect(report.ok).toBe(false);
  expect(report.failures).toContain("live_object_past_active_expiry");
});
