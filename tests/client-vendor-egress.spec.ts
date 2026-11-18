import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { captureClientProductEvent, KNOWN_CLASSIFICATIONS, KNOWN_REASONS, logClientRuntimeEvent, vendorSafeFields } from "../src/lib/clientRuntimeObservability";

// ADR-013: what PostHog, Sentry and Datadog may receive. Every request below is the real outgoing request, captured at fetch.
// All values are made up inside this test; none is a real client's or a real key.
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalInfo = console.info;
test.beforeEach(() => {
  Object.assign(process.env, {
    CLIENT_POSTHOG_CAPTURE_ENABLED: "1", POSTHOG_API_KEY: "fixture-posthog-key", POSTHOG_HOST: "https://posthog.invalid",
    SENTRY_DSN: "https://fixture-sentry-key@sentry.invalid/1",
    CLIENT_DATADOG_CAPTURE_ENABLED: "1", DATADOG_API_KEY: "fixture-datadog-key",
  });
  delete process.env.DATADOG_SITE;
  console.info = () => undefined;
});
test.afterEach(() => { process.env = { ...originalEnv }; globalThis.fetch = originalFetch; console.info = originalInfo; });

// The only field names any vendor may ever see. Changing this list is a deliberate decision, not a side effect.
const ALLOWED_FIELDS = ["tenant", "status", "reason", "provider", "capability", "classification", "requestId", "jobId", "attempt", "messageCount"];

type Sent = { url: string; headers: Record<string, string>; body: string };
function captureFetch(): Sent[] {
  const sent: Sent[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers as HeadersInit).entries()), body: String(init?.body ?? "") });
    return Response.json({});
  }) as typeof fetch;
  return sent;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const vendorOf = (request: Sent) => request.url.includes("posthog.invalid") ? "posthog" : request.url.includes("sentry.invalid") ? "sentry" : request.url.includes("http-intake.logs") ? "datadog" : "unknown";

/** The field bag each vendor actually received. */
function receivedFields(request: Sent): Record<string, unknown> {
  const vendor = vendorOf(request);
  if (vendor === "posthog") { const { source: _source, ...rest } = JSON.parse(request.body).properties; return rest; }
  if (vendor === "sentry") { const event = JSON.parse(request.body.split("\n")[2]); return { ...event.tags, ...event.extra }; }
  if (vendor === "datadog") return JSON.parse(request.body)[0].veloce;
  throw new Error(`unexpected egress to ${request.url}`);
}

const CANARIES = ["acme-holdings", "acme-corp-q3-pricing", "jane.doe@example.com", "quarterly-pricing-for-acme", "client-secret-provider", "please-call-jane-on-5550100"];

test("hostile client text never reaches any vendor, in any field", async () => {
  const sent = captureFetch();
  logClientRuntimeEvent("runtime.provider_failed", {
    tenant: "acme-holdings", reason: "acme-corp-q3-pricing", provider: "client-secret-provider", capability: "jane.doe@example.com",
    classification: "quarterly-pricing-for-acme", jobId: "please-call-jane-on-5550100", requestId: "acme-corp-q3-pricing", status: 500,
    prompt: "please-call-jane-on-5550100", message: "jane.doe@example.com", content: "acme-corp-q3-pricing", email: "jane.doe@example.com", text: "quarterly-pricing-for-acme",
  });
  await settle();
  expect(sent.map(vendorOf).sort()).toEqual(["datadog", "posthog", "sentry"]);
  const everything = sent.map((request) => `${request.url}\n${JSON.stringify(request.headers)}\n${request.body}`).join("\n").toLowerCase();
  for (const canary of CANARIES) expect(everything, canary).not.toContain(canary);
  for (const request of sent) {
    const fields = receivedFields(request);
    expect(Object.keys(fields).every((key) => ALLOWED_FIELDS.includes(key)), `${vendorOf(request)} fields: ${Object.keys(fields)}`).toBe(true);
    expect(fields).toMatchObject({ reason: "other", provider: "other", status: 500 });
    // An email-shaped value is dropped before the vendor gate; a code-shaped one is sent as "other". Either way it does not leave.
    expect([undefined, "other"]).toContain(fields.capability);
    expect(String(fields.tenant)).toMatch(/^tenant:[a-f0-9]{24}$/);
    expect(fields).not.toHaveProperty("jobId");
    expect(fields).not.toHaveProperty("requestId");
  }
});

test("known values still arrive intact, so the limit does not blind the vendors", async () => {
  const sent = captureFetch();
  logClientRuntimeEvent("runtime.provider_failed", { tenant: "acme-holdings", provider: "openai", reason: "provider_not_configured", capability: "text-agents", status: 503 });
  await settle();
  expect(sent).toHaveLength(3);
  for (const request of sent) expect(receivedFields(request)).toMatchObject({ provider: "openai", reason: "provider_not_configured", capability: "text-agents", classification: "provider_auth", status: 503 });
});

test("product events from the browser route are held to the same limits", async () => {
  const sent = captureFetch();
  const ok = await captureClientProductEvent({
    event: "client_runtime_provider_request_failed", distinctId: "a".repeat(64),
    properties: { tenant: "tenant:" + "b".repeat(24), provider: "client-secret-provider", reason: "acme-corp-q3-pricing", prompt: "jane.doe@example.com", messageCount: 4 },
  });
  await settle();
  expect(ok).toBe(true);
  expect(sent).toHaveLength(1);
  expect(receivedFields(sent[0])).toEqual({ tenant: `tenant:${"b".repeat(24)}`, provider: "other", reason: "other", messageCount: 4 });
  expect(sent[0].body.toLowerCase()).not.toContain("jane.doe");
});

function prng(seed: number) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test("random hostile strings in every free-text field never leave, and known fields only ever carry known values", async () => {
  const sent = captureFetch();
  const next = prng(20261020);
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789-_.:@/ ";
  const word = () => {
    let out = alphabet[Math.floor(next() * 36)];
    for (let i = 0, n = 10 + Math.floor(next() * 30); i < n; i++) out += alphabet[Math.floor(next() * alphabet.length)];
    return out.trim();
  };
  const planted: string[] = [];
  for (let i = 0; i < 40; i++) {
    const values = { tenant: word(), reason: word(), provider: word(), capability: word(), classification: word(), prompt: word(), text: word() };
    planted.push(...Object.values(values).filter((value) => value.length >= 10));
    logClientRuntimeEvent("runtime.provider_failed", { ...values, status: 500 });
  }
  await settle();
  expect(sent.length).toBe(40 * 3);
  const everything = sent.map((request) => `${request.url}\n${request.body}`).join("\n").toLowerCase();
  for (const value of planted) expect(everything.includes(value.toLowerCase()), value).toBe(false);
  for (const request of sent) {
    const fields = receivedFields(request);
    expect(Object.keys(fields).every((key) => ALLOWED_FIELDS.includes(key))).toBe(true);
    if (fields.reason !== undefined) expect(fields.reason === "other" || KNOWN_REASONS.has(String(fields.reason))).toBe(true);
    if (fields.classification !== undefined) expect(fields.classification === "other" || KNOWN_CLASSIFICATIONS.has(String(fields.classification))).toBe(true);
  }
});

test("the gate keeps only the pinned field names, whatever it is given", () => {
  const candidates = ["tenant", "status", "reason", "provider", "capability", "classification", "requestId", "jobId", "attempt", "messageCount",
    "bucket", "route", "source", "result", "prompt", "message", "content", "email", "name", "text", "body", "input", "output", "error", "stack", "url", "note"];
  const given = Object.fromEntries(candidates.map((key) => [key, key === "status" || key === "attempt" || key === "messageCount" ? 1 : "openai"]));
  const kept = Object.keys(vendorSafeFields(given as never));
  expect(kept.every((key) => ALLOWED_FIELDS.includes(key))).toBe(true);
  expect(kept).not.toContain("route");
  expect(kept).not.toContain("source");
  expect(kept).not.toContain("result");
  expect(kept).not.toContain("bucket");
});

test("Datadog goes only to a known site, only when switched on, with the key in the header and never the body", async () => {
  delete process.env.CLIENT_DATADOG_CAPTURE_ENABLED;
  let sent = captureFetch();
  logClientRuntimeEvent("runtime.provider_failed", { tenant: "acme-holdings", status: 500 });
  await settle();
  expect(sent.map(vendorOf)).not.toContain("datadog");

  process.env.CLIENT_DATADOG_CAPTURE_ENABLED = "1";
  process.env.DATADOG_SITE = "ddog-gov.com";
  sent = captureFetch();
  logClientRuntimeEvent("runtime.provider_failed", { tenant: "acme-holdings", status: 500 });
  await settle();
  expect(sent.map(vendorOf)).not.toContain("datadog");

  process.env.DATADOG_SITE = "evil.example.com/";
  sent = captureFetch();
  logClientRuntimeEvent("runtime.provider_failed", { tenant: "acme-holdings", status: 500 });
  await settle();
  expect(sent.some((request) => request.url.includes("evil.example.com"))).toBe(false);

  delete process.env.DATADOG_SITE;
  sent = captureFetch();
  logClientRuntimeEvent("runtime.provider_failed", { tenant: "acme-holdings", status: 500 });
  await settle();
  const datadog = sent.find((request) => vendorOf(request) === "datadog")!;
  expect(datadog.url).toBe("https://http-intake.logs.datadoghq.com/api/v2/logs");
  expect(datadog.headers["dd-api-key"]).toBe("fixture-datadog-key");
  expect(datadog.body).not.toContain("fixture-datadog-key");
  const logs = JSON.parse(datadog.body);
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({ ddsource: "veloce", service: "veloce-client-runtime", status: "warn", message: "runtime.provider_failed" });
});

test("a vendor failure cannot break the operation that triggered the event", async () => {
  globalThis.fetch = (() => { throw new Error("fixture-vendor-failure"); }) as typeof fetch;
  expect(() => logClientRuntimeEvent("runtime.provider_failed", { tenant: "acme-holdings", status: 500 })).not.toThrow();
  await settle();
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (name === "node_modules" || name === "graphify-out") return [];
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx|mjs)$/.test(name) ? [path] : [];
  });
}

test("no other file in src can send to a telemetry vendor", () => {
  const vendorEgress = /http-intake\.logs|\/envelope\/\?sentry|app\.posthog\.com|\/capture\/`|sentry_key=|DD-API-KEY/;
  const offenders = sourceFiles("src")
    .filter((path) => !path.endsWith("clientRuntimeObservability.ts"))
    .filter((path) => vendorEgress.test(readFileSync(path, "utf8")));
  expect(offenders).toEqual([]);
});
