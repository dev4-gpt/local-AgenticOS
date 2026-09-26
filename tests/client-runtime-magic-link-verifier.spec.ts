import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = () => readFileSync(resolve(process.cwd(), "scripts/verify-client-runtime-magic-link.mjs"), "utf8");

test("magic-link verifier drives the browser callback and only reports redacted outcomes", () => {
  const script = source();
  expect(script).toContain('page.goto(callbackUrl');
  expect(script).toContain('magic_link_http_${magicLinkResponseStatus || "missing"}');
  expect(script).toContain('"authenticated_home_redirected_to_login"');
  expect(script).toContain('fetch("/api/client-auth/logout"');
  expect(script).toContain("magic-link acceptance passed");
  expect(script).toContain('throw new Error("redirect_target_rejected")');
  expect(script).toContain('const supabaseOrigin = new URL(supabaseUrl).origin');
  expect(script).not.toContain("console.log(actionLink)");
  expect(script).not.toContain("console.log(callbackUrl)");
});

test("magic-link verifier creates and removes only disposable fixtures", () => {
  const script = source();
  expect(script).toContain('email_confirm: true');
  expect(script).toContain('name: "Disposable magic-link verifier"');
  expect(script).toContain('client_memberships?tenant_slug=eq.');
  expect(script).toContain('client_tenants?slug=eq.');
  expect(script).toContain('/auth/v1/admin/users/${encodeURIComponent(userId)}');
  expect(script).toContain("finally");
  expect(script).not.toContain("SUPABASE_ANON_KEY");
  expect(script).not.toContain("cleanupFailed ||=");
  expect(script).toContain("const membershipRemoved = await adminStatus");
  expect(script).toContain("const tenantRemoved = await adminStatus");
  expect(script).toContain("const userRemoved = await adminStatus");
});
