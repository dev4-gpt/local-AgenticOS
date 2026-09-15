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
  const checklist = readFileSync(resolve(process.cwd(), "docs/production-release-acceptance-checklist.md"), "utf8");
  const supportRoute = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/support/route.ts"), "utf8");
  const stripeDisposition = readFileSync(resolve(process.cwd(), "product-experience/supabase-v44-stripe-financial-event-dispositions.sql"), "utf8");
  const webhookReview = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/internal/billing/webhook-review/route.ts"), "utf8");
  expect(verifier).toContain("migrationApplied");
  expect(verifier).toContain("rollbackTarget");
  expect(verifier).toContain("configurationHash");
  expect(verifier).toContain("tenantIsolationResult");
  expect(verifier).toContain("managedOpenRouterResult");
  expect(verifier).toContain("OPENROUTER_MANAGED_SECRET_RESOURCE");
  expect(verifier).toContain("OPENROUTER_MANAGED_PRICING_SNAPSHOT_ID");
  expect(verifier).toContain("verify-content-os-video-pilot.mjs");
  expect(verifier).toContain("manual-pilot");
  expect(verifier).toContain("TURNSTILE_SECRET_KEY");
  expect(verifier).toContain("LEAD_NOTIFICATION_TO");
  expect(supportRoute).toContain("notifyLead");
  expect(supportRoute).toContain("teamNotification");
  expect(runbook).toContain("Do not point the public domain at a tenant runtime directly");
  expect(runbook).toContain("before live mode");
  expect(checklist).toContain("configure a $4");
  expect(checklist).toContain("lifetime cap");
  expect(checklist).toContain("verify:production-readiness -- --strict");
  expect(checklist).toContain("Personal video Content OS");
  expect(stripeDisposition).toContain("stripe_financial_event_dispositions");
  expect(stripeDisposition).toContain("revoke all");
  expect(stripeDisposition).toContain("append-only");
  expect(stripeDisposition).toContain("before update or delete");
  expect(webhookReview).toContain("x-control-plane-secret");
  expect(webhookReview).toContain("webhook_event_not_reviewable");
});

test("public onboarding wires Turnstile only through public site-key and server secret paths", () => {
  const form = readFileSync(resolve(process.cwd(), "product-experience/src/components/editions/StartIntakeForm.tsx"), "utf8");
  const route = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/deployment-request/route.ts"), "utf8");
  expect(form).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  expect(form).toContain("challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
  expect(form).toContain("captchaToken");
  expect(route).toContain("TURNSTILE_SECRET_KEY");
  expect(route).toContain("captcha_failed");
  expect(route).not.toContain("NEXT_PUBLIC_TURNSTILE_SECRET");
});

test("public launch migration fails closed for control-plane privileges", () => {
  const migration = readFileSync(resolve(process.cwd(), "product-experience/supabase-public-launch-control-plane.sql"), "utf8");
  expect(migration).toContain("from public, anon, authenticated;");
  expect(migration).toContain("revoke execute on function public.credit_client_managed_wallet(text, bigint, text, jsonb)");
  expect(migration).toContain("grant execute on function public.credit_client_managed_wallet(text, bigint, text, jsonb) to service_role;");
  expect(migration).not.toContain("revoke execute on function public.credit_client_managed_wallet(text, bigint, text, jsonb) from anon, authenticated;");
});

test("commercial scope remains separate from runtime manifest and billing", () => {
  const migration = readFileSync(resolve(process.cwd(), "product-experience/supabase-commercial-scope.sql"), "utf8");
  const intake = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/deployment-request/route.ts"), "utf8");
  const approval = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/scope/approve/route.ts"), "utf8");
  const manifestApproval = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/approve/route.ts"), "utf8");
  const checkout = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/billing/checkout/route.ts"), "utf8");
  const operatorTool = readFileSync(resolve(process.cwd(), "scripts/approve-stripe-test-fixture.mjs"), "utf8");
  expect(migration).toContain("commercial_scope_recommendation");
  expect(migration).toContain("commercial_scope_quote");
  expect(intake).toContain("recommendCommercialScope");
  expect(approval).toContain("commercial_scope_status: \"approved\"");
  expect(manifestApproval).toContain("applyCommercialScopeToManifest");
  expect(manifestApproval).toContain("commercial_scope_approval_required");
  expect(checkout).toContain("commercial_scope_pending");
  expect(checkout).toContain("metadata[commercial_scope]");
  expect(approval).toContain("providerCreditsIncluded: false");
});

test("the disposable Stripe fixture can only run under an explicit test key", () => {
  const launch = readFileSync(resolve(process.cwd(), "product-experience/src/lib/publicLaunch.ts"), "utf8");
  const approval = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/scope/approve/route.ts"), "utf8");
  const checkout = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/billing/checkout/route.ts"), "utf8");
  const operatorTool = readFileSync(resolve(process.cwd(), "scripts/approve-stripe-test-fixture.mjs"), "utf8");

  expect(launch).toContain("function stripeTestFixtureConfig()");
  expect(launch).toContain('process.env.STRIPE_MODE?.trim() !== "test"');
  expect(launch).toContain('secret.startsWith("sk_test_")');
  expect(launch).toContain("STRIPE_TEST_FIXTURE_ENABLED");
  expect(approval).toContain("const testFixture = stripeTestFixtureConfig()");
  expect(approval).toContain("body.stripeTestFixture === true && !testFixture");
  expect(approval).toContain('error: "stripe_test_fixture_not_configured"');
  expect(approval).toContain("testFixture: true");
  expect(checkout).toContain("stripe_test_fixture_not_configured");
  expect(checkout).toContain('"metadata[test_fixture]": "true"');
  expect(checkout).toContain('"managed_payments[enabled]": "false"');
  expect(operatorTool).toContain("CONTROL_PLANE_OPERATOR_SECRET");
  expect(operatorTool).toContain("export CONTROL_PLANE_OPERATOR_SECRET");
  expect(operatorTool).toContain("stripeTestFixture: true");
  expect(operatorTool).toContain("quote?.testFixture !== true");
  expect(operatorTool).toContain("initialTotalCents !== 100");
});

test("tenant activation is bound to a deployed runtime smoke and the verified owner membership", () => {
  const deploy = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/deploy/route.ts"), "utf8");
  const provisionResult = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/provision-result/route.ts"), "utf8");
  const activate = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/activate/route.ts"), "utf8");
  const setup = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/setup/route.ts"), "utf8");
  const adapter = readFileSync(resolve(process.cwd(), "workers/gcp-provisioner/worker.mjs"), "utf8");

  expect(adapter).toContain("VELOCE_RUNTIME_URL");
  expect(adapter).toContain("async function smokeRuntime(runtimeUrl)");
  expect(adapter).toContain('"runtime_smoke"');
  expect(deploy).toContain('current_step: "eq.prepared"');
  expect(deploy).toContain('phase: "deploy"');
  expect(deploy).toContain('const initialDeployKey = `deploy:${requestId}`');
  expect(deploy).toContain("function isSafePreMutationFailure");
  expect(deploy).toContain("retry_of_run_id");
  expect(provisionResult).toContain("provisioning_callback_manifest_mismatch");
  expect(provisionResult).toContain('supabaseServiceUpsert("client_tenants"');
  expect(provisionResult).toContain("activationReady: true");
  expect(activate).toContain("runtime_smoke_required");
  expect(activate).not.toContain('["smoke_testing", "provisioning"]');
  expect(setup).toContain('supabaseServiceUpsert("client_memberships"');
  expect(setup).toContain('role: "owner"');
  const setupPage = readFileSync(resolve(process.cwd(), "product-experience/src/app/setup/page.tsx"), "utf8");
  expect(setupPage).toContain("Continue securely");
  expect(setupPage).not.toContain("useEffect");
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
