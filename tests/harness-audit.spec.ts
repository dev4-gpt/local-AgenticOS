import { expect, test } from "@playwright/test";
import { evaluateHarnessAudit, HARNESS_COMPONENTS, type HarnessEvidenceSnapshot } from "../src/lib/harnessAudit";

const complete: HarnessEvidenceSnapshot = {
  tenantIsolation: true, provenance: true, manifestPolicy: true, contextCompression: true,
  actionAllowlist: true, approvalBoundary: true, memoryLineage: true, delegationRegistry: true,
  budgetLedger: true, costAccounting: true, modelAllowlist: true,
};

test("Wave 5 audit includes cost as a first-class sixth component", () => {
  const audit = evaluateHarnessAudit({ local: complete, cloud: complete });
  expect(HARNESS_COMPONENTS).toEqual(["personalisation", "context", "action", "memory", "delegation", "cost"]);
  expect(audit.status).toBe("pass");
  expect(audit.rows.find((row) => row.component === "cost")?.status).toBe("pass");
});

test("local evidence cannot certify cloud parity without a cloud snapshot", () => {
  const audit = evaluateHarnessAudit({ local: complete, cloud: null });
  expect(audit.status).toBe("review");
  expect(audit.rows.every((row) => row.local === "pass" && row.cloud === "review")).toBe(true);
});

test("a missing fail-closed signal blocks the component and overall audit", () => {
  const local = { ...complete, costAccounting: false };
  const audit = evaluateHarnessAudit({ local, cloud: complete });
  expect(audit.status).toBe("blocked");
  expect(audit.rows.find((row) => row.component === "cost")?.status).toBe("blocked");
});
