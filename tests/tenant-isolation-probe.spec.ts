import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { evaluateTenantProbe } from "../scripts/lib/tenant-isolation-probe.mjs";

const ok = (rows: Array<{ tenant_slug: string }>) => ({ ok: true, status: 200, rows });
const denied = { ok: false, status: 401, rows: [] };

test("two populated tenants with empty cross-reads pass the isolation probe", () => {
  expect(evaluateTenantProbe("records", "alpha", "beta", {
    aOwn: ok([{ tenant_slug: "alpha" }]), aOther: ok([]),
    bOwn: ok([{ tenant_slug: "beta" }]), bOther: ok([]),
  })).toEqual([]);
});

test("empty or mismatched own reads are inconclusive, not isolation evidence", () => {
  const failures = evaluateTenantProbe("records", "alpha", "beta", {
    aOwn: ok([]), aOther: ok([]),
    bOwn: ok([{ tenant_slug: "alpha" }]), bOther: ok([]),
  });
  expect(failures).toContain("records: tenant A own sentinel missing or mismatched - isolation inconclusive");
  expect(failures).toContain("records: tenant B own sentinel missing or mismatched - isolation inconclusive");
});

test("cross-tenant rows fail and expired cross-read tokens stay inconclusive", () => {
  const failures = evaluateTenantProbe("jobs", "alpha", "beta", {
    aOwn: ok([{ tenant_slug: "alpha" }]), aOther: ok([{ tenant_slug: "beta" }]),
    bOwn: ok([{ tenant_slug: "beta" }]), bOther: denied,
  });
  expect(failures).toContain("jobs: tenant A token crossed into tenant B");
  expect(failures).toContain("jobs: tenant B cross-read failed (401) - inconclusive, refresh the token and re-run");
});

function runProbe(mode = "valid", url = "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
  options: { stdin?: string; expectedUsers?: [string, string]; json?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "agentos-isolation-probe-"));
  const countsFile = join(directory, "counts.json");
  const preload = join(directory, "fetch.mjs");
  writeFileSync(preload, `
    import { writeFileSync } from 'node:fs';
    const counts = { requests: 0, auth: 0, unsafeRedirects: 0, missingTimeout: 0 };
    process.on('exit', () => writeFileSync(${JSON.stringify(countsFile)}, JSON.stringify(counts)));
    globalThis.fetch = async (input, options = {}) => {
      counts.requests++;
      if (options.redirect !== 'error') counts.unsafeRedirects++;
      if (!(options.signal instanceof AbortSignal)) counts.missingTimeout++;
      const url = new URL(String(input));
      const memberA = options.headers.Authorization === 'Bearer synthetic-member-a';
      if (url.pathname === '/auth/v1/user') {
        counts.auth++;
        if (${JSON.stringify(mode)} === 'auth-unavailable') return new Response('{}', { status: 401 });
        const id = memberA || ${JSON.stringify(mode)} === 'same-subject'
          ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222';
        return Response.json({ id, email: 'private-fixture@example.invalid' });
      }
      if (!url.pathname.startsWith('/rest/v1/')) throw new Error('Unexpected fixture endpoint');
      const tenant = url.searchParams.get('tenant_slug');
      const own = tenant === 'eq.' + (memberA ? 'alpha' : 'beta');
      if (!own && ${JSON.stringify(mode)} === 'malformed-cross')
        return Response.json({ error: 'private-fixture-body' });
      if (!own && ${JSON.stringify(mode)} === 'invalid-json-cross')
        return new Response('private-fixture-body', { status: 200 });
      if (!own && ${JSON.stringify(mode)} === 'http-cross-error')
        return Response.json({ error: 'private-fixture-body' }, { status: 401 });
      if (own && ${JSON.stringify(mode)} === 'empty-own') return Response.json([]);
      return Response.json(own ? [{ tenant_slug: memberA ? 'alpha' : 'beta' }] : []);
    };
  `);
  try {
    const result = spawnSync(process.execPath, ["--import", preload,
      resolve("scripts/verify-client-runtime-isolation.mjs"),
      "--url", url, "--expected-project-ref", "aaaaaaaaaaaaaaaaaaaa",
      "--tenant-a", "alpha", "--tenant-b", "beta",
      ...(options.stdin !== undefined ? ["--session-input-stdin"] : ["--anon-key", "synthetic-public-key",
        "--access-token-a", "synthetic-member-a", "--access-token-b", "synthetic-member-b"]),
      ...(options.expectedUsers ? ["--expected-user-a", options.expectedUsers[0], "--expected-user-b", options.expectedUsers[1]] : []),
      ...(options.json ? ["--json"] : [])],
    { encoding: "utf8", input: options.stdin, timeout: 10_000, env: { PATH: process.env.PATH, HOME: directory } });
    expect(result.error).toBeUndefined();
    const output = result.stdout + result.stderr;
    for (const privateValue of ["synthetic-member-a", "synthetic-member-b", "synthetic-public-key",
      "private-fixture@example.invalid", "private-fixture-body", "11111111-1111-4111-8111-111111111111"])
      expect(output).not.toContain(privateValue);
    return { ...result, counts: JSON.parse(readFileSync(countsFile, "utf8")) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("the CLI verifies distinct Auth identities before all 34 read-only table probes", () => {
  const result = runProbe();
  expect(result.status).toBe(0);
  expect(result.counts).toEqual({ requests: 138, auth: 2, unsafeRedirects: 0, missingTimeout: 0 });
});

const stdinBundle = JSON.stringify({ anonKey: "synthetic-public-key", tokenA: "synthetic-member-a", tokenB: "synthetic-member-b" });
const expectedUsers: [string, string] = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];

test("the CLI accepts memory-only session input and emits a minimized read receipt", () => {
  const result = runProbe("valid", undefined, { stdin: stdinBundle, expectedUsers, json: true });
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ passed: true, authRequests: 2, tableRequests: 136,
    tablesChecked: 34, expectedIdentitiesMatched: true, readOnly: true });
});

test("the CLI pins both expected users before any table read", () => {
  const result = runProbe("valid", undefined, { stdin: stdinBundle, expectedUsers: [expectedUsers[1], expectedUsers[0]], json: true });
  expect(result.status).not.toBe(0);
  expect(result.counts.requests).toBe(2);
  expect(result.stderr).toContain("expected users");
});

for (const input of ['{"tokenA":"private-fixture-body"}', "x".repeat(33_000)]) {
  test(`the CLI rejects invalid or oversized stdin session input (${input.length} bytes)`, () => {
    const result = runProbe("valid", undefined, { stdin: input });
    expect(result.status).not.toBe(0);
    expect(result.counts.requests).toBe(0);
    expect(result.stderr).toContain("session input");
  });
}

for (const mode of ["malformed-cross", "invalid-json-cross", "http-cross-error", "empty-own"]) {
  test(`the CLI rejects ${mode} rather than reporting isolation`, () => {
    expect(runProbe(mode).status).not.toBe(0);
  });
}

for (const mode of ["same-subject", "auth-unavailable"]) {
  test(`the CLI stops before table reads on ${mode}`, () => {
    const result = runProbe(mode);
    expect(result.status).not.toBe(0);
    expect(result.counts.requests).toBe(2);
    expect(result.counts.auth).toBe(2);
  });
}

for (const url of ["https://bbbbbbbbbbbbbbbbbbbb.supabase.co", "https://attacker.invalid",
  "https://aaaaaaaaaaaaaaaaaaaa.supabase.co/path", "https://aaaaaaaaaaaaaaaaaaaa.supabase.co?target=other"]) {
  test(`the CLI rejects an unattested target before sending credentials: ${url}`, () => {
    const result = runProbe("valid", url);
    expect(result.status).not.toBe(0);
    expect(result.counts.requests).toBe(0);
  });
}
