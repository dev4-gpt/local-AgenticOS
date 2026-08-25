import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { notifyLead } from "../product-experience/src/lib/leadNotification";

test("release verifier records the current revision without secrets", () => {
  const script = resolve(process.cwd(), "scripts/verify-production-readiness.mjs");
  const result = spawnSync(process.execPath, [script, "--allow-dirty", "--test-result", "typecheck=passed"], { cwd: process.cwd(), encoding: "utf8" });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('"releaseReady": false');
  expect(result.stdout).not.toMatch(/sk-[A-Za-z0-9_-]{16,}|service_role|api[_ -]?key\s*[:=]/i);
});

test("production readiness source keeps live gates explicit", () => {
  const verifier = readFileSync(resolve(process.cwd(), "scripts/verify-production-readiness.mjs"), "utf8");
  const runbook = readFileSync(resolve(process.cwd(), "docs/public-launch-runbook.md"), "utf8");
  const supportRoute = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/support/route.ts"), "utf8");
  expect(verifier).toContain("migrationResult");
  expect(verifier).toContain("rollbackTarget");
  expect(verifier).toContain("configurationHash");
  expect(verifier).toContain("tenantIsolationResult");
  expect(verifier).toContain("managedOpenRouterResult");
  expect(verifier).toContain("OPENROUTER_MANAGED_SECRET_RESOURCE");
  expect(verifier).toContain("OPENROUTER_MANAGED_PRICING_SNAPSHOT_ID");
  expect(verifier).toContain("TURNSTILE_SECRET_KEY");
  expect(verifier).toContain("LEAD_NOTIFICATION_TO");
  expect(supportRoute).toContain("notifyLead");
  expect(supportRoute).toContain("teamNotification");
  expect(runbook).toContain("Do not point the public domain at a tenant runtime directly");
  expect(runbook).toContain("before live mode");
});

test("public launch migration fails closed for control-plane privileges", () => {
  const migration = readFileSync(resolve(process.cwd(), "product-experience/supabase-public-launch-control-plane.sql"), "utf8");
  expect(migration).toContain("from public, anon, authenticated;");
  expect(migration).toContain("revoke execute on function public.credit_client_managed_wallet(text, bigint, text, jsonb)");
  expect(migration).toContain("grant execute on function public.credit_client_managed_wallet(text, bigint, text, jsonb) to service_role;");
  expect(migration).not.toContain("revoke execute on function public.credit_client_managed_wallet(text, bigint, text, jsonb) from anon, authenticated;");
});

test("team support notification is server-side and contains no credential field", async () => {
  const saved = {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.LEAD_NOTIFICATION_FROM,
    to: process.env.LEAD_NOTIFICATION_TO,
    fetch: globalThis.fetch,
  };
  const requests: Array<{ body: Record<string, unknown> }> = [];
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.LEAD_NOTIFICATION_FROM = "support@example.com";
  process.env.LEAD_NOTIFICATION_TO = "team@example.com";
  globalThis.fetch = async (_url, init) => {
    requests.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response("{}", { status: 200 });
  };
  try {
    expect(await notifyLead({
      kind: "support request",
      name: "Managed provider access · OPENROUTER_API_KEY",
      email: "client@example.com",
      source: "support:managed_provider_access",
      details: ["Provider: OPENROUTER_API_KEY", "Requested budget micros: 1000000"],
    })).toBe("sent");
    const body = requests[0]?.body;
    expect(body?.to).toEqual(["team@example.com"]);
    expect(String(body?.text)).toContain("Provider: OPENROUTER_API_KEY");
    expect(String(body?.text)).not.toContain("secretValue");
    expect(String(body?.text)).not.toContain("api_key:");
  } finally {
    if (saved.apiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.apiKey;
    if (saved.from === undefined) delete process.env.LEAD_NOTIFICATION_FROM; else process.env.LEAD_NOTIFICATION_FROM = saved.from;
    if (saved.to === undefined) delete process.env.LEAD_NOTIFICATION_TO; else process.env.LEAD_NOTIFICATION_TO = saved.to;
    globalThis.fetch = saved.fetch;
  }
});
