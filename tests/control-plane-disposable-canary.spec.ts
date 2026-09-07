import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

test("the disposable control-plane canary is inventory-bound and cannot target dogfood", () => {
  const manifest = JSON.parse(readFileSync(resolve(root, "client-blueprints/control-plane-disposable-canary.gcp.json"), "utf8"));
  const route = readFileSync(resolve(root, "product-experience/src/app/api/internal/control-plane/canary/route.ts"), "utf8");
  const adapter = readFileSync(resolve(root, "workers/gcp-provisioner/worker.mjs"), "utf8");

  expect(manifest.clientSlug).toBe("cp-canary-b903-rollback");
  expect(manifest.clientSlug).not.toBe("dofgfood");
  expect(manifest.gcp.image).toMatch(/client-runtime:v3-3-[^@]+@sha256:[a-f0-9]{64}$/);
  expect(manifest.gcp.image).not.toContain("dofgfood");
  expect(manifest.provisioning.phase).toBe("prepare");
  expect(manifest.providerCallsEnabled).toBe(false);
  expect(manifest.intentRoutingEnabled).toBe(false);
  expect(manifest.gcp).toMatchObject({ minInstances: 0, maxInstances: 1, cpu: "1", memory: "1Gi", concurrency: 1, timeout: "900s" });
  expect(manifest.access).toEqual({ mode: "app-auth", allowedUserEmails: ["aryamandev777@gmail.com"] });
  expect(manifest.runtimeEnv).toMatchObject({ VELOCE_CLIENT_EDITION: "1", AGENTIC_OS_DISABLE_LOCAL_CLI: "1", AGENTIC_OS_DISABLE_LOCAL_FILES: "1", AGENTIC_OS_REQUIRE_APPROVALS: "1", CLIENT_RUNTIME_ENFORCE_AUTH: "1", CLIENT_RUNTIME_WORKER_ENABLED: "0", CLIENT_INTENT_ROUTING_ENABLED: "0", CLIENT_RUNTIME_DATA_MODE: "supabase" });
  expect(manifest.enabledCapabilities).toEqual(["tenant-data"]);
  expect(manifest.providerAllowlist).toEqual([]);
  expect(manifest.modelAllowlist).toEqual([]);
  expect(manifest.budget).toEqual({ monthlyCap: "1", warningThreshold: "0.5" });
  expect(manifest.storage).toEqual({ namespace: manifest.clientSlug, corsOrigins: ["https://app.veloceos.cloud"] });
  expect(manifest.canary.disposable).toBe(true);
  expect(manifest.canary.expectedInventory.cloudRunService).toBeNull();
  expect(manifest.canary.expectedInventory.cloudRunJobs).toEqual([]);
  expect(route).toContain('const canarySlug = "cp-canary-b903-rollback"');
  expect(route).not.toContain('const canarySlug = "dofgfood"');
  expect(route).toContain("client-runtime:v3-3-295bdd3b5efe@sha256:8498b6fa61645b9168db74b1454738c6ffb1d33155303d52fd8f6a90dfe39765");
  expect(route).toContain("canary_cleanup_evidence_required");
  expect(route).toContain("isVerifiedCleanupEvidence");
  expect(route).toContain('if (body.action === "start") {');
  expect(route).toContain('if (!enabled()) return NextResponse.json({ ok: false, error: "canary_disabled" }, { status: 409 });');
  expect(route).toContain("manifestRuntimeMatches");
  expect(route).toContain("hasCanaryBudget");
  expect(route).toContain("storageMatches");
  expect(adapter).toContain("function provisionedResourceManifest");
  expect(adapter).toContain("const resourceManifest = provisionedResourceManifest(manifest, phase, output.stdout)");
  expect(adapter).toContain("resourceManifest,");
  expect(adapter).toContain("failureOutput = redactOutput");
  expect(adapter).toContain("redacted command evidence");
  const canaryTool = readFileSync(resolve(root, "scripts/control-plane-disposable-canary.mjs"), "utf8");
  expect(canaryTool).toContain("function adapterRoleCheck");
  expect(canaryTool).toContain("not[ _-]found");
  expect(canaryTool).toContain("function startCanary");
  expect(canaryTool).toContain("function readStatus");
  expect(canaryTool).toContain("objectLines.length > 0");
  expect(canaryTool).not.toContain("storageBucket}/**");
  expect(canaryTool).toContain("function serviceAccountState");
  expect(canaryTool).toContain("filtered_service_account_list");
  expect(canaryTool).toContain('https://app.veloceos.cloud/api/internal/control-plane/canary');
});

test("canary tool derives the tracked inventory and refuses a cleanup apply without confirmation", () => {
  const inventory = spawnSync(process.execPath, ["scripts/control-plane-disposable-canary.mjs", "--mode", "inventory"], { cwd: root, encoding: "utf8" });
  expect(inventory.status, inventory.stderr || inventory.stdout).toBe(0);
  const output = JSON.parse(inventory.stdout);
  expect(output.inventory.resources).toEqual({
    serviceAccount: "veloce-cp-canary-b903-run@veloce-agenticos-2026.iam.gserviceaccount.com",
    storageBucket: "veloce-agenticos-2026-veloce-cp-canary-b903-rollback",
    taskQueue: "veloce-cp-canary-b903-rollback",
    secrets: ["veloce-cp-canary-b903-rollback-client-credential-inbox"],
    cloudRunService: null,
    cloudRunJobs: [],
  });
  const cleanup = spawnSync(process.execPath, ["scripts/control-plane-disposable-canary.mjs", "--mode", "cleanup", "--apply"], { cwd: root, encoding: "utf8" });
  expect(cleanup.status).toBe(1);
  expect(JSON.parse(cleanup.stdout).failures).toContain("cleanup requires --confirm-slug cp-canary-b903-rollback");

  const start = spawnSync(process.execPath, ["scripts/control-plane-disposable-canary.mjs", "--mode", "start"], { cwd: root, encoding: "utf8" });
  expect(start.status, start.stderr || start.stdout).toBe(0);
  expect(JSON.parse(start.stdout)).toMatchObject({ ok: true, dryRun: true, mode: "start" });

  const status = spawnSync(process.execPath, ["scripts/control-plane-disposable-canary.mjs", "--mode", "status"], { cwd: root, encoding: "utf8" });
  expect(status.status).toBe(1);
  expect(JSON.parse(status.stdout).failures).toContain("--status-url must be https://app.veloceos.cloud/api/internal/control-plane/canary");
});
