import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Tests for the scheduled retention job (tracker item 9b): infra/retention-job and scripts/run-scheduled-retention.mjs.
// The "Supabase" below is a local stub; the key is a test string.
type Ok = { args: string[]; apply: boolean; includeAdapterHost: boolean; slug: string; deploymentId: string };
type Built = Ok | { error: string };
type Wrapper = { CONFIRM_FLAGS: string[]; ADAPTER_CONFIRM_FLAG: string; buildArgs: (env: Record<string, string | undefined>) => Built };
const wrapper = async () => (await import(pathToFileURL(path.resolve("scripts/run-scheduled-retention.mjs")).href)) as Wrapper;
const KEY = "stub-key-for-this-test-only-0000000000";
const base = (over: Record<string, string | undefined> = {}) => ({
  CLIENT_SLUG: "tenant-a", BACKGROUND_DEPLOYMENT_ID: "release-a", SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_SERVICE_ROLE_KEY: KEY, ...over,
});

test("the wrapper passes every confirmation flag the retention command asks for, so a new retention step cannot be forgotten", async () => {
  const { CONFIRM_FLAGS, ADAPTER_CONFIRM_FLAG } = await wrapper();
  const source = readFileSync("scripts/client-lifecycle.mjs", "utf8");
  const asked = new Set([...source.matchAll(/--confirm-retention-[a-z-]+/g)].map((m) => m[0]));
  expect(asked.delete(ADAPTER_CONFIRM_FLAG)).toBe(true);
  expect(new Set(CONFIRM_FLAGS)).toEqual(asked);
  expect(new Set(CONFIRM_FLAGS).size).toBe(CONFIRM_FLAGS.length);
});

test("by default it is a dry run; a real run needs RETENTION_APPLY=true and then carries every flag", async () => {
  const { buildArgs, CONFIRM_FLAGS, ADAPTER_CONFIRM_FLAG } = await wrapper();
  const dry = buildArgs(base()) as Ok;
  expect(dry.args).toEqual(["--mode", "retention", "--slug", "tenant-a", "--deployment-id", "release-a"]);
  expect(dry.apply).toBe(false);
  for (const falsy of ["false", ""]) expect((buildArgs(base({ RETENTION_APPLY: falsy })) as Ok).args).not.toContain("--apply");
  const live = buildArgs(base({ RETENTION_APPLY: "true" })) as Ok;
  expect(live.args).toEqual(expect.arrayContaining(["--apply", "--deployment-id", "release-a", ...CONFIRM_FLAGS]));
  expect(live.args).not.toContain("--include-adapter-host");
  expect(live.args).not.toContain(ADAPTER_CONFIRM_FLAG);
  const withAdapter = buildArgs(base({ RETENTION_APPLY: "true", INCLUDE_ADAPTER_HOST: "true" })) as Ok;
  expect(withAdapter.args).toEqual(expect.arrayContaining(["--include-adapter-host", ADAPTER_CONFIRM_FLAG]));
  const dryAdapter = buildArgs(base({ INCLUDE_ADAPTER_HOST: "true" })) as Ok;
  expect(dryAdapter.args).toContain("--include-adapter-host");
  expect(dryAdapter.args).not.toContain("--apply");
});

test("a missing or malformed setting is refused, and the reason never contains a value", async () => {
  const { buildArgs } = await wrapper();
  const bad: Record<string, string | undefined>[] = [
    { CLIENT_SLUG: undefined }, { CLIENT_SLUG: "Bad Slug" }, { CLIENT_SLUG: "ab" }, { CLIENT_SLUG: "../x" },
    { BACKGROUND_DEPLOYMENT_ID: undefined }, { BACKGROUND_DEPLOYMENT_ID: "has space" }, { BACKGROUND_DEPLOYMENT_ID: "x" },
    { SUPABASE_URL: undefined }, { SUPABASE_SERVICE_ROLE_KEY: undefined }, { SUPABASE_SERVICE_ROLE_KEY: "" },
    { RETENTION_APPLY: "yes" }, { RETENTION_APPLY: "1" }, { INCLUDE_ADAPTER_HOST: "maybe" },
  ];
  for (const over of bad) {
    const result = buildArgs(base(over));
    expect("error" in result, JSON.stringify(over)).toBe(true);
    const text = JSON.stringify(result);
    expect(text).not.toContain(KEY);
    for (const value of Object.values(over)) if (value) expect(text).not.toContain(value);
  }
});

async function runEntry(cwd: string, env: Record<string, string>, ownerAnswer: boolean) {
  const paths: string[] = [];
  const stub = createServer((req, res) => {
    paths.push(String(req.url).replace("/rest/v1/", ""));
    const owner = String(req.url).endsWith("client_adapter_background_owner_may_run");
    res.writeHead(owner ? 200 : 500, { "content-type": "application/json" });
    res.end(JSON.stringify(owner ? ownerAnswer : { message: "stub" }));
    req.resume();
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  const port = (stub.address() as AddressInfo).port;
  const child = spawn(process.execPath, ["scripts/run-scheduled-retention.mjs"], { cwd, env: { PATH: process.env.PATH ?? "", ...env, SUPABASE_URL: `http://127.0.0.1:${port}` } });
  let out = "";
  child.stdout.on("data", (c) => { out += c; });
  child.stderr.on("data", (c) => { out += c; });
  const code: number = await new Promise((resolve) => child.on("close", (c) => resolve(c ?? -1)));
  await new Promise((resolve) => stub.close(resolve));
  return { code, out, paths };
}

test("the image holds everything the command imports: built from the Dockerfile's own COPY lines, the entry point runs", async () => {
  const dockerfile = readFileSync("infra/retention-job/Dockerfile", "utf8");
  const dir = mkdtempSync(path.join(os.tmpdir(), "retention-image-"));
  try {
    for (const line of dockerfile.split("\n")) {
      const match = /^COPY\s+(.+)$/.exec(line.trim());
      if (!match) continue;
      const parts = match[1]!.trim().split(/\s+/);
      const dest = parts.pop()!;
      for (const src of parts) {
        const target = dest.endsWith("/") ? path.join(dir, dest, path.basename(src)) : path.join(dir, dest);
        mkdirSync(path.dirname(target), { recursive: true });
        cpSync(path.resolve(src), target, { recursive: true });
      }
    }
    const notOwner = await runEntry(dir, base({ BACKGROUND_DEPLOYMENT_ID: "release-b" }), false);
    expect(notOwner.code, notOwner.out).toBe(0);
    expect(notOwner.out).toContain("retention-job-start");
    expect(notOwner.out).toContain('"skipped":true');
    expect(notOwner.out).toContain("retention-job-end");
    expect(notOwner.out).not.toContain("ERR_MODULE_NOT_FOUND");
    expect(notOwner.out).not.toContain(KEY);
    expect(notOwner.paths).toEqual(["rpc/client_adapter_background_owner_may_run"]); // nothing was purged
    const owner = await runEntry(dir, base({ BACKGROUND_DEPLOYMENT_ID: "release-a" }), true);
    expect(owner.paths[0]).toBe("rpc/client_adapter_background_owner_may_run");
    expect(owner.paths).toContain("rpc/purge_expired_client_onboarding_tokens"); // the owner carried on (the stub then refused it)
    expect(owner.code).toBe(1);
    expect(owner.out).not.toContain(KEY);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the entry point refuses a bad setting with exit 2 before calling anything", async () => {
  const result = await runEntry(process.cwd(), base({ CLIENT_SLUG: "Bad Slug" }), true);
  expect(result.code).toBe(2);
  expect(result.out).toContain("retention-job-refused");
  expect(result.out).not.toContain(KEY);
  expect(result.paths).toEqual([]);
});

test("the image and the job spec carry no secret, run as an unprivileged user, and do not retry a half-finished purge", () => {
  const dockerfile = readFileSync("infra/retention-job/Dockerfile", "utf8");
  expect(dockerfile).toMatch(/^USER node$/m);
  expect(dockerfile).toMatch(/^ENTRYPOINT \["node", "scripts\/run-scheduled-retention\.mjs"\]$/m);
  expect(dockerfile).not.toMatch(/^\s*(ENV|ARG)\s+\S*(KEY|SECRET|TOKEN|PASSWORD)/im);
  const job = readFileSync("infra/retention-job/job.yaml", "utf8");
  expect(job).toMatch(/maxRetries: 0/);
  expect(job.match(/secretKeyRef:/g)).toHaveLength(2);
  expect(job).toMatch(/- name: SUPABASE_SERVICE_ROLE_KEY\n\s+valueFrom:/);
  expect(job).toMatch(/- name: SUPABASE_URL\n\s+valueFrom:/);
  expect(job).toMatch(/- name: RETENTION_APPLY\n\s+value: "false"/); // it starts as a dry run
  expect(job).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}|sb_secret/);
  const readme = readFileSync("infra/retention-job/README.md", "utf8");
  expect(readme).toContain("client_adapter_background_owner_set");
  expect(readme).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
});
