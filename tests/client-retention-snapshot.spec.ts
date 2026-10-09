import { expect, test } from "@playwright/test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { auditClientRetentionSnapshot } from "../scripts/audit-client-retention-snapshot.mjs";

const asOf = "2026-10-07T00:00:00.000Z";
const old = "2026-08-01T00:00:00.000Z";
const recent = "2026-10-01T00:00:00.000Z";
const boundary = "2026-08-23T00:00:00.000Z";

function snapshot() {
  return {
    schemaVersion: 3,
    slug: "tenant-a",
    exportedAt: asOf,
    tables: {
      client_tenants: [{ slug: "tenant-a", status: "active", retention_days: 45, created_at: old }],
      client_runtime_records: [
        { id: "private-record-id", tenant_slug: "tenant-a", content: "private customer content", created_at: old },
        { id: "new-record-id", tenant_slug: "tenant-a", content: "recent customer content", created_at: recent },
      ],
      client_runtime_budget_ledger: [{ tenant_slug: "tenant-a", amount_micros: 10, created_at: old }],
      client_runtime_audit_events: [{ tenant_slug: "tenant-a", event_type: "private event", created_at: old }],
      client_visual_qa_findings: [{ tenant_slug: "tenant-a", message: "private finding" }],
    },
  };
}

test("retention audit reports age and protected classes without exposing row content", () => {
  const report = auditClientRetentionSnapshot(snapshot(), { windowDays: 45, asOf });
  expect(report.configuredTenantRetentionDays).toBe(45);
  expect(report.windowMatchesTenantConfiguration).toBe(true);
  expect(report.clockStart).toBe("item.created_at");
  expect(report.retentionEnforced).toBe(false);
  expect(report.deletionCandidatesApproved).toBe(false);
  expect(report.tableInventory.find((item) => item.table === "client_runtime_records")).toEqual({
    table: "client_runtime_records", rows: 2, olderThanWindow: 1, dueAtOrBeyondWindow: 1, undated: 0, protected: false,
  });
  expect(report.tableInventory.find((item) => item.table === "client_runtime_budget_ledger")?.protected).toBe(true);
  expect(report.tableInventory.find((item) => item.table === "client_runtime_audit_events")?.protected).toBe(true);
  expect(report.tableInventory.find((item) => item.table === "client_visual_qa_findings")?.undated).toBe(1);
  expect(report.expiryInventory).toEqual([
    { table: "client_runtime_artifacts", present: false, rows: null, missingExpiry: null, invalidExpiry: null, expiredStillPresent: null, expiryAfterWindow: null, readGuardWouldHide: null },
    { table: "client_notebook_sources", present: false, rows: null, missingExpiry: null, invalidExpiry: null, expiredStillPresent: null, expiryAfterWindow: null, readGuardWouldHide: null },
  ]);
  expect(JSON.stringify(report)).not.toMatch(/private|tenant-a|record-id/);
});

test("expiry inventory measures legacy read impact without exposing artifact content", () => {
  const base = snapshot();
  const input = { ...base, tables: { ...base.tables, client_runtime_artifacts: [
    { tenant_slug: "tenant-a", created_at: recent, retention_expires_at: "2026-11-01T00:00:00.000Z", original_name: "private-document.pdf" },
    { tenant_slug: "tenant-a", created_at: recent, retention_expires_at: null, object_key: "tenant-a/private-object" },
    { tenant_slug: "tenant-a", created_at: recent, retention_expires_at: "not-a-date" },
    { tenant_slug: "tenant-a", created_at: old, retention_expires_at: "2026-09-15T00:00:00.000Z" },
    { tenant_slug: "tenant-a", created_at: recent, retention_expires_at: "2026-12-01T00:00:00.000Z" },
  ], client_notebook_sources: [
    { tenant_slug: "tenant-a", created_at: recent, retention_expires_at: "2026-11-01T00:00:00.000Z" },
    { tenant_slug: "tenant-a", created_at: old, retention_expires_at: "2026-09-15T00:00:00.000Z" },
    { tenant_slug: "tenant-a", created_at: old, retention_expires_at: null, deleted_at: "2026-09-01T00:00:00.000Z" },
  ] } };
  const report = auditClientRetentionSnapshot(input, { asOf });
  expect(report.expiryInventory).toEqual([
    { table: "client_runtime_artifacts", present: true, rows: 5, missingExpiry: 1, invalidExpiry: 1, expiredStillPresent: 1, expiryAfterWindow: 1, readGuardWouldHide: 3 },
    { table: "client_notebook_sources", present: true, rows: 3, missingExpiry: 1, invalidExpiry: 0, expiredStillPresent: 1, expiryAfterWindow: 0, readGuardWouldHide: 1 },
  ]);
  expect(report.retentionEnforced).toBe(false);
  expect(JSON.stringify(report)).not.toMatch(/private-document|private-object|tenant-a/);
});

test("retention audit counts an item due at exactly 45 days from creation", () => {
  const input = snapshot();
  input.tables.client_runtime_records = [{ id: "boundary-id", tenant_slug: "tenant-a", created_at: boundary }];
  const report = auditClientRetentionSnapshot(input, { windowDays: 45, asOf });
  expect(report.tableInventory.find((item) => item.table === "client_runtime_records")).toMatchObject({
    rows: 1, olderThanWindow: 0, dueAtOrBeyondWindow: 1,
  });
  expect(report.retentionEnforced).toBe(false);
});

test("retention audit rejects cross-tenant and malformed snapshots", () => {
  const shortWindow = snapshot();
  shortWindow.tables.client_tenants[0].retention_days = 1;
  expect(auditClientRetentionSnapshot(shortWindow, { asOf }).windowMatchesTenantConfiguration).toBe(false);
  const wrongTenant = snapshot();
  wrongTenant.tables.client_runtime_records[0].tenant_slug = "tenant-b";
  expect(() => auditClientRetentionSnapshot(wrongTenant, { asOf })).toThrow("retention_snapshot_scope_invalid");
  expect(() => auditClientRetentionSnapshot({ ...snapshot(), schemaVersion: 2 }, { asOf })).toThrow("retention_snapshot_invalid");
  expect(() => auditClientRetentionSnapshot(snapshot(), { windowDays: 0, asOf })).toThrow("retention_snapshot_invalid");
});

test("retention audit CLI reads only private lifecycle exports", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "retention-audit-"));
  try {
    const file = path.join(directory, "snapshot.json");
    writeFileSync(file, JSON.stringify(snapshot()), { mode: 0o600 });
    const command = [path.join(process.cwd(), "scripts/audit-client-retention-snapshot.mjs"), file];
    const accepted = spawnSync(process.execPath, command, { cwd: process.cwd(), encoding: "utf8" });
    expect(accepted.status).toBe(0);
    expect(JSON.parse(accepted.stdout).tableInventory).toHaveLength(5);
    expect(accepted.stdout).not.toMatch(/private customer content|tenant-a/);
    chmodSync(file, 0o644);
    const rejected = spawnSync(process.execPath, command, { cwd: process.cwd(), encoding: "utf8" });
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("retention_snapshot_permissions_invalid");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
