import { expect, test } from "@playwright/test";
import { assertClientArtifactRestoreWindow, clientLifecycleRestoreRow } from "../scripts/lib/client-lifecycle-restore.mjs";

const day = 86_400_000;
const now = Date.parse("2026-10-17T00:00:00.000Z");
const iso = (time: number) => new Date(time).toISOString();
const artifact = { tenant_slug: "test-client", object_key: "test-client/file", status: "ready",
  created_at: iso(now - 27 * day), retention_expires_at: iso(now + day) };
const files = [{ objectKey: "test-client/file" }];
const snapshot = (row: Record<string, unknown> = artifact, days: unknown = 28) => ({ slug: "test-client", tables: {
  client_tenants: [{ slug: "test-client", retention_days: days }], client_runtime_artifacts: [row],
} });

test("active artifact restore preserves the original clock without extending it", () => {
  const input = snapshot();
  const before = JSON.stringify(input);
  expect(() => assertClientArtifactRestoreWindow(input, files, now)).not.toThrow();
  expect(JSON.stringify(input)).toBe(before);
  expect(clientLifecycleRestoreRow("client_runtime_artifacts", artifact)).toEqual(artifact);
  expect(() => assertClientArtifactRestoreWindow(input, files, now + day - 1)).not.toThrow();
  expect(() => assertClientArtifactRestoreWindow(input, files, now + day)).toThrow("active window has expired");
});

for (const age of [28, 29, 34, 35, 36]) test(`ordinary restore rejects day-${age} recovery-only or purged content`, () => {
  expect(() => assertClientArtifactRestoreWindow(snapshot({ ...artifact,
    created_at: iso(now - age * day), retention_expires_at: iso(now + (28 - age) * day) }), files, now))
    .toThrow("active window has expired");
});

for (const [name, patch] of Object.entries({
  missingCreation: { created_at: undefined }, missingExpiry: { retention_expires_at: undefined },
  invalidCreation: { created_at: "invalid" }, timezoneFree: { created_at: "2026-09-20T00:00:00" },
  futureCreation: { created_at: iso(now + day) }, reversed: { retention_expires_at: iso(now - 28 * day) },
  extended: { retention_expires_at: iso(now + 2 * day) },
})) test(`artifact restore rejects ${name} clocks`, () => {
  expect(() => assertClientArtifactRestoreWindow(snapshot({ ...artifact, ...patch }), files, now)).toThrow("original retention clock");
});

test("artifact restore enforces the tenant's shorter active window and rejects invalid policy", () => {
  for (const days of [0, 29, 30, "28", null, undefined]) {
    const input = snapshot();
    Object.assign(input.tables.client_tenants[0], { retention_days: days });
    expect(() => assertClientArtifactRestoreWindow(input, files, now)).toThrow("verified tenant retention window");
  }
  expect(() => assertClientArtifactRestoreWindow(snapshot(artifact, 14), files, now)).toThrow("original retention clock");
  expect(() => assertClientArtifactRestoreWindow(snapshot({ ...artifact,
    created_at: iso(now - 13 * day), retention_expires_at: iso(now + day) }, 14), files, now)).not.toThrow();
  expect(() => assertClientArtifactRestoreWindow(snapshot(), files, NaN)).toThrow("verified tenant retention window");
});

test("artifact restore refuses orphan, pending, cross-tenant, duplicate and missing files", () => {
  for (const plan of [[], [...files, ...files], [{ objectKey: "other-client/file" }], [...files, { objectKey: "test-client/extra" }]]) {
    expect(() => assertClientArtifactRestoreWindow(snapshot(), plan, now)).toThrow("match ready artifact metadata exactly");
  }
  expect(() => assertClientArtifactRestoreWindow(snapshot({ ...artifact, status: "pending" }), files, now))
    .toThrow("match ready artifact metadata exactly");
  expect(() => assertClientArtifactRestoreWindow(snapshot({ ...artifact, tenant_slug: "other-client" }), files, now))
    .toThrow("invalid or duplicate tenant metadata");
  const duplicate = snapshot();
  duplicate.tables.client_runtime_artifacts.push(artifact);
  expect(() => assertClientArtifactRestoreWindow(duplicate, files, now)).toThrow("invalid or duplicate tenant metadata");
  const orphan = snapshot();
  orphan.tables.client_runtime_artifacts = [];
  expect(() => assertClientArtifactRestoreWindow(orphan, files, now)).toThrow("match ready artifact metadata exactly");
});
