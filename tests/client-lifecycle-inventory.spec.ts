import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyClientObjectBackup, writeClientObjectBackupManifest } from "../scripts/lib/client-lifecycle-backup.mjs";

function reviewedRestoreTarget(directory: string) {
  const config = path.join(directory, "restore-target.json");
  const bytes = JSON.stringify({ clientSlug: "test-client", gcp: { storageBucket: "fixture-bucket" },
    storage: { namespace: "test-client", retentionDays: 28 } });
  writeFileSync(config, bytes, { mode: 0o600 });
  return ["--config", config, "--manifest-sha256", createHash("sha256").update(bytes).digest("hex")];
}

test("lifecycle exports preserve expiry boundaries for tenant workflow content", () => {
  const lifecycle = readFileSync(path.join(process.cwd(), "scripts/client-lifecycle.mjs"), "utf8");
  const artifacts = lifecycle.split("\n").find((line) => line.includes("client_runtime_artifacts:"));
  for (const field of ["review_decision", "review_sha256", "reviewed_by", "reviewed_at", "retention_expires_at"]) expect(artifacts).toContain(field);
  for (const table of ["client_board_tasks", "client_board_comments", "client_board_events", "client_loop_runs", "client_loop_rounds",
    "client_paperclip_companies", "client_paperclip_projects", "client_paperclip_agents", "client_paperclip_issues", "client_paperclip_comments", "client_paperclip_runs",
    "client_hermes_content_factory_runs", "client_hermes_content_factory_stage_outputs", "client_hermes_content_factory_citations",
    "client_hermes_content_factory_quality_reports", "client_hermes_content_factory_approvals", "client_hermes_content_factory_deliveries"]) {
    const row = lifecycle.split("\n").find((line) => line.includes(`${table}:`));
    expect(row, `${table} must have an explicit lifecycle export projection`).toContain("retention_expires_at");
  }
  for (const table of ["client_ruflo_swarms", "client_ruflo_agents"]) {
    const row = lifecycle.split("\n").find((line) => line.includes(`${table}:`));
    expect(row, `${table} must export its expiry boundary`).toContain("retention_expires_at");
  }
});
import { bucketListingHasObjects, listedClientObjectPaths, objectBackupCoversListing, sameClientObjectInventory, queueListingContains, requireReviewedSecretInventory, reviewedClientSecretNames } from "../scripts/lib/client-lifecycle-inventory.mjs";

test("offboarding refuses failed object and queue inventory", () => {
  expect(bucketListingHasObjects({ status: 0, stdout: "" })).toBe(false);
  expect(bucketListingHasObjects({ status: 0, stdout: "gs://bucket/tenant-a/file\n" })).toBe(true);
  expect(() => bucketListingHasObjects({ status: 1, stdout: "" })).toThrow("Unable to enumerate client objects");
  expect(listedClientObjectPaths({ status: 0, stdout: "gs://bucket/tenant-a/file\n" }, "bucket", "tenant-a")).toEqual(["file"]);
  expect(() => listedClientObjectPaths({ status: 0, stdout: "gs://bucket/tenant-ab/file\n" }, "bucket", "tenant-a"))
    .toThrow("escaped the reviewed namespace");
  expect(() => listedClientObjectPaths({ status: 0, stdout: "gs://bucket/tenant-a/../file\n" }, "bucket", "tenant-a"))
    .toThrow("unsafe path");

  expect(queueListingContains({ status: 0, stdout: "" }, "veloce-tenant-a")).toBe(false);
  expect(queueListingContains({ status: 0, stdout: "projects/p/locations/r/queues/veloce-tenant-a\n" }, "veloce-tenant-a")).toBe(true);
  expect(queueListingContains({ status: 0, stdout: "projects/p/locations/r/queues/veloce-tenant-ab\n" }, "veloce-tenant-a")).toBe(false);
  expect(() => queueListingContains({ status: 1, stdout: "" }, "veloce-tenant-a")).toThrow("Unable to enumerate client task queues");
});

test("object backup must contain every listed tenant object", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lifecycle-backup-"));
  try {
    mkdirSync(path.join(directory, "tenant-a"));
    writeFileSync(path.join(directory, "tenant-a", "one"), "one");
    expect(objectBackupCoversListing(directory, "tenant-a", ["one"])).toBe(true);
    expect(objectBackupCoversListing(directory, "tenant-a", ["one", "two"])).toBe(false);
    expect(objectBackupCoversListing(directory, "tenant-a", [])).toBe(false);
    expect(sameClientObjectInventory(["one", "two"], ["two", "one"])).toBe(true);
    expect(sameClientObjectInventory(["one"], ["one", "two"])).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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

test("restore rejects invalid later rows before inserting any earlier table", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lifecycle-restore-"));
  try {
    const input = path.join(directory, "snapshot.json");
    for (const invalidRow of [{ tenant_slug: "other-client" }, null, [], "test-client"]) {
      writeFileSync(input, JSON.stringify({ schemaVersion: 3, slug: "test-client", tables: {
        client_tenants: [{ slug: "test-client", name: "Test Client" }],
        client_runtime_audit_events: [invalidRow],
      } }));
      for (const apply of [true, false]) {
        const result = spawnSync(process.execPath, [
          "--import", path.join(process.cwd(), "scripts/fixtures/client-lifecycle-fetch.mjs"),
          path.join(process.cwd(), "scripts/client-lifecycle.mjs"),
          "--mode", "restore", "--slug", "test-client", "--input", input,
          ...(apply ? ["--apply", "--confirm-restore"] : []),
        ], { encoding: "utf8", env: { PATH: process.env.PATH, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-only" } });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Restore contains rows outside requested tenant");
        expect(result.stdout).not.toContain("MOCK_RESTORE_TABLE:");
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("restore preflights object backup directories in dry runs and before metadata writes", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lifecycle-restore-objects-"));
  try {
    const input = path.join(directory, "snapshot.json");
    const createdAt = Date.now() - 86_400_000;
    writeFileSync(input, JSON.stringify({ schemaVersion: 3, slug: "test-client", tables: {
      client_tenants: [{ slug: "test-client", name: "Test Client", retention_days: 28 }],
      client_runtime_artifacts: [{ tenant_slug: "test-client", object_key: "test-client/file", byte_size: 1, status: "ready",
        created_at: new Date(createdAt).toISOString(), retention_expires_at: new Date(createdAt + 28 * 86_400_000).toISOString() }],
    } }));
    const file = path.join(directory, "test-client-file");
    writeFileSync(file, "not a directory");
    const nestedFile = path.join(directory, "test-client-nested");
    mkdirSync(nestedFile);
    writeFileSync(path.join(nestedFile, "test-client"), "not a directory");
    const wrongTenant = path.join(directory, "other-client-objects");
    mkdirSync(wrongTenant);
    const valid = path.join(directory, "test-client-valid");
    mkdirSync(valid);
    writeFileSync(path.join(valid, "file"), "x");
    await writeClientObjectBackupManifest(valid, "test-client", readFileSync(input), [
      { tenant_slug: "test-client", object_key: "test-client/file", byte_size: 1, status: "ready" },
    ]);
    for (const objects of [null, path.join(directory, "test-client-missing"), file, nestedFile, wrongTenant]) {
      for (const apply of [true, false]) {
        const result = spawnSync(process.execPath, [
          "--import", path.join(process.cwd(), "scripts/fixtures/client-lifecycle-fetch.mjs"),
          path.join(process.cwd(), "scripts/client-lifecycle.mjs"),
          "--mode", "restore", "--slug", "test-client", "--input", input, "--bucket", "fixture-bucket",
          ...(objects ? ["--objects", objects] : []),
          ...(apply ? ["--apply", "--confirm-restore"] : []),
        ], { encoding: "utf8", env: { PATH: process.env.PATH, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-only" } });
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/artifact metadata|Object backup directory/);
        expect(result.stdout).not.toContain("MOCK_RESTORE_TABLE:");
      }
    }
    const dryRun = spawnSync(process.execPath, [
      "--import", path.join(process.cwd(), "scripts/fixtures/client-lifecycle-fetch.mjs"),
      path.join(process.cwd(), "scripts/client-lifecycle.mjs"),
      "--mode", "restore", "--slug", "test-client", "--input", input,
      "--bucket", "fixture-bucket", "--objects", valid,
    ], { encoding: "utf8", env: { PATH: process.env.PATH, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-only" } });
    expect(dryRun.status).toBe(0);
    expect(dryRun.stdout).toContain("Dry run restore");
    expect(dryRun.stdout).not.toContain("MOCK_RESTORE_TABLE:");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("restore rejects an empty artifact backup before metadata or cloud writes", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lifecycle-empty-backup-"));
  try {
    const input = path.join(directory, "snapshot.json");
    const objects = path.join(directory, "test-client-objects");
    mkdirSync(objects);
    writeFileSync(input, JSON.stringify({ schemaVersion: 3, slug: "test-client", tables: {
      client_tenants: [{ slug: "test-client" }],
      client_runtime_artifacts: [{ tenant_slug: "test-client", object_key: "test-client/file", byte_size: 1, status: "ready" }],
    } }));
    writeFileSync(path.join(directory, "gcloud"), "#!/bin/sh\necho UNEXPECTED_CLOUD_WRITE\nexit 0\n", { mode: 0o700 });
    for (const apply of [false, true]) {
      const result = spawnSync(process.execPath, [
        "--import", path.join(process.cwd(), "scripts/fixtures/client-lifecycle-fetch.mjs"),
        path.join(process.cwd(), "scripts/client-lifecycle.mjs"),
        "--mode", "restore", "--slug", "test-client", "--input", input,
        "--bucket", "fixture-bucket", "--objects", objects,
        ...(apply ? ["--apply", "--confirm-restore"] : []),
      ], { encoding: "utf8", env: { PATH: directory, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-only" } });
      expect(result.status).toBe(1);
      expect(result.stdout).not.toContain("MOCK_RESTORE_TABLE:");
      expect(result.stdout).not.toContain("UNEXPECTED_CLOUD_WRITE");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("backup integrity binds the exact snapshot, files, sizes and bytes in both layouts", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lifecycle-backup-integrity-"));
  const snapshot = Buffer.from("fixture snapshot");
  const artifacts = [{ tenant_slug: "test-client", object_key: "test-client/docs/file", byte_size: 3, status: "ready" }];
  try {
    for (const nested of [false, true]) {
      const backup = path.join(directory, `test-client-${nested}`);
      const root = nested ? path.join(backup, "test-client") : backup;
      mkdirSync(path.join(root, "docs"), { recursive: true });
      const file = path.join(root, "docs/file");
      writeFileSync(file, "one");
      const manifest = await writeClientObjectBackupManifest(backup, "test-client", snapshot, artifacts);
      expect(manifest.files[0].sha256).toBe(createHash("sha256").update("one").digest("hex"));
      const plan = await verifyClientObjectBackup(backup, "test-client", snapshot, artifacts);
      expect(plan.map((item) => [item.source, item.objectKey])).toEqual([[file, "test-client/docs/file"]]);
      await expect(writeClientObjectBackupManifest(backup, "test-client", snapshot, artifacts)).rejects.toThrow("EEXIST");
      await expect(verifyClientObjectBackup(backup, "test-client", Buffer.from("changed"), artifacts)).rejects.toThrow("does not match");
      writeFileSync(file, "two");
      await expect(verifyClientObjectBackup(backup, "test-client", snapshot, artifacts)).rejects.toThrow("integrity verification failed");
      writeFileSync(file, "o");
      await expect(verifyClientObjectBackup(backup, "test-client", snapshot, artifacts)).rejects.toThrow("integrity verification failed");
      writeFileSync(file, "one");
      writeFileSync(path.join(root, "extra"), "unreviewed");
      await expect(verifyClientObjectBackup(backup, "test-client", snapshot, artifacts)).rejects.toThrow("integrity verification failed");
      rmSync(path.join(root, "extra"));
      rmSync(file);
      await expect(verifyClientObjectBackup(backup, "test-client", snapshot, artifacts)).rejects.toThrow("integrity verification failed");
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("backup verification refuses unsafe references, symlinks and missing ready bytes", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lifecycle-backup-paths-"));
  const snapshot = Buffer.from("fixture snapshot");
  try {
    const backup = path.join(directory, "test-client-objects");
    mkdirSync(backup);
    const row = { tenant_slug: "test-client", object_key: "test-client/file", byte_size: 1, status: "ready" };
    await expect(writeClientObjectBackupManifest(backup, "test-client", snapshot, [row])).rejects.toThrow("missing a ready artifact");
    writeFileSync(path.join(backup, "file"), "x");
    for (const rows of [
      [{ ...row, tenant_slug: "other-client" }], [{ ...row, object_key: "other-client/file" }],
      [{ ...row, object_key: "test-client/../file" }], [{ ...row, object_key: "test-client/a*" }],
      [{ ...row, byte_size: 2 }], [{ ...row, byte_size: "invalid" }],
      [{ ...row, status: "deleted" }], [{ ...row, status: "unexpected" }], [row, row],
    ]) await expect(writeClientObjectBackupManifest(backup, "test-client", snapshot, rows)).rejects.toThrow();
    const outside = path.join(directory, "outside");
    writeFileSync(outside, "x");
    symlinkSync(outside, path.join(backup, "linked"));
    await expect(writeClientObjectBackupManifest(backup, "test-client", snapshot, [row])).rejects.toThrow("symlink");
    rmSync(path.join(backup, "linked"));
    symlinkSync(directory, path.join(backup, "linked-dir"));
    await expect(writeClientObjectBackupManifest(backup, "test-client", snapshot, [row])).rejects.toThrow("symlink");
    rmSync(path.join(backup, "linked-dir"));
    const manifest = await writeClientObjectBackupManifest(backup, "test-client", snapshot, [row]);
    writeFileSync(`${backup}.manifest.json`, JSON.stringify({ ...manifest, namespace: "other-client" }));
    await expect(verifyClientObjectBackup(backup, "test-client", snapshot, [row])).rejects.toThrow("does not match");
    writeFileSync(`${backup}.manifest.json`, JSON.stringify({ ...manifest, files: [{ ...manifest.files[0], path: "../outside" }] }));
    await expect(verifyClientObjectBackup(backup, "test-client", snapshot, [row])).rejects.toThrow("integrity verification failed");
    rmSync(`${backup}.manifest.json`);
    await expect(verifyClientObjectBackup(backup, "test-client", snapshot, [row])).rejects.toThrow("matching integrity manifest");
    rmSync(path.join(backup, "file"));
    await writeClientObjectBackupManifest(backup, "test-client", snapshot, [{ ...row, status: "pending" }]);
    await expect(verifyClientObjectBackup(backup, "test-client", snapshot, [{ ...row, status: "pending" }])).resolves.toEqual([]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("restore transfers exact object keys before metadata and stops on copy failure", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lifecycle-restore-transfer-"));
  try {
    const objects = path.join(directory, "test-client-objects");
    mkdirSync(path.join(objects, "test-client", "docs"), { recursive: true });
    writeFileSync(path.join(objects, "test-client", "docs/file"), "one");
    const input = path.join(directory, "snapshot.json");
    const createdAt = Date.now() - 86_400_000;
    const artifacts = [{ tenant_slug: "test-client", object_key: "test-client/docs/file", byte_size: 3, status: "ready",
      created_at: new Date(createdAt).toISOString(), retention_expires_at: new Date(createdAt + 28 * 86_400_000).toISOString() }];
    writeFileSync(input, JSON.stringify({ schemaVersion: 3, slug: "test-client", tables: {
      client_tenants: [{ slug: "test-client", retention_days: 28 }], client_runtime_artifacts: artifacts,
    } }));
    await writeClientObjectBackupManifest(objects, "test-client", readFileSync(input), artifacts);
    writeFileSync(path.join(directory, "gcloud"), `#!/bin/sh
if [ "$1" != storage ] || [ "$2" != cp ] || [ "$4" != gs://fixture-bucket/test-client/docs/file ]; then exit 14; fi
if [ "$5" != --if-generation-match=0 ] || [ "$6" != --content-md5=+XxdKZQb+xsv2rCHSQargg== ]; then exit 16; fi
if [ "$7" != --custom-time=${new Date(createdAt).toISOString()} ]; then exit 17; fi
if [ "$8" != --custom-metadata=agentos-retention-expires-at=${new Date(createdAt + 28 * 86_400_000).toISOString()},agentos-retention-clock=expiry-minus-bucket-days-v1 ]; then exit 18; fi
if [ "$9" != --cache-control=private,no-store ]; then exit 19; fi
echo MOCK_OBJECT_TRANSFER
if [ "$COPY_FAIL" = 1 ]; then exit 13; fi
exit 0
`, { mode: 0o700 });
    const args = ["--import", path.join(process.cwd(), "scripts/fixtures/client-lifecycle-fetch.mjs"),
      path.join(process.cwd(), "scripts/client-lifecycle.mjs"), "--mode", "restore", "--slug", "test-client",
      "--input", input, "--objects", objects, "--bucket", "fixture-bucket", ...reviewedRestoreTarget(directory), "--apply", "--confirm-restore"];
    const env = { PATH: directory, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-only" };
    const failed = spawnSync(process.execPath, args, { encoding: "utf8", env: { ...env, COPY_FAIL: "1" } });
    expect(failed.status).toBe(1);
    expect(failed.stdout).toContain("MOCK_OBJECT_TRANSFER");
    expect(failed.stdout).not.toContain("MOCK_RESTORE_TABLE:");
    const passed = spawnSync(process.execPath, args, { encoding: "utf8", env });
    expect(passed.status, passed.stderr).toBe(0);
    expect(passed.stdout.indexOf("MOCK_OBJECT_TRANSFER")).toBeLessThan(passed.stdout.indexOf("MOCK_RESTORE_TABLE:client_tenants:1"));
    expect(passed.stdout).toContain("MOCK_RESTORE_TABLE:client_runtime_artifacts:1");
    writeFileSync(path.join(objects, "test-client", "docs/file"), "two");
    const changed = spawnSync(process.execPath, args, { encoding: "utf8", env });
    expect(changed.status).toBe(1);
    expect(changed.stdout).not.toContain("MOCK_OBJECT_TRANSFER");
    expect(changed.stdout).not.toContain("MOCK_RESTORE_TABLE:");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("ordinary restore rejects expired artifact bytes before cloud or metadata writes", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lifecycle-expired-restore-"));
  try {
    const objects = path.join(directory, "test-client-objects");
    mkdirSync(objects);
    writeFileSync(path.join(objects, "file"), "one");
    const createdAt = Date.now() - 36 * 86_400_000;
    const artifacts = [{ tenant_slug: "test-client", object_key: "test-client/file", byte_size: 3, status: "ready",
      created_at: new Date(createdAt).toISOString(), retention_expires_at: new Date(createdAt + 28 * 86_400_000).toISOString() }];
    const input = path.join(directory, "snapshot.json");
    writeFileSync(input, JSON.stringify({ schemaVersion: 3, slug: "test-client", tables: {
      client_tenants: [{ slug: "test-client", retention_days: 28 }], client_runtime_artifacts: artifacts,
    } }));
    await writeClientObjectBackupManifest(objects, "test-client", readFileSync(input), artifacts);
    writeFileSync(path.join(directory, "gcloud"), "#!/bin/sh\necho UNEXPECTED_CLOUD_WRITE\nexit 0\n", { mode: 0o700 });
    for (const apply of [false, true]) {
      const result = spawnSync(process.execPath, ["--import", path.join(process.cwd(), "scripts/fixtures/client-lifecycle-fetch.mjs"),
        path.join(process.cwd(), "scripts/client-lifecycle.mjs"), "--mode", "restore", "--slug", "test-client",
        "--input", input, "--objects", objects, "--bucket", "fixture-bucket", ...(apply ? ["--apply", "--confirm-restore"] : [])],
      { encoding: "utf8", env: { PATH: directory, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-only" } });
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
      expect(result.stderr).toContain("Artifact restore active window has expired");
      expect(result.stdout).not.toContain("UNEXPECTED_CLOUD_WRITE");
      expect(result.stdout).not.toContain("MOCK_RESTORE_TABLE:");
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("restore rechecks artifact expiry after transfer before inserting metadata", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lifecycle-transfer-expiry-"));
  try {
    const objects = path.join(directory, "test-client-objects");
    mkdirSync(objects);
    writeFileSync(path.join(objects, "file"), "one");
    const now = Date.parse("2026-10-17T00:00:00.000Z");
    const expiry = now + 60_000;
    const artifacts = [{ tenant_slug: "test-client", object_key: "test-client/file", byte_size: 3, status: "ready",
      created_at: new Date(expiry - 28 * 86_400_000).toISOString(), retention_expires_at: new Date(expiry).toISOString() }];
    const input = path.join(directory, "snapshot.json");
    writeFileSync(input, JSON.stringify({ schemaVersion: 3, slug: "test-client", tables: {
      client_tenants: [{ slug: "test-client", retention_days: 28 }], client_runtime_artifacts: artifacts,
    } }));
    await writeClientObjectBackupManifest(objects, "test-client", readFileSync(input), artifacts);
    const marker = path.join(directory, "transferred");
    const clock = path.join(directory, "clock.mjs");
    writeFileSync(clock, `import { existsSync } from "node:fs"; Date.now = () => existsSync(${JSON.stringify(marker)}) ? ${expiry} : ${now};`);
    writeFileSync(path.join(directory, "gcloud"), `#!/bin/sh\necho MOCK_OBJECT_TRANSFER\n: > ${JSON.stringify(marker)}\nexit 0\n`, { mode: 0o700 });
    const result = spawnSync(process.execPath, ["--import", clock,
      "--import", path.join(process.cwd(), "scripts/fixtures/client-lifecycle-fetch.mjs"),
      path.join(process.cwd(), "scripts/client-lifecycle.mjs"), "--mode", "restore", "--slug", "test-client",
      "--input", input, "--objects", objects, "--bucket", "fixture-bucket", ...reviewedRestoreTarget(directory), "--apply", "--confirm-restore"],
    { encoding: "utf8", env: { PATH: directory, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-only" } });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MOCK_OBJECT_TRANSFER");
    expect(result.stderr).toContain("active window has expired");
    expect(result.stdout).not.toContain("MOCK_RESTORE_TABLE:");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("CLI object exports write a snapshot-bound manifest usable by restore", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lifecycle-export-manifest-"));
  try {
    const output = path.join(directory, "test-client-export.json");
    const objects = output.replace(/\.json$/, "-objects");
    writeFileSync(path.join(directory, "gcloud"), `#!/bin/sh
if [ "$1" = storage ] && [ "$2" = cp ] && [ "$3" = --recursive ]; then
  mkdir -p "$5/test-client/docs"
  printf one > "$5/test-client/docs/file"
  exit 0
fi
exit 15
`, { mode: 0o700 });
    const result = spawnSync(process.execPath, [
      "--import", path.join(process.cwd(), "scripts/fixtures/client-lifecycle-fetch.mjs"),
      path.join(process.cwd(), "scripts/client-lifecycle.mjs"), "--mode", "export", "--slug", "test-client",
      "--out", output, "--bucket", "fixture-bucket", "--include-objects",
    ], { encoding: "utf8", env: { PATH: `${directory}:/usr/bin:/bin`, SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "fixture-only", LIFECYCLE_MOCK_FINANCIAL: "inventory" } });
    expect(result.status, result.stderr).toBe(0);
    const snapshot = readFileSync(output);
    const manifest = JSON.parse(readFileSync(`${objects}.manifest.json`, "utf8"));
    expect(manifest.snapshotSha256).toBe(createHash("sha256").update(snapshot).digest("hex"));
    expect(manifest.files.map((file: { path: string; byteSize: number }) => [file.path, file.byteSize])).toEqual([["docs/file", 3]]);
    await expect(verifyClientObjectBackup(objects, "test-client", snapshot)).resolves.toHaveLength(1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("restore uses the reviewed destination window rather than the source tenant window", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lifecycle-destination-clock-"));
  try {
    const objects = path.join(directory, "test-client-objects");
    mkdirSync(objects);
    writeFileSync(path.join(objects, "file"), "one");
    const created = Date.now() - 86_400_000;
    const expiry = new Date(created + 14 * 86_400_000).toISOString();
    const artifacts = [{ tenant_slug: "test-client", object_key: "test-client/file", byte_size: 3, status: "ready",
      created_at: new Date(created).toISOString(), retention_expires_at: expiry }];
    const input = path.join(directory, "snapshot.json");
    writeFileSync(input, JSON.stringify({ schemaVersion: 3, slug: "test-client", tables: {
      client_tenants: [{ slug: "test-client", retention_days: 14 }], client_runtime_artifacts: artifacts,
    } }));
    await writeClientObjectBackupManifest(objects, "test-client", readFileSync(input), artifacts);
    const config = path.join(directory, "destination.json");
    const manifest = JSON.stringify({ clientSlug: "test-client", gcp: { storageBucket: "fixture-bucket" }, storage: { namespace: "test-client", retentionDays: 28 } });
    writeFileSync(config, manifest);
    writeFileSync(path.join(directory, "gcloud"), `#!/bin/sh\nif [ "$7" != --custom-time=${new Date(Date.parse(expiry) - 28 * 86_400_000).toISOString()} ]; then exit 17; fi\necho MOCK_OBJECT_TRANSFER\nexit 0\n`, { mode: 0o700 });
    const args = ["--import", path.join(process.cwd(), "scripts/fixtures/client-lifecycle-fetch.mjs"),
      path.join(process.cwd(), "scripts/client-lifecycle.mjs"), "--mode", "restore", "--slug", "test-client", "--input", input,
      "--objects", objects, "--apply", "--confirm-restore"];
    const env = { PATH: directory, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-only" };
    const review = ["--config", config, "--manifest-sha256", createHash("sha256").update(manifest).digest("hex")];
    const result = spawnSync(process.execPath, [...args, ...review], { encoding: "utf8", env });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("MOCK_OBJECT_TRANSFER");
    for (const unreviewed of [["--bucket", "fixture-bucket"],
      ["--config", config, "--manifest-sha256", "0".repeat(64)], [...review, "--bucket", "other-bucket"]]) {
      const rejected = spawnSync(process.execPath, [...args, ...unreviewed], { encoding: "utf8", env });
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain("reviewed");
      expect(rejected.stdout).not.toContain("MOCK_OBJECT_TRANSFER");
      expect(rejected.stdout).not.toContain("MOCK_ATOMIC_RESTORE");
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

for (const outcome of ["failure", "bad-receipt"]) test(`restore stops on atomic RPC ${outcome} without sequential fallback`, () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lifecycle-atomic-rpc-"));
  try {
    const input = path.join(directory, "snapshot.json");
    writeFileSync(input, JSON.stringify({ schemaVersion: 3, slug: "test-client", tables: {
      client_tenants: [{ slug: "test-client", retention_days: 28, created_at: new Date(Date.now() - 86_400_000).toISOString() }],
    } }));
    const result = spawnSync(process.execPath, ["--import", path.join(process.cwd(), "scripts/fixtures/client-lifecycle-fetch.mjs"),
      path.join(process.cwd(), "scripts/client-lifecycle.mjs"), "--mode", "restore", "--slug", "test-client",
      "--input", input, "--apply", "--confirm-restore"], { encoding: "utf8", env: {
      PATH: "/usr/bin:/bin", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
      LIFECYCLE_MOCK_RESTORE: outcome,
    } });
    expect(result.status).toBe(1);
    expect(result.stdout.match(/MOCK_ATOMIC_RESTORE/g)).toHaveLength(1);
    expect(result.stdout).not.toContain("Client metadata restored:");
    expect(result.stderr).toContain(outcome === "failure" ? "Atomic metadata restore failed" : "unverified receipt");
  } finally { rmSync(directory, { recursive: true, force: true }); }
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

    writeFileSync(gcloud, "#!/bin/sh\nif [ \"$1\" = storage ] && [ \"$2\" = ls ]; then echo gs://test-client-bucket/test-client/file; fi\nexit 0\n", { mode: 0o700 });
    const unbackedObjects = spawnSync(process.execPath, [...args, "--out", path.join(directory, "unbacked.json")], { cwd: process.cwd(), env, encoding: "utf8" });
    expect(unbackedObjects.status).toBe(1);
    expect(unbackedObjects.stderr).toContain("tenant objects require --include-objects backup");
    expect(unbackedObjects.stderr).not.toContain("Unexpected lifecycle request");

    writeFileSync(gcloud, "#!/bin/sh\nif [ \"$1\" = storage ] && [ \"$2\" = ls ]; then echo gs://test-client-bucket/test-client/file; fi\nif [ \"$1\" = storage ] && [ \"$2\" = cp ]; then exit 13; fi\nexit 0\n", { mode: 0o700 });
    const failedBackup = spawnSync(process.execPath, [...args, "--out", path.join(directory, "failed-backup.json"), "--include-objects"], { cwd: process.cwd(), env, encoding: "utf8" });
    expect(failedBackup.status).toBe(1);
    expect(failedBackup.stderr).toContain("gcloud action failed: storage");
    expect(failedBackup.stderr).not.toContain("Unexpected lifecycle request");

    writeFileSync(gcloud, "#!/bin/sh\nif [ \"$1\" = storage ] && [ \"$2\" = ls ]; then echo gs://test-client-bucket/test-client/file; fi\nexit 0\n", { mode: 0o700 });
    const emptyBackup = spawnSync(process.execPath, [...args, "--out", path.join(directory, "empty-backup.json"), "--include-objects"], { cwd: process.cwd(), env, encoding: "utf8" });
    expect(emptyBackup.status).toBe(1);
    expect(emptyBackup.stderr).toContain("object backup does not cover the reviewed tenant inventory");
    expect(emptyBackup.stderr).not.toContain("Unexpected lifecycle request");

    writeFileSync(gcloud, `#!/bin/sh
if [ "$1" = storage ] && [ "$2" = ls ]; then
  echo gs://test-client-bucket/test-client/file
  if [ -f "${directory}/first-list" ]; then echo gs://test-client-bucket/test-client/late; else touch "${directory}/first-list"; fi
  exit 0
fi
if [ "$1" = storage ] && [ "$2" = cp ]; then mkdir -p "$5/test-client"; printf x > "$5/test-client/file"; fi
exit 0
`, { mode: 0o700 });
    const changedInventory = spawnSync(process.execPath, [...args, "--out", path.join(directory, "changed-inventory.json"), "--include-objects"], { cwd: process.cwd(), env, encoding: "utf8" });
    expect(changedInventory.status).toBe(1);
    expect(changedInventory.stderr).toContain("tenant object inventory changed during backup");
    expect(changedInventory.stdout).not.toContain("MOCK_TENANT_PATCH");

    writeFileSync(gcloud, `#!/bin/sh
if [ "$1" = storage ] && [ "$2" = ls ]; then echo gs://test-client-bucket/test-client/file; exit 0; fi
if [ "$1" = storage ] && [ "$2" = cp ]; then mkdir -p "$5/test-client"; printf x > "$5/test-client/file"; fi
exit 0
`, { mode: 0o700 });
    const incompleteDelete = spawnSync(process.execPath, [...args, "--out", path.join(directory, "incomplete-delete.json"), "--include-objects"], {
      cwd: process.cwd(), env: { ...env, LIFECYCLE_MOCK_FINANCIAL: "inventory-patch" }, encoding: "utf8",
    });
    expect(incompleteDelete.status).toBe(1);
    expect(incompleteDelete.stdout).toContain("MOCK_TENANT_PATCH");
    expect(incompleteDelete.stderr).toContain("tenant objects remain after deletion");
    expect(incompleteDelete.stderr).not.toContain("Unexpected lifecycle request");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the retention run can include the adapter host purge, only on request, and a real purge needs its own confirmation", () => {
  const lifecycle = readFileSync(path.join(process.cwd(), "scripts/client-lifecycle.mjs"), "utf8");
  expect(lifecycle).toContain('args.includes("--include-adapter-host")');
  expect(lifecycle).toMatch(/apply && includeAdapterHost && !args\.includes\("--confirm-retention-adapter"\)/);
  expect(lifecycle).toContain("rpc/purge_expired_client_adapter_records");
  const call = lifecycle.slice(lifecycle.indexOf("if (includeAdapterHost) {"), lifecycle.indexOf("if (includeAdapterHost) {") + 500);
  expect(call).toContain("p_tenant_slug: slug");
  expect(call).toContain("p_apply: apply");
  expect(call).toContain("fail(");
  // Without the flag nothing about the adapter host is called, so installations without it keep working.
  expect(lifecycle).toContain("let adapterHost = { included: false };");
});
