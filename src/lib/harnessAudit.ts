/**
 * Wave 5 harness audit.
 *
 * This is an evidence reducer, not a second control plane. It consumes bounded
 * booleans from an operator inspection or smoke harness and reports whether the
 * same six guarantees hold locally and in cloud. It deliberately does not read
 * prompts, tenant rows, the filesystem, or upstream repositories.
 */

export const HARNESS_AUDIT_VERSION = "v96-harness-audit-1" as const;

export const HARNESS_COMPONENTS = [
  "personalisation", "context", "action", "memory", "delegation", "cost",
] as const;

export type HarnessComponentId = typeof HARNESS_COMPONENTS[number];
export type HarnessComponentStatus = "pass" | "review" | "blocked";

export interface HarnessEvidenceSnapshot {
  tenantIsolation: boolean;
  provenance: boolean;
  manifestPolicy: boolean;
  contextCompression: boolean;
  actionAllowlist: boolean;
  approvalBoundary: boolean;
  memoryLineage: boolean;
  delegationRegistry: boolean;
  budgetLedger: boolean;
  costAccounting: boolean;
  modelAllowlist: boolean;
}

export interface HarnessAuditRow {
  component: HarnessComponentId;
  local: HarnessComponentStatus;
  cloud: HarnessComponentStatus;
  status: HarnessComponentStatus;
  evidenceKeys: readonly (keyof HarnessEvidenceSnapshot)[];
  references: readonly string[];
}

export interface HarnessAuditResult {
  version: typeof HARNESS_AUDIT_VERSION;
  status: HarnessComponentStatus;
  rows: readonly HarnessAuditRow[];
}

const COMPONENT_RULES: readonly {
  component: HarnessComponentId;
  evidenceKeys: readonly (keyof HarnessEvidenceSnapshot)[];
  references: readonly string[];
}[] = [
  { component: "personalisation", evidenceKeys: ["tenantIsolation", "provenance"], references: ["ecc", "agents-md"] },
  { component: "context", evidenceKeys: ["manifestPolicy", "contextCompression", "provenance"], references: ["learn-claude-code", "repomix", "headroom"] },
  { component: "action", evidenceKeys: ["actionAllowlist", "approvalBoundary"], references: ["claude-code-router", "github-mcp-server", "playwright-mcp"] },
  { component: "memory", evidenceKeys: ["memoryLineage", "tenantIsolation", "provenance"], references: ["planning-with-files", "claude-mem", "codegraph"] },
  { component: "delegation", evidenceKeys: ["delegationRegistry", "approvalBoundary", "budgetLedger"], references: ["wshobson-agents", "multica", "codex-plugin-cc"] },
  { component: "cost", evidenceKeys: ["budgetLedger", "costAccounting", "modelAllowlist", "contextCompression"], references: ["claude-hud", "caveman", "headroom"] },
] as const;

function componentStatus(snapshot: HarnessEvidenceSnapshot, keys: readonly (keyof HarnessEvidenceSnapshot)[]) {
  return keys.every((key) => snapshot[key]) ? "pass" as const : "blocked" as const;
}

function combinedStatus(local: HarnessComponentStatus, cloud: HarnessComponentStatus): HarnessComponentStatus {
  if (local === "blocked") return "blocked";
  if (cloud === "pass") return "pass";
  return "review";
}

/**
 * A missing cloud snapshot is represented by `null` and becomes review, never
 * pass. This prevents a local-only run from certifying cloud parity.
 */
export function evaluateHarnessAudit(input: {
  local: HarnessEvidenceSnapshot;
  cloud: HarnessEvidenceSnapshot | null;
}): HarnessAuditResult {
  const rows = COMPONENT_RULES.map((rule) => {
    const local = componentStatus(input.local, rule.evidenceKeys);
    const cloud = input.cloud ? componentStatus(input.cloud, rule.evidenceKeys) : "review" as const;
    return { ...rule, local, cloud, status: combinedStatus(local, cloud) };
  });
  const status = rows.some((row) => row.status === "blocked")
    ? "blocked"
    : rows.some((row) => row.status === "review")
      ? "review"
      : "pass";
  return { version: HARNESS_AUDIT_VERSION, status, rows };
}
