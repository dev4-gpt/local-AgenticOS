#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";

const DAY_MS = 86_400_000;
const FINANCIAL_OR_AUDIT = new Set(["client_runtime_budget_ledger", "client_runtime_audit_events"]);

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function auditClientRetentionSnapshot(snapshot, { windowDays = 45, asOf = new Date().toISOString() } = {}) {
  const input = record(snapshot);
  const tables = record(input?.tables);
  const now = Date.parse(asOf);
  if (input?.schemaVersion !== 3 || typeof input.slug !== "string" || !/^[a-z][a-z0-9-]{2,40}$/.test(input.slug)
    || !tables || !Number.isSafeInteger(windowDays) || windowDays < 1 || windowDays > 3650 || !Number.isFinite(now)
    || !Number.isFinite(Date.parse(input.exportedAt))) throw new Error("retention_snapshot_invalid");
  const tenant = tables.client_tenants;
  if (!Array.isArray(tenant) || tenant.length !== 1 || tenant[0]?.slug !== input.slug) throw new Error("retention_snapshot_tenant_invalid");
  const configuredDays = tenant[0].retention_days;
  if (!Number.isSafeInteger(configuredDays) || configuredDays < 1 || configuredDays > 3650) throw new Error("retention_snapshot_tenant_invalid");

  const cutoff = now - windowDays * DAY_MS;
  const tableInventory = [];
  for (const [table, rows] of Object.entries(tables)) {
    if (!/^[a-z][a-z0-9_]{0,80}$/.test(table) || !Array.isArray(rows)) throw new Error("retention_snapshot_table_invalid");
    let olderThanWindow = 0;
    let undated = 0;
    for (const row of rows) {
      const item = record(row);
      if (!item || (table === "client_tenants" ? item.slug !== input.slug : item.tenant_slug !== input.slug)) {
        throw new Error("retention_snapshot_scope_invalid");
      }
      const createdAt = typeof item.created_at === "string" ? Date.parse(item.created_at) : NaN;
      if (!Number.isFinite(createdAt)) undated += 1;
      else if (createdAt < cutoff) olderThanWindow += 1;
    }
    tableInventory.push({ table, rows: rows.length, olderThanWindow, undated, protected: FINANCIAL_OR_AUDIT.has(table) });
  }
  tableInventory.sort((a, b) => a.table.localeCompare(b.table));
  return {
    schemaVersion: 1,
    asOf: new Date(now).toISOString(),
    windowDays,
    tenantStatus: typeof tenant[0].status === "string" ? tenant[0].status : "unknown",
    configuredTenantRetentionDays: configuredDays,
    windowMatchesTenantConfiguration: configuredDays === windowDays,
    tableInventory,
    retentionEnforced: false,
    deletionCandidatesApproved: false,
    limitations: [
      "Record age is an inventory signal, not deletion eligibility or a 45-day enforcement receipt.",
      "Snapshot table and object-store completeness require separate verification.",
      "Managed-credit, billing, refund, backup, and vendor records require separate reviewed retention rules.",
    ],
  };
}

if (process.argv[1]?.endsWith("/audit-client-retention-snapshot.mjs")) {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) {
    console.error("Usage: node scripts/audit-client-retention-snapshot.mjs <private-lifecycle-export.json>");
    process.exitCode = 2;
  } else {
    try {
      if ((statSync(file).mode & 0o077) !== 0) throw new Error("retention_snapshot_permissions_invalid");
      const result = auditClientRetentionSnapshot(JSON.parse(readFileSync(file, "utf8")));
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "retention_snapshot_invalid");
      process.exitCode = 1;
    }
  }
}
