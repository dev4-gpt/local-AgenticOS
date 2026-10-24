#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";

const DAY_MS = 86_400_000;
const SPECIAL_RETENTION = new Set(["client_runtime_budget_ledger", "client_runtime_audit_events"]);
const EXPIRING_READS = [
  "client_runtime_artifacts",
  "client_notebook_sources",
  "client_learning_items",
  "client_pipeline_items",
  "client_board_tasks",
  "client_board_comments",
  "client_board_events",
  "client_loop_runs",
  "client_loop_rounds",
  "client_paperclip_companies",
  "client_paperclip_projects",
  "client_paperclip_agents",
  "client_paperclip_issues",
  "client_paperclip_comments",
  "client_paperclip_runs",
  "client_hermes_content_factory_runs",
  "client_hermes_content_factory_stage_outputs",
  "client_hermes_content_factory_citations",
  "client_hermes_content_factory_quality_reports",
  "client_hermes_content_factory_approvals",
  "client_hermes_content_factory_deliveries",
  "client_ruflo_swarms",
  "client_ruflo_agents",
];

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function auditClientRetentionSnapshot(snapshot, { windowDays = 28, asOf = new Date().toISOString() } = {}) {
  const input = record(snapshot);
  const tables = record(input?.tables);
  const now = Date.parse(asOf);
  if (input?.schemaVersion !== 3 || typeof input.slug !== "string" || !/^[a-z][a-z0-9-]{2,40}$/.test(input.slug)
    || !tables || !Number.isSafeInteger(windowDays) || windowDays < 1 || windowDays > 28 || !Number.isFinite(now)
    || !Number.isFinite(Date.parse(input.exportedAt))) throw new Error("retention_snapshot_invalid");
  const tenant = tables.client_tenants;
  if (!Array.isArray(tenant) || tenant.length !== 1 || tenant[0]?.slug !== input.slug) throw new Error("retention_snapshot_tenant_invalid");
  const configuredDays = tenant[0].retention_days;
  if (!Number.isSafeInteger(configuredDays) || configuredDays < 1 || configuredDays > 28) throw new Error("retention_snapshot_tenant_invalid");

  const cutoff = now - windowDays * DAY_MS;
  const tableInventory = [];
  for (const [table, rows] of Object.entries(tables)) {
    if (!/^[a-z][a-z0-9_]{0,80}$/.test(table) || !Array.isArray(rows)) throw new Error("retention_snapshot_table_invalid");
    let olderThanWindow = 0;
    let dueAtOrBeyondWindow = 0;
    let undated = 0;
    for (const row of rows) {
      const item = record(row);
      if (!item || (table === "client_tenants" ? item.slug !== input.slug : item.tenant_slug !== input.slug)) {
        throw new Error("retention_snapshot_scope_invalid");
      }
      const createdAt = typeof item.created_at === "string" ? Date.parse(item.created_at) : NaN;
      if (!Number.isFinite(createdAt)) undated += 1;
      else {
        if (createdAt < cutoff) olderThanWindow += 1;
        if (createdAt <= cutoff) dueAtOrBeyondWindow += 1;
      }
    }
    tableInventory.push({ table, rows: rows.length, olderThanWindow, dueAtOrBeyondWindow, undated, specialRetention: SPECIAL_RETENTION.has(table) });
  }
  tableInventory.sort((a, b) => a.table.localeCompare(b.table));
  const expiryInventory = EXPIRING_READS.map((table) => {
    const rows = tables[table];
    if (!Array.isArray(rows)) return { table, present: false, rows: null, missingExpiry: null, invalidExpiry: null, expiredStillPresent: null, expiryAfterWindow: null, readGuardWouldHide: null };
    const counts = { missingExpiry: 0, invalidExpiry: 0, expiredStillPresent: 0, expiryAfterWindow: 0, readGuardWouldHide: 0 };
    for (const row of rows) {
      const visible = table !== "client_notebook_sources" || row.deleted_at === null || row.deleted_at === undefined;
      if (row.retention_expires_at === null || row.retention_expires_at === undefined || row.retention_expires_at === "") {
        counts.missingExpiry++;
        if (visible) counts.readGuardWouldHide++;
        continue;
      }
      const expiresAt = typeof row.retention_expires_at === "string" ? Date.parse(row.retention_expires_at) : NaN;
      if (!Number.isFinite(expiresAt)) {
        counts.invalidExpiry++;
        if (visible) counts.readGuardWouldHide++;
        continue;
      }
      if (expiresAt <= now) {
        counts.expiredStillPresent++;
        if (visible) counts.readGuardWouldHide++;
      }
      const createdAt = typeof row.created_at === "string" ? Date.parse(row.created_at) : NaN;
      if (Number.isFinite(createdAt) && expiresAt > createdAt + windowDays * DAY_MS) counts.expiryAfterWindow++;
    }
    return { table, present: true, rows: rows.length, ...counts };
  });
  return {
    schemaVersion: 1,
    asOf: new Date(now).toISOString(),
    windowDays,
    clockStart: "item.created_at",
    tenantStatus: typeof tenant[0].status === "string" ? tenant[0].status : "unknown",
    configuredTenantRetentionDays: configuredDays,
    windowMatchesTenantConfiguration: configuredDays === windowDays,
    tableInventory,
    expiryInventory,
    retentionEnforced: false,
    deletionCandidatesApproved: false,
    limitations: [
      "Record age is an inventory signal, not deletion eligibility or a 28-day enforcement receipt.",
      "Snapshot table and object-store completeness require separate verification.",
      "Expiry diagnostics predict read-guard impact only; they do not prove byte deletion or authorize a blanket backfill.",
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
