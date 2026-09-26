#!/usr/bin/env node
import { chromium } from "playwright";
import process from "node:process";

const runtimeUrl = required("VELOCE_RUNTIME_URL").replace(/\/$/, "");
const runtimeOrigin = new URL(runtimeUrl).origin;
const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const email = required("VELOCE_MAGIC_LINK_TEST_EMAIL").toLowerCase();
const tenantSlug = required("VELOCE_MAGIC_LINK_TEST_TENANT_SLUG");

if (!/^https:\/\//i.test(runtimeUrl)) fail("VELOCE_RUNTIME_URL must use HTTPS");
if (!/^\S+@\S+\.\S+$/.test(email)) fail("VELOCE_MAGIC_LINK_TEST_EMAIL must be an email address");
if (!/^magic-link-[a-f0-9]{18}$/.test(tenantSlug)) fail("invalid_disposable_tenant_slug");

let userId = "";
let browser;
let cleanupFailed = false;

try {
  const createdUser = await adminJson("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, email_confirm: true }),
  }, "create_auth_user");
  userId = stringValue(createdUser?.id);
  if (!userId) throw new Error("create_auth_user_invalid_response");

  await adminJson("/rest/v1/client_tenants?on_conflict=slug", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ slug: tenantSlug, name: "Disposable magic-link verifier", retention_days: 1, status: "active" }),
  }, "create_tenant");
  await adminJson("/rest/v1/client_memberships?on_conflict=tenant_slug,user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ tenant_slug: tenantSlug, user_id: userId, role: "owner", status: "active" }),
  }, "create_membership");

  const generated = await adminJson("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email, redirect_to: `${runtimeUrl}/auth/callback` }),
  }, "generate_link");
  const actionLink = stringValue(generated?.action_link);
  if (!actionLink) throw new Error("generate_link_invalid_response");
  const callbackUrl = await resolveCallbackUrl(actionLink);
  assert(new URLSearchParams(new URL(callbackUrl).hash.slice(1)).has("access_token"), "callback_access_token_missing");

  if (process.argv.includes("--diagnose-direct")) {
    await diagnoseDirect(callbackUrl);
  } else {
    await verifyBrowser(callbackUrl);
  }
} catch (error) {
  const code = error instanceof Error && /^[a-z0-9_-]{1,100}$/i.test(error.message) ? error.message : "unexpected_failure";
  console.error(`magic-link acceptance failed: ${code}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => { cleanupFailed = true; });
  if (userId) {
    const membershipRemoved = await adminStatus(`/rest/v1/client_memberships?tenant_slug=eq.${encodeURIComponent(tenantSlug)}&user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" });
    const tenantRemoved = await adminStatus(`/rest/v1/client_tenants?slug=eq.${encodeURIComponent(tenantSlug)}`, { method: "DELETE" });
    const userRemoved = await adminStatus(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
    cleanupFailed = cleanupFailed || !membershipRemoved || !tenantRemoved || !userRemoved;
  }
  if (cleanupFailed) {
    console.error("magic-link acceptance cleanup failed");
    process.exitCode = 1;
  }
}

async function diagnoseDirect(callbackUrl) {
  const refreshToken = new URLSearchParams(new URL(callbackUrl).hash.slice(1)).get("refresh_token");
  assert(refreshToken, "callback_refresh_token_missing");
  const response = await fetch(`${runtimeUrl}/api/client-auth/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const code = await safeResponseError(response.json().catch(() => null));
  if (!response.ok) throw new Error(`direct_magic_link_http_${response.status}_${code}`);
  console.log("direct magic-link acceptance passed");
}

async function verifyBrowser(callbackUrl) {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let magicLinkResponseStatus = 0;
  let magicLinkResponseError = Promise.resolve("unknown");
  let pageErrorCount = 0;
  page.on("pageerror", () => { pageErrorCount += 1; });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/client-auth/magic-link") {
      magicLinkResponseStatus = response.status();
      magicLinkResponseError = safeResponseError(response.json().catch(() => null));
    }
  });
  await page.goto(callbackUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.location.pathname !== "/auth/callback", { timeout: 5_000 }).catch(() => {});
  if (!magicLinkResponseStatus) {
    const message = await page.locator("main").innerText().catch(() => "");
    const callbackState = message.includes("invalid or expired") ? "invalid_link" : message.includes("could not be accepted") ? "exchange_error" : "no_client_transition";
    throw new Error(`magic_link_request_missing_${callbackState}_pageerror_${pageErrorCount}`);
  }
  if (magicLinkResponseStatus !== 200) {
    const errorCode = await Promise.race([
      magicLinkResponseError,
      new Promise((resolve) => setTimeout(() => resolve("unknown"), 5_000)),
    ]);
    throw new Error(`magic_link_http_${magicLinkResponseStatus}_${errorCode}`);
  }
  assert(new URL(page.url()).pathname === "/", "authenticated_home_redirected_to_login");
  const cookies = await context.cookies(runtimeOrigin);
  assert(cookies.some((cookie) => cookie.name === "veloce_access_token" && cookie.httpOnly && cookie.secure), "access_cookie_missing");
  assert(cookies.some((cookie) => cookie.name === "veloce_refresh_token" && cookie.httpOnly && cookie.secure), "refresh_cookie_missing");

  await page.goto(`${runtimeUrl}/context`, { waitUntil: "domcontentloaded" });
  assert(page.url().startsWith(`${runtimeOrigin}/context`), "protected_route_not_accepted");
  await page.evaluate(() => fetch("/api/client-auth/logout", { method: "POST", credentials: "same-origin" }));
  await page.goto(`${runtimeUrl}/context`, { waitUntil: "domcontentloaded" });
  assert(page.url().startsWith(`${runtimeOrigin}/login`), "logout_did_not_reject_protected_route");
  console.log("magic-link acceptance passed");
}

async function safeResponseError(bodyPromise) {
  const body = await bodyPromise;
  const code = stringValue(body?.error);
  return ["invalid_magic_link", "session_rejected", "tenant_membership_required"].includes(code) ? code : "unknown";
}

async function resolveCallbackUrl(actionLink) {
  let current = actionLink;
  const supabaseOrigin = new URL(supabaseUrl).origin;
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(current, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const location = response.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) throw new Error(`confirm_link_${response.status}`);
    const target = new URL(location, current);
    if (target.origin === runtimeOrigin && target.pathname === "/auth/callback" && target.hash.includes("refresh_token=")) return target.href;
    if (target.origin !== supabaseOrigin) throw new Error("redirect_target_rejected");
    current = target.href;
  }
  throw new Error("callback_redirect_not_received");
}

async function adminJson(path, init, label) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${label}_${response.status}`);
  return response.json().catch(() => null);
}

async function adminStatus(path, init) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return response?.ok === true;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`missing_${name}`);
  return value;
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function fail(code) {
  console.error(code);
  process.exit(1);
}
