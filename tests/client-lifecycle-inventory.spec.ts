import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { bucketListingHasObjects, queueListingContains, requireReviewedSecretInventory, reviewedClientSecretNames } from "../scripts/lib/client-lifecycle-inventory.mjs";

test("offboarding refuses failed object and queue inventory", () => {
  expect(bucketListingHasObjects({ status: 0, stdout: "" })).toBe(false);
  expect(bucketListingHasObjects({ status: 0, stdout: "gs://bucket/tenant-a/file\n" })).toBe(true);
  expect(() => bucketListingHasObjects({ status: 1, stdout: "" })).toThrow("Unable to enumerate client objects");

  expect(queueListingContains({ status: 0, stdout: "" }, "veloce-tenant-a")).toBe(false);
  expect(queueListingContains({ status: 0, stdout: "projects/p/locations/r/queues/veloce-tenant-a\n" }, "veloce-tenant-a")).toBe(true);
  expect(queueListingContains({ status: 0, stdout: "projects/p/locations/r/queues/veloce-tenant-ab\n" }, "veloce-tenant-a")).toBe(false);
  expect(() => queueListingContains({ status: 1, stdout: "" }, "veloce-tenant-a")).toThrow("Unable to enumerate client task queues");
});

test("offboarding never deletes secrets from a longer tenant-slug match", () => {
  const reviewed = reviewedClientSecretNames({
    secretEnv: { SUPABASE_ANON_KEY: "supabase-anon-key", EXTERNAL: { existingSecret: "shared-secret" } },
    runtimeEnv: { CLIENT_REQUEST_INBOX_SECRET: "request-inbox" },
  }, "test-client");
  expect([...reviewed].sort()).toEqual([
    "veloce-test-client-client-credential-inbox",
    "veloce-test-client-request-inbox",
    "veloce-test-client-supabase-anon-key",
  ]);
  expect(requireReviewedSecretInventory(["veloce-test-client-supabase-anon-key"], reviewed)).toHaveLength(1);
  expect(() => requireReviewedSecretInventory(["veloce-test-client-b-supabase-anon-key"], reviewed))
    .toThrow("Unreviewed client secret found");
  expect(() => requireReviewedSecretInventory(["shared-secret"], reviewed))
    .toThrow("Unreviewed client secret found");
});

test("offboarding rejects another tenant's namespace before any cloud request", () => {
  const script = path.join(process.cwd(), "scripts/client-lifecycle.mjs");
  const env = {
    PATH: process.env.PATH ?? "",
    SUPABASE_URL: "https://invalid.example",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
  };
  const run = (slug: string, namespace: string) => spawnSync(process.execPath, [
    script, "--mode", "offboard", "--slug", slug, "--namespace", namespace, "--bucket", "tenant-bucket",
  ], { cwd: process.cwd(), env, encoding: "utf8" });

  const wrongNamespace = run("tenant-a", "tenant-b");
  expect(wrongNamespace.status).toBe(1);
  expect(wrongNamespace.stderr).toContain("storage namespace must equal the client slug");
  expect(wrongNamespace.stdout).toBe("");

  const invalidSlug = run("../tenant-a", "../tenant-a");
  expect(invalidSlug.status).toBe(1);
  expect(invalidSlug.stderr).toContain("--slug must be a canonical client slug");
  expect(invalidSlug.stdout).toBe("");
});

test("offboarding inventories objects and queues before changing tenant state", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lifecycle-inventory-"));
  try {
    const gcloud = path.join(directory, "gcloud");
    const script = path.join(process.cwd(), "scripts/client-lifecycle.mjs");
    const fixture = path.join(process.cwd(), "scripts/fixtures/client-lifecycle-fetch.mjs");
    const manifestPath = path.join(directory, "manifest.json");
    const manifestBytes = JSON.stringify({ clientSlug: "test-client", gcp: { projectId: "test-project", storageBucket: "test-client-bucket" }, storage: { namespace: "test-client" } });
    writeFileSync(manifestPath, manifestBytes, { mode: 0o600 });
    const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
    const args = ["--import", fixture, script, "--mode", "offboard", "--slug", "test-client",
      "--bucket", "test-client-bucket", "--project", "test-project", "--config", manifestPath,
      "--manifest-sha256", manifestSha256, "--apply", "--confirm-offboard",
      "--destroy-secrets", "--delete-queue", "--no-notification-channel"];
    const env = {
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
      LIFECYCLE_MOCK_FINANCIAL: "inventory",
    };

    writeFileSync(gcloud, "#!/bin/sh\nexit 13\n", { mode: 0o700 });
    const bucketFailure = spawnSync(process.execPath, [...args, "--out", path.join(directory, "bucket.json")], { cwd: process.cwd(), env, encoding: "utf8" });
    expect(bucketFailure.status).toBe(1);
    expect(bucketFailure.stderr).toContain("Unable to enumerate client objects");
    expect(bucketFailure.stderr).not.toContain("Unexpected lifecycle request");

    writeFileSync(gcloud, "#!/bin/sh\nif [ \"$1\" = storage ]; then exit 0; fi\nexit 13\n", { mode: 0o700 });
    const queueFailure = spawnSync(process.execPath, [...args, "--out", path.join(directory, "queue.json")], { cwd: process.cwd(), env, encoding: "utf8" });
    expect(queueFailure.status).toBe(1);
    expect(queueFailure.stderr).toContain("Unable to enumerate client task queues");
    expect(queueFailure.stderr).not.toContain("Unexpected lifecycle request");

    writeFileSync(gcloud, "#!/bin/sh\nif [ \"$1\" = secrets ]; then echo veloce-test-client-b-supabase-anon-key; fi\nexit 0\n", { mode: 0o700 });
    const secretFailure = spawnSync(process.execPath, [...args, "--out", path.join(directory, "secret.json")], { cwd: process.cwd(), env, encoding: "utf8" });
    expect(secretFailure.status).toBe(1);
    expect(secretFailure.stderr).toContain("Unreviewed client secret found");
    expect(secretFailure.stderr).not.toContain("Unexpected lifecycle request");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
