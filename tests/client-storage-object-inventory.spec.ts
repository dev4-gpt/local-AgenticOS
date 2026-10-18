import { expect, test } from "@playwright/test";
import { evaluateClientStorageObjectInventory, validClientStorageObjectInventoryReport } from "../scripts/lib/client-storage-object-inventory.mjs";

const expected = { project: "agentos-mvp", bucket: "agentos-mvp-veloce-internal-beta", namespace: "internal-beta", account: null,
  supabaseProjectRef: "abcdefghijklmnopqrst", retentionDays: 28, recoveryDays: 7 };
const source = {
  collector: "verify-client-storage-object-inventory-v1", project: expected.project, account: null,
  liveListingMode: "all_versions", softDeletedListingMode: "soft_deleted_exhaustive",
  liveListingSha256: "a".repeat(64), softDeletedListingSha256: "b".repeat(64),
};
const now = new Date().toISOString();
const liveObject = { name: "internal-beta/private-name.bin", generation: "42", size: "3", contentType: "application/octet-stream",
  timeCreated: now, eventBasedHold: false, temporaryHold: false };

type InventoryObject = typeof liveObject & { customTime?: string; metadata?: Record<string, string> };
function withClock(object: InventoryObject) {
  return { ...object, customTime: object.customTime ?? object.timeCreated, metadata: object.metadata ?? {
    "agentos-retention-expires-at": new Date(Date.parse(object.timeCreated) + 28 * 86_400_000).toISOString(),
    "agentos-retention-clock": "expiry-minus-bucket-days-v1",
  } };
}
function snapshot(liveObjects: InventoryObject[] = [liveObject], softDeletedObjects: InventoryObject[] = []) {
  const objects = [...liveObjects, ...softDeletedObjects].map(withClock);
  const rows = objects.map((object, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    tenant_slug: expected.namespace, object_key: object.name, status: "ready", byte_size: 3, content_type: liveObject.contentType,
    created_at: object.customTime, retention_expires_at: object.metadata["agentos-retention-expires-at"] }));
  const sample = { startedAt: now, completedAt: now, complete: true, rows };
  return {
    schemaVersion: 1, bucket: expected.bucket, prefix: "internal-beta/", checkedAt: now,
    listingStartedAt: now, listingCompletedAt: now,
    artifactInventory: { schemaVersion: 1, projectRef: expected.supabaseProjectRef, namespace: expected.namespace, before: sample, after: structuredClone(sample) },
    liveListingComplete: true, softDeletedListingComplete: true, liveObjects: liveObjects.map(withClock), softDeletedObjects: softDeletedObjects.map(withClock), source,
  };
}

test("object inventory accepts in-scope objects and emits only hashes and counts", () => {
  const report = evaluateClientStorageObjectInventory(snapshot(), expected);
  expect(report).toMatchObject({ schemaVersion: 4, ok: true, retentionDays: 28, recoveryDays: 7, liveObjectVersions: 1, softDeletedObjectVersions: 0 });
  expect(JSON.stringify(report)).not.toContain("private-name.bin");
  expect(validClientStorageObjectInventoryReport({ ...report, account: null }, expected)).toBe(true);
  expect(validClientStorageObjectInventoryReport({ ...report, recoveryDays: 30 }, expected)).toBe(false);
  expect(validClientStorageObjectInventoryReport({ ...report, retentionDays: undefined }, expected)).toBe(false);
  expect(validClientStorageObjectInventoryReport({ ...report, schemaVersion: 2 }, expected)).toBe(false);
  expect(validClientStorageObjectInventoryReport({ ...report, schemaVersion: 3 }, expected)).toBe(false);
  expect(validClientStorageObjectInventoryReport({ ...report, retentionClock: undefined }, expected)).toBe(false);
});

test("object inventory rejects holds, overdue live bytes, and retention beyond 28 days", () => {
  const old = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
  const report = evaluateClientStorageObjectInventory(snapshot([{
    ...liveObject, timeCreated: old, eventBasedHold: true,
    retentionExpirationTime: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString(),
  }]), expected);
  expect(report.failures).toEqual(expect.arrayContaining([
    "object_hold_active", "live_object_past_active_expiry", "object_retention_exceeds_active_window",
  ]));
  expect(validClientStorageObjectInventoryReport({ ...report, account: null }, expected)).toBe(false);
});

test("soft-deleted bytes must be hard-deleted within seven recovery days and 35 total", () => {
  const created = new Date(Date.now() - 34 * 24 * 60 * 60 * 1000).toISOString();
  const softDelete = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const report = evaluateClientStorageObjectInventory(snapshot([], [{
    ...liveObject, timeCreated: created, softDeleteTime: softDelete,
    hardDeleteTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    eventBasedHold: false, temporaryHold: false,
  }]), expected);
  expect(report.failures).toEqual(expect.arrayContaining([
    "soft_delete_recovery_exceeds_policy", "object_total_retention_exceeds_policy",
  ]));
});

test("soft-deleted bytes must retain the complete seven-day recovery window", () => {
  const softDelete = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const created = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
  const hardDelete = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const report = evaluateClientStorageObjectInventory(snapshot([], [{
    ...liveObject, timeCreated: created, softDeleteTime: softDelete,
    hardDeleteTime: hardDelete, eventBasedHold: false, temporaryHold: false,
  }]), expected);
  expect(report.failures).toContain("soft_delete_recovery_shorter_than_policy");

  const exactBoundary = evaluateClientStorageObjectInventory(snapshot([], [{
    ...liveObject, timeCreated: created, softDeleteTime: softDelete,
    hardDeleteTime: new Date(Date.parse(softDelete) + 7 * 24 * 60 * 60 * 1000).toISOString(),
    eventBasedHold: false, temporaryHold: false,
  }]), expected);
  expect(exactBoundary.failures).not.toContain("soft_delete_recovery_shorter_than_policy");
  expect(exactBoundary.failures).not.toContain("soft_delete_recovery_exceeds_policy");
});

test("inventory requires both complete listings and exact tenant prefix", () => {
  const incomplete = snapshot();
  incomplete.softDeletedListingComplete = false;
  incomplete.liveObjects = [{ ...liveObject, name: "another-tenant/object.bin" }];
  const report = evaluateClientStorageObjectInventory(incomplete, expected);
  expect(report.failures).toEqual(expect.arrayContaining(["object_inventory_incomplete", "object_outside_tenant_scope_or_unidentified"]));
});

test("original-deadline evidence is required, hashed and bounded for restored copies", () => {
  const current = Date.now();
  const expiry = new Date(current + 86_400_000).toISOString();
  const object = { ...liveObject, timeCreated: new Date(current).toISOString(), customTime: new Date(Date.parse(expiry) - 28 * 86_400_000).toISOString(),
    metadata: { "agentos-retention-expires-at": expiry, "agentos-retention-clock": "expiry-minus-bucket-days-v1" } };
  const original = evaluateClientStorageObjectInventory(snapshot([object]), expected);
  expect(original.ok).toBe(true);
  const changed = evaluateClientStorageObjectInventory(snapshot([{ ...object, metadata: { ...object.metadata, "agentos-retention-expires-at": new Date(current + 2 * 86_400_000).toISOString() } }]), expected);
  expect(changed.failures).toContain("object_original_retention_clock_invalid");
  expect(changed.objectInventorySha256).not.toBe(original.objectInventorySha256);
  const missing = evaluateClientStorageObjectInventory(snapshot([{ ...object, customTime: undefined, metadata: {} }]), expected);
  expect(missing.failures).toContain("object_original_retention_clock_invalid");
  const pastExpiry = new Date(current - 86_400_000).toISOString();
  const deleted = evaluateClientStorageObjectInventory(snapshot([], [{ ...object,
    customTime: new Date(Date.parse(pastExpiry) - 28 * 86_400_000).toISOString(),
    metadata: { ...object.metadata, "agentos-retention-expires-at": pastExpiry },
    softDeleteTime: new Date(current).toISOString(), hardDeleteTime: new Date(current + 7 * 86_400_000).toISOString(),
  }]), expected);
  expect(deleted.failures).toContain("object_total_retention_exceeds_policy");
  expect(deleted.failures).not.toContain("soft_delete_recovery_exceeds_policy");
});
