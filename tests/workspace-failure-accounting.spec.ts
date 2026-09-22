import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("the hosted orchestration replacement retains ECC creation controls", () => {
  const source = readFileSync("src/components/ClientOrchestrationWorkspace.tsx", "utf8");
  expect(source).toContain('surface === "orchestrate" && <EccWorkflowsPanel />');
});

test("invalid artifacts retain incurred provider usage and fail closed on settlement", () => {
  const source = readFileSync("src/app/api/internal/client-runtime/jobs/route.ts", "utf8");
  const start = source.indexOf("  if (!artifact) {");
  const branch = source.slice(start, source.indexOf("  const artifactId = await storeArtifact", start));
  expect(branch).toContain("clientTextUsageCostMicros(model, result.usage) ?? estimate");
  expect(branch).toContain("settleRequiredBudget(");
  expect(branch).toContain("usageMetadata: { ...result.usage, artifactValidationFailure: 1 }");
  expect(branch).not.toContain("actualAmountMicros: 0");
  expect(branch).toContain("artifactDiagnostics");
  expect(branch).not.toContain("output: safeOutput");
});
