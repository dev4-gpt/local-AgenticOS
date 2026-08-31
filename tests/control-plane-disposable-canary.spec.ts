import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

test("the disposable control-plane canary is inventory-bound and cannot target dogfood", () => {
  const manifest = JSON.parse(readFileSync(resolve(root, "client-blueprints/control-plane-disposable-canary.gcp.json"), "utf8"));
  const route = readFileSync(resolve(root, "product-experience/src/app/api/internal/control-plane/canary/route.ts"), "utf8");
  const adapter = readFileSync(resolve(root, "workers/gcp-provisioner/worker.mjs"), "utf8");

  expect(manifest.clientSlug).toBe("cp-canary-a826-rollback");
  expect(manifest.clientSlug).not.toBe("dofgfood");
  expect(manifest.provisioning.phase).toBe("prepare");
  expect(manifest.providerCallsEnabled).toBe(false);
  expect(manifest.canary.disposable).toBe(true);
  expect(manifest.canary.expectedInventory.cloudRunService).toBeNull();
  expect(manifest.canary.expectedInventory.cloudRunJobs).toEqual([]);
  expect(route).toContain('const canarySlug = "cp-canary-a826-rollback"');
  expect(route).not.toContain('const canarySlug = "dofgfood"');
  expect(route).toContain("canary_cleanup_evidence_required");
  expect(route).toContain("isVerifiedCleanupEvidence");
  expect(adapter).toContain("function provisionedResourceManifest");
  expect(adapter).toContain("resourceManifest: provisionedResourceManifest(manifest, phase)");
  const canaryTool = readFileSync(resolve(root, "scripts/control-plane-disposable-canary.mjs"), "utf8");
  expect(canaryTool).toContain("function adapterRoleCheck");
  expect(canaryTool).toContain("not[ _-]found");
});

test("canary tool derives the tracked inventory and refuses a cleanup apply without confirmation", () => {
  const inventory = spawnSync(process.execPath, ["scripts/control-plane-disposable-canary.mjs", "--mode", "inventory"], { cwd: root, encoding: "utf8" });
  expect(inventory.status, inventory.stderr || inventory.stdout).toBe(0);
  const output = JSON.parse(inventory.stdout);
  expect(output.inventory.resources).toEqual({
    serviceAccount: "veloce-cp-canary-a826-run@veloce-agenticos-2026.iam.gserviceaccount.com",
    storageBucket: "veloce-agenticos-2026-veloce-cp-canary-a826-rollback",
    taskQueue: "veloce-cp-canary-a826-rollback",
    secrets: ["veloce-cp-canary-a826-rollback-client-credential-inbox"],
    cloudRunService: null,
    cloudRunJobs: [],
  });
  const cleanup = spawnSync(process.execPath, ["scripts/control-plane-disposable-canary.mjs", "--mode", "cleanup", "--apply"], { cwd: root, encoding: "utf8" });
  expect(cleanup.status).toBe(1);
  expect(JSON.parse(cleanup.stdout).failures).toContain("cleanup requires --confirm-slug cp-canary-a826-rollback");
});
