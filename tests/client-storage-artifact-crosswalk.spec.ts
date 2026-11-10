import { expect, test } from "@playwright/test";
import { evaluateClientStorageObjectInventory } from "../scripts/lib/client-storage-object-inventory.mjs";
import { collectClientStorageArtifactSample, CLIENT_STORAGE_ARTIFACT_COLUMNS } from "../scripts/lib/client-storage-artifact-inventory.mjs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { offlineTestEnvironment } from "../scripts/lib/offline-test-environment.mjs";

const day = 86_400_000;
const now = Date.now();
const checkedAt = new Date(now).toISOString();
const expected = { project: "fixture-project", bucket: "fixture-bucket", namespace: "tenant-a", account: null,
  supabaseProjectRef: "abcdefghijklmnopqrst", retentionDays: 28, recoveryDays: 7 };
const artifact = { id: "00000000-0000-4000-8000-000000000001", tenant_slug: "tenant-a", object_key: "tenant-a/private.bin",
  status: "ready", byte_size: 3, content_type: "application/octet-stream", created_at: new Date(now - 20 * day).toISOString(),
  retention_expires_at: new Date(now + 8 * day).toISOString() };
const object = { name: artifact.object_key, generation: "42", size: "3", contentType: artifact.content_type,
  timeCreated: checkedAt, customTime: artifact.created_at, eventBasedHold: false, temporaryHold: false,
  metadata: { "agentos-retention-expires-at": artifact.retention_expires_at, "agentos-retention-clock": "expiry-minus-bucket-days-v1" } };
function snapshot() {
  const sample = { startedAt: checkedAt, completedAt: checkedAt, complete: true, rows: [artifact] };
  return structuredClone({ schemaVersion: 1, bucket: expected.bucket, prefix: "tenant-a/", checkedAt,
    listingStartedAt: checkedAt, listingCompletedAt: checkedAt,
    liveListingComplete: true, softDeletedListingComplete: true, liveObjects: [object], softDeletedObjects: [],
    artifactInventory: { schemaVersion: 1, projectRef: expected.supabaseProjectRef, namespace: expected.namespace, before: sample, after: structuredClone(sample) },
    source: { collector: "verify-client-storage-object-inventory-v1", project: expected.project, account: null,
      liveListingMode: "all_versions", softDeletedListingMode: "soft_deleted_exhaustive", liveListingSha256: "a".repeat(64), softDeletedListingSha256: "b".repeat(64) } });
}

test("self-consistent object metadata cannot renew the database artifact deadline", () => {
  const input = snapshot();
  input.liveObjects[0] = { ...object, customTime: checkedAt, metadata: { ...object.metadata,
    "agentos-retention-expires-at": new Date(now + 28 * day).toISOString() } };
  const result = evaluateClientStorageObjectInventory(input, expected);
  expect(result.ok).toBe(false);
  expect(result.failures).toContain("object_artifact_deadline_mismatch");
});

test("unreferenced bytes cannot pass a tenant object inventory", () => {
  const input = snapshot();
  input.artifactInventory.before.rows = [];
  input.artifactInventory.after.rows = [];
  const result = evaluateClientStorageObjectInventory(input, expected);
  expect(result.ok).toBe(false);
  expect(result.failures).toContain("object_artifact_reference_missing");
});

test("a ready active artifact without bytes cannot pass a complete inventory", () => {
  const input = snapshot();
  input.liveObjects = [];
  const result = evaluateClientStorageObjectInventory(input, expected);
  expect(result.ok).toBe(false);
  expect(result.failures).toContain("ready_artifact_object_missing");
});

test("a stable artifact crosswalk preserves original deadlines and exposes only hashes and counts", () => {
  const result = evaluateClientStorageObjectInventory(snapshot(), expected);
  expect(result.ok).toBe(true);
  expect(result).toMatchObject({ schemaVersion: 4, artifactRows: 1, supabaseProjectRef: expected.supabaseProjectRef,
    artifactCrosswalk: "stable-artifact-listing-v1" });
  expect(result.artifactSnapshotSha256).toMatch(/^[a-f0-9]{64}$/);
  for (const value of [artifact.id, artifact.object_key, artifact.retention_expires_at]) expect(JSON.stringify(result)).not.toContain(value);
  const changed = snapshot();
  changed.artifactInventory.before.rows[0] = { ...artifact, status: "pending" };
  changed.artifactInventory.after.rows[0] = { ...artifact, status: "pending" };
  expect(evaluateClientStorageObjectInventory(changed, expected).artifactSnapshotSha256).not.toBe(result.artifactSnapshotSha256);
});

test("crosswalk rejects missing, stale, incomplete, drifting and wrong-project artifact snapshots", () => {
  for (const mutate of [
    (input: ReturnType<typeof snapshot>) => { delete (input as Partial<typeof input>).artifactInventory; },
    (input: ReturnType<typeof snapshot>) => { input.artifactInventory.projectRef = "differentprojectref00"; },
    (input: ReturnType<typeof snapshot>) => { input.artifactInventory.before.complete = false; },
    (input: ReturnType<typeof snapshot>) => { input.artifactInventory.after.rows[0].status = "pending"; },
    (input: ReturnType<typeof snapshot>) => { input.artifactInventory.before.startedAt = new Date(now - 2 * day).toISOString(); },
    (input: ReturnType<typeof snapshot>) => { input.artifactInventory.before.completedAt = new Date(now + 1000).toISOString(); },
    (input: ReturnType<typeof snapshot>) => { input.artifactInventory.after.rows[0].tenant_slug = "tenant-b"; },
    (input: ReturnType<typeof snapshot>) => { input.artifactInventory.before.rows.push(artifact); input.artifactInventory.after.rows.push(artifact); },
  ]) {
    const input = snapshot();
    mutate(input);
    expect(evaluateClientStorageObjectInventory(input, expected).ok).toBe(false);
  }
});

test("deleted artifacts, wrong bytes/type and ambiguous live generations fail the crosswalk", () => {
  const deleted = snapshot();
  deleted.artifactInventory.before.rows[0] = { ...artifact, status: "deleted" };
  deleted.artifactInventory.after.rows[0] = { ...artifact, status: "deleted" };
  expect(evaluateClientStorageObjectInventory(deleted, expected).failures).toContain("deleted_artifact_has_live_bytes");
  for (const patch of [{ size: "4" }, { contentType: "text/html" }]) {
    const input = snapshot();
    Object.assign(input.liveObjects[0], patch);
    expect(evaluateClientStorageObjectInventory(input, expected).failures).toContain("object_artifact_content_metadata_mismatch");
  }
  const duplicate = snapshot();
  duplicate.liveObjects.push({ ...object, generation: "43" });
  expect(evaluateClientStorageObjectInventory(duplicate, expected).failures).toContain("artifact_multiple_live_generations");
});

test("expired artifact references may explain recovery bytes but cannot extend their deadline", () => {
  const input = snapshot();
  const expiry = new Date(now - day).toISOString();
  const original = { ...artifact, status: "deleted", created_at: new Date(now - 29 * day).toISOString(), retention_expires_at: expiry };
  input.artifactInventory.before.rows = [original];
  input.artifactInventory.after.rows = [original];
  input.liveObjects = [];
  const recovery = { ...object, customTime: original.created_at, metadata: { ...object.metadata, "agentos-retention-expires-at": expiry },
    softDeleteTime: expiry, hardDeleteTime: new Date(now + 6 * day).toISOString() };
  const result = evaluateClientStorageObjectInventory({ ...input, softDeletedObjects: [recovery] }, expected);
  expect(result.ok).toBe(true);
  expect(evaluateClientStorageObjectInventory({ ...input, softDeletedObjects: [{ ...recovery, name: "tenant-a/orphan.bin" }] }, expected).failures)
    .toContain("object_artifact_reference_missing");
});

test("artifact collection uses only bounded scoped GETs and reads beyond short pages", async () => {
  const calls: URL[] = [];
  const result = await collectClientStorageArtifactSample({ url: `https://${expected.supabaseProjectRef}.supabase.co`,
    token: "fixture-only-secret", namespace: expected.namespace, projectRef: expected.supabaseProjectRef,
    request: async (url: string, options: RequestInit) => {
      calls.push(new URL(url));
      expect(options.method).toBe("GET");
      expect(options.redirect).toBe("error");
      expect(options.cache).toBe("no-store");
      expect(options.signal).toBeDefined();
      return Response.json(calls.length === 1 ? [artifact] : []);
    } });
  expect(result.complete).toBe(true);
  expect(result.rows).toHaveLength(1);
  expect(calls.map((url) => url.searchParams.get("offset"))).toEqual(["0", "1"]);
  for (const url of calls) {
    expect(url.origin).toBe(`https://${expected.supabaseProjectRef}.supabase.co`);
    expect(url.pathname).toBe("/rest/v1/client_runtime_artifacts");
    expect(url.searchParams.get("select")).toBe(CLIENT_STORAGE_ARTIFACT_COLUMNS);
    expect(url.searchParams.get("tenant_slug")).toBe("eq.tenant-a");
    expect(url.searchParams.get("limit")).toBe("500");
  }
});

test("collection refuses wrong targets before requests and never reports credential-bearing fetch errors", async () => {
  let calls = 0;
  const base = { url: `https://${expected.supabaseProjectRef}.supabase.co`, token: "fixture-only-secret",
    namespace: expected.namespace, projectRef: expected.supabaseProjectRef,
    request: async () => { calls++; throw new Error("fixture-only-secret"); } };
  await expect(collectClientStorageArtifactSample({ ...base, url: "https://unreviewed.invalid" })).rejects.toThrow("artifact_inventory_connection_invalid");
  expect(calls).toBe(0);
  await expect(collectClientStorageArtifactSample(base)).rejects.toThrow("artifact_inventory_request_failed");
  expect(calls).toBe(1);
  await expect(collectClientStorageArtifactSample({ ...base, request: async () => Response.json(Array.from({ length: 501 }, () => artifact)) }))
    .rejects.toThrow("artifact_inventory_page_invalid");
  for (const body of ["not-json", "x".repeat(4 * 1024 * 1024 + 1)]) {
    await expect(collectClientStorageArtifactSample({ ...base, request: async () => new Response(body) }))
      .rejects.toThrow("artifact_inventory_response_invalid");
  }
});

test("artifact pagination has a hard request bound", async () => {
  let pages = 0;
  await expect(collectClientStorageArtifactSample({ url: `https://${expected.supabaseProjectRef}.supabase.co`,
    token: "fixture-only", namespace: expected.namespace, projectRef: expected.supabaseProjectRef,
    request: async () => Response.json([{ ...artifact, id: `00000000-0000-4000-8000-${String(++pages).padStart(12, "0")}` }]),
  })).rejects.toThrow("artifact_inventory_page_limit");
  expect(pages).toBe(101);
});

test("inventory CLI brackets object listings with scoped artifact reads and rejects drift", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "agentos-storage-crosswalk-"));
  try {
    writeFileSync(path.join(directory, "gcloud"), `#!${process.execPath}\nconst args=process.argv.slice(2);
if(args[0]!=="storage"||args[1]!=="ls"||!args.includes("--recursive")||!args.includes("gs://fixture-bucket/tenant-a/"))process.exit(2);
require("node:fs").appendFileSync(process.env.FIXTURE_TRACE_FILE,"OBJECT_LIST\\n");
process.stdout.write(args.includes("--all-versions")?process.env.FIXTURE_OBJECTS_JSON:"[]");\n`, { mode: 0o700 });
    const mock = `import {appendFileSync} from "node:fs"; let reads=0; globalThis.fetch=async(url,options)=>{
      if(options.method!=="GET"||options.redirect!=="error")throw Error("unexpected request");
      const target=new URL(url); if(target.origin!=="https://abcdefghijklmnopqrst.supabase.co"||target.searchParams.get("tenant_slug")!=="eq.tenant-a")throw Error("wrong scope");
      appendFileSync(process.env.FIXTURE_TRACE_FILE,"ARTIFACT_GET\\n");
      if(target.searchParams.get("offset")!=="0")return Response.json([]);
      const row=JSON.parse(process.env.FIXTURE_ARTIFACT_JSON);
      if(++reads===2&&process.env.FIXTURE_DRIFT==="1")row.status="pending";
      return Response.json([row]); };`;
    const mockUrl = `data:text/javascript;base64,${Buffer.from(mock).toString("base64")}`;
    for (const drift of ["0", "1"]) {
      const output = path.join(directory, `report-${drift}.json`);
      const trace = path.join(directory, `trace-${drift}.txt`);
      const result = spawnSync(process.execPath, ["--import", mockUrl, "scripts/verify-client-storage-object-inventory.mjs",
        "--project", expected.project, "--bucket", expected.bucket, "--namespace", expected.namespace,
        "--supabase-project-ref", expected.supabaseProjectRef, "--output", output], {
        cwd: process.cwd(), encoding: "utf8", timeout: 30_000,
        env: { ...offlineTestEnvironment(process.env, directory), PATH: `${directory}:${path.dirname(process.execPath)}`,
          SUPABASE_URL: `https://${expected.supabaseProjectRef}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: "fixture-only-secret",
          FIXTURE_ARTIFACT_JSON: JSON.stringify(artifact), FIXTURE_OBJECTS_JSON: JSON.stringify([object]), FIXTURE_DRIFT: drift, FIXTURE_TRACE_FILE: trace },
      });
      expect(result.status, result.stderr).toBe(drift === "0" ? 0 : 1);
      expect(readFileSync(trace, "utf8").trim().split("\n")).toEqual(["ARTIFACT_GET", "ARTIFACT_GET", "OBJECT_LIST", "OBJECT_LIST", "ARTIFACT_GET", "ARTIFACT_GET"]);
      const report = JSON.parse(readFileSync(output, "utf8"));
      expect(report.ok).toBe(drift === "0");
      if (drift === "1") expect(report.failures).toContain("artifact_inventory_changed_during_listing");
      expect(statSync(output).mode & 0o777).toBe(0o600);
      for (const value of ["fixture-only-secret", artifact.object_key, artifact.id]) {
        expect(result.stdout + result.stderr + JSON.stringify(report)).not.toContain(value);
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
