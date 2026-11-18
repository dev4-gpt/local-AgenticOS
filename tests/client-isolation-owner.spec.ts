import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { hiddenTerminalInput, runIsolationOwnerCheck, runIsolationReadProbe, validateIsolationOwnerPlan } from "../scripts/lib/client-isolation-owner.mjs";

const project = "aaaaaaaaaaaaaaaaaaaa", now = Date.parse("2026-10-18T17:00:00.000Z");
const userA = "11111111-1111-4111-8111-111111111111", userB = "22222222-2222-4222-8222-222222222222";
const plan = { schemaVersion: 1, environment: "disposable-staging", projectRef: project,
  url: `https://${project}.supabase.co`, tenantA: "alpha", tenantB: "beta", userA, userB,
  preparedAt: new Date(now).toISOString(), expiresAt: new Date(now + 3600000).toISOString() };
const goodProbe = { passed: true, readOnly: true, authRequests: 2, tableRequests: 136, tablesChecked: 34, expectedIdentitiesMatched: true };
const key = "sb_publishable_SYNTHETIC_ONLY_1234567890";
const privateValues = [key, "owner-a@example.invalid", "owner-b@example.invalid", "private password A", "private password B", "synthetic-access-a", "synthetic-access-b", "synthetic-refresh-token", userA, userB];

async function exercise(mode = "valid", options: { confirmed?: boolean; input?: string[]; signal?: AbortSignal } = {}) {
  const calls: Array<{ url: string; options: RequestInit }> = [];
  let prompts = 0, probes = 0, signins = 0, logouts = 0;
  const input = [...(options.input || [key, privateValues[1], privateValues[3], privateValues[2], privateValues[4]])];
  const fetchImpl = async (url: string | URL | Request, settings?: RequestInit) => {
    const address = String(url), settingsValue = settings || {};
    calls.push({ url: address, options: settingsValue });
    expect(address.startsWith(plan.url + "/auth/v1/")).toBe(true);
    expect(settingsValue.redirect).toBe("error"); expect(settingsValue.cache).toBe("no-store");
    expect(settingsValue.signal).toBeInstanceOf(AbortSignal);
    if (address.endsWith("/token?grant_type=password")) {
      signins++;
      if (mode === "network-failure") throw new Error("private password A must not appear");
      if (mode === "second-signin-failed" && signins === 2) return Response.json({ error: privateValues[3] }, { status: 401 });
      if (mode === "invalid-json") return new Response("private password A");
      if (mode === "huge-json") return new Response("x".repeat(65537));
      const credentials = JSON.parse(String(settingsValue.body));
      expect(credentials.email).toBe(privateValues[signins === 1 ? 1 : 2]);
      expect(credentials.password).toBe(privateValues[signins === 1 ? 3 : 4]);
      return Response.json({ access_token: privateValues[signins === 1 ? 5 : 6], refresh_token: privateValues[7],
        expires_at: Math.floor(now / 1000) + (mode === "long-expiry" ? 7200 : 3600),
        user: { id: mode === "wrong-user" ? userB : signins === 1 ? userA : userB } });
    }
    expect(address).toBe(plan.url + "/auth/v1/logout?scope=local"); logouts++;
    if (mode === "logout-failure" && logouts === 1) return new Response(null, { status: 503 });
    return new Response(null, { status: 204 });
  };
  const result = await runIsolationOwnerCheck(plan, { expectedProjectRef: project, confirmed: options.confirmed ?? true,
    now: () => now, fetchImpl: fetchImpl as typeof fetch, signal: options.signal,
    promptSecret: async () => { prompts++; if (!input.length) throw new Error("private_input_cancelled"); return input.shift()!; },
    runProbe: async (bundle: { anonKey: string; tokenA: string; tokenB: string }) => {
      probes++; expect(bundle.anonKey).toBe(key); expect(bundle.tokenA).toBe(privateValues[5]); expect(bundle.tokenB).toBe(privateValues[6]);
      if (mode === "probe-exception") throw new Error(privateValues[3]);
      if (mode === "probe-invalid") return { ...goodProbe, tableRequests: 140 };
      return { ...goodProbe, passed: mode !== "read-failure", ignoredSecret: privateValues[3] };
    } });
  for (const value of privateValues) expect(JSON.stringify(result)).not.toContain(value);
  return { result, calls, prompts, probes, signins, logouts };
}

test("the owner runner signs in twice, passes only memory sessions and signs out both current sessions", async () => {
  const run = await exercise();
  expect(run.result).toMatchObject({ passed: true, failureCode: null, signInsAttempted: 2, sessionsObtained: 2,
    authOperationRequests: 4, requestUpperBound: 142, automaticRetries: 0, sessionOutcomeUnknown: false,
    probe: goodProbe, currentSessionSignouts: [{ attempted: true, passed: true }, { attempted: true, passed: true }],
    passwordsOrTokensPersisted: false, appRowsWritten: false, providerCalls: 0, releaseReady: false });
  expect(run.result.accessJwtMayRemainValidUntil).toEqual([new Date(now + 3600000).toISOString(), new Date(now + 3600000).toISOString()]);
  expect(run.calls).toHaveLength(4); expect(run.probes).toBe(1);
});

test("the owner runner refuses unapproved session creation before prompting", async () => {
  await expect(exercise("valid", { confirmed: false })).rejects.toThrow("staging_auth_read_signout_confirmation_required");
});

for (const [name, change] of [
  ["redirected destination", { url: "https://attacker.invalid" }],
  ["query destination", { url: plan.url + "?next=other" }],
  ["production label", { environment: "production" }],
  ["same members", { userB: userA }],
  ["expired plan", { expiresAt: plan.preparedAt }],
  ["long-lived plan", { expiresAt: new Date(now + 7200000).toISOString() }],
  ["unreviewed extra field", { password: "private password A" }],
] as const) {
  test(`the owner plan rejects ${name} before credentials`, () => {
    expect(() => validateIsolationOwnerPlan({ ...plan, ...change }, project, now)).toThrow();
  });
}

test("the independently expected project must match the owner plan", () => {
  expect(() => validateIsolationOwnerPlan(plan, "bbbbbbbbbbbbbbbbbbbb", now)).toThrow("staging_plan_invalid");
});

for (const [mode, failure, signins, logouts, unknown] of [
  ["wrong-user", "signed_in_user_mismatch", 1, 1, false],
  ["second-signin-failed", "test_signin_failed", 2, 1, false],
  ["network-failure", "auth_request_failed", 1, 0, true],
  ["invalid-json", "auth_response_invalid", 1, 0, true],
  ["huge-json", "auth_response_invalid", 1, 0, true],
  ["long-expiry", "session_expiry_outside_scope", 1, 1, false],
] as const) {
  test(`the owner runner stops and preserves session uncertainty on ${mode}`, async () => {
    const run = await exercise(mode);
    expect(run.result.passed).toBe(false); expect(run.result.failureCode).toBe(failure);
    expect(run.signins).toBe(signins); expect(run.logouts).toBe(logouts); expect(run.probes).toBe(0);
    expect(run.result.sessionOutcomeUnknown).toBe(unknown);
  });
}

for (const [mode, failure] of [["read-failure", "member_read_probe_failed"], ["probe-invalid", "probe_receipt_invalid"],
  ["probe-exception", "owner_check_failed"], ["logout-failure", "local_signout_failed"]] as const) {
  test(`both new sessions get a local sign-out attempt after ${mode}`, async () => {
    const run = await exercise(mode);
    expect(run.result.passed).toBe(false); expect(run.result.failureCode).toBe(failure);
    expect(run.logouts).toBe(2); expect(run.calls).toHaveLength(4);
  });
}

test("an admin key is rejected before any sign-in or probe", async () => {
  const run = await exercise("valid", { input: ["sb_secret_private password A"] });
  expect(run.result.failureCode).toBe("public_key_required"); expect(run.calls).toHaveLength(0); expect(run.probes).toBe(0);
});

test("cancelling the second credential prompt signs out the first newly created session", async () => {
  const run = await exercise("valid", { input: [key, privateValues[1], privateValues[3]] });
  expect(run.result.failureCode).toBe("private_input_cancelled"); expect(run.logouts).toBe(1); expect(run.probes).toBe(0);
});

test("a pre-cancelled owner check never creates a session", async () => {
  const controller = new AbortController(); controller.abort();
  const run = await exercise("valid", { signal: controller.signal });
  expect(run.result.failureCode).toBe("owner_check_cancelled"); expect(run.calls).toHaveLength(0);
});

test("a plan that expires during credential entry sends no password request", async () => {
  let clock = now, requests = 0;
  const result = await runIsolationOwnerCheck(plan, { expectedProjectRef: project, confirmed: true, now: () => clock,
    promptSecret: async (label: string) => {
      if (label.includes("key")) return key;
      if (label.includes("email")) return privateValues[1];
      clock = now + 3600001; return privateValues[3];
    },
    fetchImpl: (async () => { requests++; throw new Error("unexpected network"); }) as typeof fetch,
    runProbe: async () => { throw new Error("unexpected probe"); } });
  expect(requests).toBe(0); expect(result.failureCode).toBe("staging_plan_expired");
  expect(result.signInsAttempted).toBe(0); expect(result.sessionOutcomeUnknown).toBe(false);
});

for (const mode of ["valid", "oversized-output", "invalid-output", "spawn-error"]) {
  test(`the memory handoff excludes credentials from child arguments and environment: ${mode}`, async () => {
    let pipeInput = "", spawned = 0, killed = 0;
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(),
      kill: () => { killed++; return true; } });
    child.stdin.on("data", bytes => { pipeInput += bytes.toString(); });
    const spawnImpl = (_command: string, args: string[], options: { env: Record<string, string>; timeout: number }) => {
      spawned++;
      for (const value of privateValues) if (![userA, userB].includes(value)) expect(JSON.stringify({ args, env: options.env })).not.toContain(value);
      expect(args).toContain("--session-input-stdin"); expect(args).toContain("--expected-user-a");
      expect(options.timeout).toBe(420000);
      queueMicrotask(() => {
        if (mode === "spawn-error") child.emit("error", new Error(privateValues[3]));
        else { child.stdout.write(mode === "valid" ? JSON.stringify(goodProbe) : mode === "oversized-output" ? "x".repeat(17000) : "invalid"); child.emit("close", 0); }
      });
      return child;
    };
    const result = await runIsolationReadProbe({ plan, anonKey: key, tokenA: privateValues[5], tokenB: privateValues[6] }, { root: resolve("."), spawnImpl: spawnImpl as never });
    expect(spawned).toBe(1); expect(JSON.parse(pipeInput)).toEqual({ anonKey: key, tokenA: privateValues[5], tokenB: privateValues[6] });
    expect(result).toEqual(mode === "valid" ? goodProbe : null); expect(killed).toBe(mode === "oversized-output" ? 1 : 0);
  });
}

function terminal() {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false,
    setRawMode(value: boolean) { this.isRaw = value; return this; } });
  const output = Object.assign(new PassThrough(), { isTTY: true });
  let printed = ""; output.on("data", chunk => { printed += chunk.toString(); });
  return { input, output, printed: () => printed };
}

test("terminal input never echoes a pasted password and restores raw/paused state", async () => {
  const { input, output, printed } = terminal(); input.pause();
  const result = hiddenTerminalInput("Password", input as never, output as never);
  input.emit("keypress", "private password A", {}); input.emit("keypress", "", { name: "backspace" });
  input.emit("keypress", "B", {}); input.emit("keypress", "", { name: "return" });
  expect(await result).toBe("private password B"); expect(printed()).toBe("Password: \n");
  expect(input.isRaw).toBe(false); expect(input.isPaused()).toBe(true); expect(input.listenerCount("keypress")).toBe(0);
});

for (const mode of ["control-c", "abort", "timeout"]) {
  test(`terminal cleanup restores state after ${mode}`, async () => {
    const { input, output } = terminal(); const controller = new AbortController();
    const result = hiddenTerminalInput("Password", input as never, output as never, mode === "timeout" ? 5 : 1000, controller.signal);
    const rejected = expect(result).rejects.toThrow();
    input.emit("keypress", "private password A", {});
    if (mode === "control-c") input.emit("keypress", "", { ctrl: true, name: "c" });
    if (mode === "abort") controller.abort();
    await rejected; expect(input.isRaw).toBe(false); expect(input.listenerCount("keypress")).toBe(0);
  });
}

test("terminal restoration failure rejects without an uncaught credential-prompt exception", async () => {
  const { input, output } = terminal();
  input.setRawMode = value => { if (!value) throw new Error("terminal closed"); input.isRaw = value; return input; };
  const result = hiddenTerminalInput("Password", input as never, output as never);
  const rejected = expect(result).rejects.toThrow("private_terminal_restore_failed");
  input.emit("keypress", "private password A", {}); input.emit("keypress", "", { name: "return" });
  await rejected; expect(input.listenerCount("keypress")).toBe(0);
});

test("secret input refuses non-TTY streams before reading", async () => {
  const { input, output } = terminal(); input.isTTY = false;
  await expect(hiddenTerminalInput("Password", input as never, output as never)).rejects.toThrow("private_terminal_required");
  expect(input.listenerCount("keypress")).toBe(0);
});

test("the CLI is plan-only by default and refuses non-interactive run before network", () => {
  const directory = mkdtempSync(join(tmpdir(), "agentos-owner-plan-"));
  try {
    const file = join(directory, "plan.json"), counts = join(directory, "calls.json"), preload = join(directory, "network.mjs");
    writeFileSync(file, JSON.stringify({ ...plan, preparedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3590000).toISOString() }), { mode: 0o600 });
    writeFileSync(preload, `import {writeFileSync} from 'node:fs';let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected network')};process.on('exit',()=>writeFileSync(${JSON.stringify(counts)},JSON.stringify(calls)));`);
    const base = ["--import", preload, resolve("scripts/verify-client-isolation-owner.mjs"), "--plan-file", file, "--expected-project-ref", project];
    for (const flags of [[], ["--run"], ["--run", "--confirm-staging-auth-reads-and-local-signout"]]) {
      const result = spawnSync(process.execPath, [...base, ...flags], { encoding: "utf8", timeout: 10000, env: { PATH: process.env.PATH } });
      expect(result.status).toBe(flags.length ? 1 : 0);
      if (!flags.length) expect(JSON.parse(result.stdout)).toMatchObject({ mode: "plan-only", maximumTotalRequests: 142, networkRequestsMade: 0 });
      expect(JSON.parse(readFileSync(counts, "utf8"))).toBe(0);
      for (const value of privateValues) expect(result.stdout + result.stderr).not.toContain(value);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
