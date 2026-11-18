import { emitKeypressEvents } from "node:readline";
import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { offlineTestEnvironment } from "./offline-test-environment.mjs";

export function validateIsolationOwnerPlan(value, expectedProjectRef, now = Date.now()) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const keys = ["schemaVersion", "environment", "projectRef", "url", "tenantA", "tenantB", "userA", "userB", "preparedAt", "expiresAt"];
  if (!value || Object.keys(value).sort().join() !== keys.sort().join()
      || value.schemaVersion !== 1 || value.environment !== "disposable-staging"
      || !/^[a-z0-9]{20}$/.test(expectedProjectRef) || value.projectRef !== expectedProjectRef)
    throw new Error("staging_plan_invalid");
  let url;
  try { url = new URL(value.url); } catch { throw new Error("staging_target_invalid"); }
  if (value.url !== `https://${expectedProjectRef}.supabase.co` || url.origin !== value.url)
    throw new Error("staging_target_invalid");
  if (![value.tenantA, value.tenantB].every(tenant => typeof tenant === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(tenant))
      || value.tenantA === value.tenantB || !uuid.test(value.userA) || !uuid.test(value.userB)
      || value.userA.toLowerCase() === value.userB.toLowerCase()) throw new Error("staging_members_invalid");
  const prepared = Date.parse(value.preparedAt), expires = Date.parse(value.expiresAt);
  if (![prepared, expires].every(Number.isFinite) || new Date(prepared).toISOString() !== value.preparedAt
      || new Date(expires).toISOString() !== value.expiresAt || prepared > now || expires <= now
      || expires <= prepared || expires - prepared > 3600000) throw new Error("staging_plan_clock_invalid");
  return { ...value, userA: value.userA.toLowerCase(), userB: value.userB.toLowerCase() };
}

export function hiddenTerminalInput(label, input = process.stdin, output = process.stderr, timeoutMs = 120000, signal) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") return Promise.reject(new Error("private_terminal_required"));
  if (signal?.aborted) return Promise.reject(new Error("owner_check_cancelled"));
  return new Promise((resolve, reject) => {
    const previousRaw = Boolean(input.isRaw), previouslyPaused = input.isPaused();
    let value = "", settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); input.off("keypress", keypress); input.off("end", ended); input.off("error", ended);
      signal?.removeEventListener("abort", aborted);
      try { input.setRawMode(previousRaw); if (previouslyPaused) input.pause(); }
      catch { error ||= "private_terminal_restore_failed"; }
      try { output.write("\n"); } catch { error ||= "private_terminal_unavailable"; }
      value = "";
      if (error) reject(new Error(error)); else resolve(result);
    };
    const ended = () => finish("private_input_cancelled");
    const aborted = () => finish("owner_check_cancelled");
    const keypress = (text, key = {}) => {
      if (key.ctrl && key.name === "c") return finish("private_input_cancelled");
      if (key.name === "return" || key.name === "enter") return finish(value ? null : "private_input_empty", value);
      if (key.name === "backspace") { value = Array.from(value).slice(0, -1).join(""); return; }
      if (key.ctrl || key.meta || typeof text !== "string" || /[\x00-\x1f\x7f]/.test(text)) return;
      value += text;
      if (value.length > 4096) finish("private_input_too_large");
    };
    const timer = setTimeout(() => finish("private_input_timeout"), timeoutMs);
    try {
      emitKeypressEvents(input); input.on("keypress", keypress); input.once("end", ended); input.once("error", ended);
      signal?.addEventListener("abort", aborted, { once: true });
      input.setRawMode(true); input.resume(); output.write(label + ": ");
    } catch { finish("private_terminal_unavailable"); }
  });
}

function publicKey(value, projectRef) {
  if (typeof value !== "string" || /[\r\n]/.test(value)) return false;
  if (/^sb_publishable_[a-zA-Z0-9_-]{16,}$/.test(value)) return true;
  try {
    const parts = value.split(".");
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return parts.length === 3 && claims.role === "anon" && claims.ref === projectRef;
  } catch { return false; }
}

async function boundedJson(response) {
  if (!response.ok || !response.body) throw new Error("auth_response_invalid");
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new Error("auth_response_invalid"); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { throw new Error("auth_response_invalid"); }
}

export async function runIsolationOwnerCheck(value, { expectedProjectRef, confirmed = false,
  promptSecret, runProbe, fetchImpl = fetch, now = Date.now, signal } = {}) {
  const plan = validateIsolationOwnerPlan(value, expectedProjectRef, now());
  if (!confirmed) throw new Error("staging_auth_read_signout_confirmation_required");
  const sessions = [], signouts = [];
  let requests = 0, signInsAttempted = 0, error = null, probe = null, anonKey;
  let sessionOutcomeUnknown = false;
  const request = async (path, options, cleanup = false) => {
    if (!cleanup && signal?.aborted) throw new Error("owner_check_cancelled");
    if (!cleanup && now() >= Date.parse(plan.expiresAt)) throw new Error("staging_plan_expired");
    requests++;
    if (path === "/auth/v1/token?grant_type=password") { signInsAttempted++; sessionOutcomeUnknown = true; }
    const deadline = AbortSignal.timeout(10000);
    try { return await fetchImpl(plan.url + path, { ...options, cache: "no-store", redirect: "error",
      signal: !cleanup && signal ? AbortSignal.any([signal, deadline]) : deadline }); }
    catch { throw new Error("auth_request_failed"); }
  };
  try {
    if (signal?.aborted) throw new Error("owner_check_cancelled");
    anonKey = await promptSecret("Supabase publishable or legacy anon key");
    if (!publicKey(anonKey, plan.projectRef)) throw new Error("public_key_required");
    for (const [label, user] of [["A", plan.userA], ["B", plan.userB]]) {
      if (signal?.aborted) throw new Error("owner_check_cancelled");
      const email = await promptSecret(`Test ${label} email`);
      let password = await promptSecret(`Test ${label} existing password`);
      if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+$/.test(email) || typeof password !== "string" || !password)
        throw new Error("test_credentials_invalid");
      const response = await request("/auth/v1/token?grant_type=password", {
        method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
      });
      password = "";
      if (!response.ok) { sessionOutcomeUnknown = false; throw new Error("test_signin_failed"); }
      const body = await boundedJson(response);
      if (typeof body.access_token !== "string" || !body.access_token || /[\r\n]/.test(body.access_token)) throw new Error("auth_response_invalid");
      const session = { token: body.access_token, expiresAt: null };
      sessions.push(session); sessionOutcomeUnknown = false;
      const expiry = Number.isSafeInteger(body.expires_at) ? body.expires_at
        : Number.isSafeInteger(body.expires_in) ? Math.floor(now() / 1000) + body.expires_in : null;
      if (!expiry || expiry <= now() / 1000 + 420 || expiry > now() / 1000 + 3900) throw new Error("session_expiry_outside_scope");
      session.expiresAt = new Date(expiry * 1000).toISOString();
      if (body.user?.id?.toLowerCase() !== user) throw new Error("signed_in_user_mismatch");
    }
    if (signal?.aborted) throw new Error("owner_check_cancelled");
    if (Date.parse(plan.expiresAt) <= now() + 420000) throw new Error("staging_plan_expired");
    if (sessions.some(session => Date.parse(session.expiresAt) <= now() + 420000)) throw new Error("session_expiry_outside_scope");
    const result = await runProbe({ plan, anonKey, tokenA: sessions[0].token, tokenB: sessions[1].token });
    if (signal?.aborted) throw new Error("owner_check_cancelled");
    // Persist only known counters, never child output or arbitrary response fields.
    if (!result || typeof result.passed !== "boolean" || result.readOnly !== true || result.authRequests !== 2
        || !Number.isSafeInteger(result.tablesChecked) || result.tablesChecked < 0 || result.tablesChecked > 34
        || result.tableRequests !== result.tablesChecked * 4 || result.expectedIdentitiesMatched !== true)
      throw new Error("probe_receipt_invalid");
    probe = { passed: result.passed, authRequests: 2, tableRequests: result.tableRequests,
      tablesChecked: result.tablesChecked, expectedIdentitiesMatched: true, readOnly: true };
    if (!probe.passed || probe.tablesChecked !== 34) throw new Error("member_read_probe_failed");
  } catch (failure) {
    const allowed = ["public_key_required", "test_credentials_invalid", "test_signin_failed", "auth_response_invalid", "auth_request_failed",
      "session_expiry_outside_scope", "signed_in_user_mismatch", "probe_receipt_invalid", "member_read_probe_failed",
      "private_input_cancelled", "private_input_empty", "private_input_too_large", "private_input_timeout", "owner_check_cancelled", "staging_plan_expired",
      "private_terminal_restore_failed", "private_terminal_unavailable"];
    error = allowed.includes(failure?.message) ? failure.message : "owner_check_failed";
  } finally {
    for (const session of sessions) {
      let passed = false;
      try {
        const response = await request("/auth/v1/logout?scope=local", { method: "POST",
          headers: { apikey: anonKey, Authorization: `Bearer ${session.token}` } }, true);
        passed = response.ok;
      } catch { /* Preserve failed sign-out without exposing its response. */ }
      signouts.push({ attempted: true, passed }); session.token = "";
    }
  }
  if (signouts.some(result => !result.passed)) error ||= "local_signout_failed";
  return { schemaVersion: 1, passed: !error, failureCode: error, signInsAttempted, sessionsObtained: sessions.length,
    authOperationRequests: requests, probe, currentSessionSignouts: signouts,
    requestUpperBound: 142, automaticRetries: 0, sessionOutcomeUnknown,
    hostedAuthSessionsMayHaveChanged: signInsAttempted > 0,
    accessJwtMayRemainValidUntil: sessions.map(session => session.expiresAt),
    passwordsOrTokensPersisted: false, appRowsWritten: false, providerCalls: 0,
    hostedExecutionProven: false, hostedExportProven: false, hostedRecoveryProven: false, releaseReady: false,
    limitations: ["Local sign-out does not revoke access JWTs before their expiry.",
      "Secrets are not deliberately persisted; JavaScript/OS memory erasure is not attested.",
      "Password sign-in may create platform Auth session/audit records; a lost response can leave session outcome unknown.",
      "Read probes do not establish application login, execution, export, retention recovery or release readiness."] };
}

export function runIsolationReadProbe({ plan, anonKey, tokenA, tokenB }, { root, signal, spawnImpl = spawn } = {}) {
  if (typeof root !== "string" || !isAbsolute(root)) return Promise.resolve(null);
  return new Promise(resolveProbe => {
    const child = spawnImpl(process.execPath, [resolve(root, "scripts/verify-client-runtime-isolation.mjs"),
      "--url", plan.url, "--expected-project-ref", plan.projectRef, "--tenant-a", plan.tenantA, "--tenant-b", plan.tenantB,
      "--expected-user-a", plan.userA, "--expected-user-b", plan.userB, "--session-input-stdin", "--json"],
    { cwd: root, env: offlineTestEnvironment(process.env, root), stdio: ["pipe", "pipe", "pipe"], timeout: 420000, signal });
    let output = "", tooLarge = false;
    child.stdout.on("data", bytes => { output += bytes.toString("utf8"); if (output.length > 16384) { tooLarge = true; child.kill(); } });
    child.stderr.resume(); child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ anonKey, tokenA, tokenB }));
    child.on("error", () => resolveProbe(null));
    child.on("close", code => {
      try { const report = JSON.parse(output); resolveProbe(!tooLarge && (code === 0 || report.passed === false) ? report : null); }
      catch { resolveProbe(null); }
      output = "";
    });
  });
}
