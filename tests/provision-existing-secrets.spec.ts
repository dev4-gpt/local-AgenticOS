import { test, expect } from "@playwright/test";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

type TestManifest = {
  approved?: boolean;
  acknowledgeClientSafeRuntime?: boolean;
  secretEnv: Record<string, unknown>;
  runtimeEnv: Record<string, unknown>;
};

function runManifest(configure: (manifest: TestManifest) => void, phase = "deploy", apply = false) {
  const dir = mkdtempSync(join(tmpdir(), "veloce-secret-test-"));
  try {
    const manifest = JSON.parse(readFileSync("client-blueprints/gcp-client-runtime.example.json", "utf8")) as TestManifest;
    configure(manifest);
    const config = join(dir, "manifest.json");
    writeFileSync(config, JSON.stringify(manifest));
    return spawnSync(process.execPath, ["scripts/provision-gcp-client.mjs", "--config", config, "--phase", phase, ...(apply ? ["--apply"] : [])], {
      encoding: "utf8", env: { ...process.env, GCP_PROJECT_NUMBER: "1075094991117" },
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function dryRun(binding: unknown, phase = "deploy") {
  return runManifest((manifest) => { manifest.secretEnv.JINA_WORKER_TOKEN = binding; }, phase);
}

test("existing secret bindings retain exact names and versions", () => {
  const result = dryRun({ existingSecret: "jina-worker-token", version: "7" });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("JINA_WORKER_TOKEN=jina-worker-token:7");
  expect(result.stdout).not.toMatch(/JINA_WORKER_TOKEN=veloce-/);
});

test("deploy sets the service-wide and revision instance caps from the manifest", () => {
  const result = dryRun({ existingSecret: "jina-worker-token" });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toMatch(/--max 1(?:\s|$)/);
  expect(result.stdout).toMatch(/--max-instances 1(?:\s|$)/);
});

test("prepare never creates or grants access to existing secrets", () => {
  const result = dryRun({ existingSecret: "jina-worker-token" }, "prepare");
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).not.toContain("secrets create jina-worker-token");
  expect(result.stdout).not.toContain("secrets add-iam-policy-binding jina-worker-token");
});

test("legacy secret names remain tenant-prefixed", () => {
  const result = dryRun("jina-worker-token");
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toMatch(/JINA_WORKER_TOKEN=veloce-[a-z0-9-]+-jina-worker-token:latest/);
});

test("malformed explicit bindings are rejected before deployment", () => {
  for (const binding of [
    { existingSecret: "projects/foreign/secrets/key" },
    { existingSecret: "jina-worker-token", version: "7,OTHER=key" },
    { existingSecret: "jina-worker-token", grantAccess: true },
  ]) {
    const result = dryRun(binding);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Invalid existing secret binding");
  }
});

test("deploy refuses a missing source-import worker token before running cloud commands", () => {
  const result = runManifest((manifest) => {
    manifest.approved = true;
    manifest.acknowledgeClientSafeRuntime = true;
    delete manifest.secretEnv.CLIENT_WORKER_TOKEN;
  }, "deploy", true);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("source import requires CLIENT_WORKER_TOKEN in secretEnv");
  expect(result.stdout).not.toContain("gcloud run deploy");
});

test("deploy requires the Supabase anon secret specifically", () => {
  const result = runManifest((manifest) => {
    manifest.approved = true;
    manifest.acknowledgeClientSafeRuntime = true;
    delete manifest.secretEnv.SUPABASE_ANON_KEY;
  }, "deploy", true);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("deploy phase requires SUPABASE_ANON_KEY in secretEnv");
  expect(result.stdout).not.toContain("gcloud run deploy");
});

test("runtime environment cannot shadow a secret binding", () => {
  const result = runManifest((manifest) => {
    manifest.runtimeEnv.SUPABASE_ANON_KEY = "plaintext-should-not-deploy";
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("runtimeEnv.SUPABASE_ANON_KEY cannot shadow a Secret Manager binding");
  expect(result.stdout).not.toContain("plaintext-should-not-deploy");
});

test("worker token cannot be a plaintext runtime variable without a secret binding", () => {
  const result = runManifest((manifest) => {
    delete manifest.secretEnv.CLIENT_WORKER_TOKEN;
    manifest.runtimeEnv.CLIENT_WORKER_TOKEN = "plaintext-should-not-print";
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("runtimeEnv.CLIENT_WORKER_TOKEN must be Secret Manager-backed");
  expect(result.stdout).not.toContain("plaintext-should-not-print");
});
