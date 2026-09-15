import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type OnboardingStatus =
  | "requested"
  | "email_verified"
  | "payment_pending"
  | "payment_succeeded"
  | "manifest_review"
  | "provisioning"
  | "smoke_testing"
  | "active"
  | "provision_failed"
  | "rollback_required"
  | "suspended"
  | "offboarding"
  | "offboarded";

export const PUBLIC_ONBOARDING_STATUSES: readonly OnboardingStatus[] = [
  "requested", "email_verified", "payment_pending", "payment_succeeded", "manifest_review",
  "provisioning", "smoke_testing", "active", "provision_failed", "rollback_required",
  "suspended", "offboarding", "offboarded",
];

export function publicLaunchConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && serviceKey ? { url, serviceKey } : null;
}

export function requestId() {
  return crypto.randomUUID();
}

export function cleanPublicText(value: unknown, max = 4_000) {
  return String(value ?? "").trim().slice(0, max);
}

export function publicEmail(value: unknown) {
  const email = cleanPublicText(value, 320).toLowerCase();
  return /^\S+@\S+\.\S+$/.test(email) ? email : null;
}

export function serviceHeaders(config: { serviceKey: string }) {
  return { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, "Content-Type": "application/json" };
}

export async function supabaseServiceInsert(table: string, record: Record<string, unknown> | Record<string, unknown>[]) {
  const config = publicLaunchConfig();
  if (!config) return { ok: false, status: 503, rows: [] as Record<string, unknown>[] };
  const response = await fetch(`${config.url}/rest/v1/${table}`, {
    method: "POST", headers: { ...serviceHeaders(config), Prefer: "return=representation" }, body: JSON.stringify(record), cache: "no-store",
  }).catch(() => null);
  const rows = await response?.json().catch(() => []) as Record<string, unknown>[];
  return { ok: response?.ok === true, status: response?.status ?? 503, rows: Array.isArray(rows) ? rows : [] };
}

export async function supabaseServiceUpsert(table: string, record: Record<string, unknown>, onConflict: string) {
  const config = publicLaunchConfig();
  if (!config) return { ok: false, status: 503, rows: [] as Record<string, unknown>[] };
  const query = new URLSearchParams({ on_conflict: onConflict });
  const response = await fetch(`${config.url}/rest/v1/${table}?${query.toString()}`, {
    method: "POST",
    headers: { ...serviceHeaders(config), Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(record),
    cache: "no-store",
  }).catch(() => null);
  const rows = await response?.json().catch(() => []) as Record<string, unknown>[];
  return { ok: response?.ok === true, status: response?.status ?? 503, rows: Array.isArray(rows) ? rows : [] };
}

export async function supabaseServiceUpdate(table: string, filters: Record<string, string>, record: Record<string, unknown>) {
  const config = publicLaunchConfig();
  if (!config) return { ok: false, status: 503, rows: [] as Record<string, unknown>[] };
  const query = new URLSearchParams(filters);
  const response = await fetch(`${config.url}/rest/v1/${table}?${query.toString()}`, {
    method: "PATCH", headers: { ...serviceHeaders(config), Prefer: "return=representation" }, body: JSON.stringify(record), cache: "no-store",
  }).catch(() => null);
  const rows = await response?.json().catch(() => []) as Record<string, unknown>[];
  return { ok: response?.ok === true, status: response?.status ?? 503, rows: Array.isArray(rows) ? rows : [] };
}

export async function supabaseServiceSelect(table: string, filters: Record<string, string>) {
  const config = publicLaunchConfig();
  if (!config) return { ok: false, status: 503, rows: [] as Record<string, unknown>[] };
  const query = new URLSearchParams({ select: "*", ...filters });
  const response = await fetch(`${config.url}/rest/v1/${table}?${query.toString()}`, { headers: serviceHeaders(config), cache: "no-store" }).catch(() => null);
  const rows = await response?.json().catch(() => []) as Record<string, unknown>[];
  return { ok: response?.ok === true, status: response?.status ?? 503, rows: Array.isArray(rows) ? rows : [] };
}

export async function supabaseServiceRpc(functionName: string, body: Record<string, unknown>) {
  const config = publicLaunchConfig();
  if (!config) return { ok: false, status: 503, value: null as unknown };
  const response = await fetch(`${config.url}/rest/v1/rpc/${functionName}`, { method: "POST", headers: serviceHeaders(config), body: JSON.stringify(body), cache: "no-store" }).catch(() => null);
  return { ok: response?.ok === true, status: response?.status ?? 503, value: await response?.json().catch(() => null) };
}

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_SETUP_PRICE_ID?.trim() && process.env.STRIPE_PLATFORM_PRICE_ID?.trim());
}

export function stripeSecretConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

// This is deliberately separate from the public production price settings.
// It can only be enabled with a Stripe test secret key and is capped to a
// small, disposable acceptance fixture. A live key always disables it.
export function stripeTestFixtureConfig() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim() || "";
  if (process.env.STRIPE_MODE?.trim() !== "test" || process.env.STRIPE_TEST_FIXTURE_ENABLED?.trim() !== "1" || !secret.startsWith("sk_test_")) return null;
  const setupCents = fixtureCents(process.env.STRIPE_TEST_FIXTURE_SETUP_CENTS, 50);
  const monthlyCents = fixtureCents(process.env.STRIPE_TEST_FIXTURE_MONTHLY_CENTS, 50);
  if (setupCents === null || monthlyCents === null) return null;
  return { setupCents, monthlyCents, initialTotalCents: setupCents + monthlyCents };
}

function fixtureCents(value: string | undefined, fallback: number) {
  const cents = value == null || value.trim() === "" ? fallback : Number(value);
  return Number.isSafeInteger(cents) && cents >= 50 && cents <= 500 ? cents : null;
}

export async function stripeRequest(path: string, body: Record<string, string | number | string[]>) {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) return { ok: false, status: 503, value: null as Record<string, unknown> | null };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else params.set(key, String(value));
  }
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params, cache: "no-store",
  }).catch(() => null);
  return { ok: response?.ok === true, status: response?.status ?? 503, value: await response?.json().catch(() => null) as Record<string, unknown> | null };
}

export function verifyStripeSignature(payload: string, header: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !header) return false;
  const parts = new Map(header.split(",").map((part) => part.split("=", 2) as [string, string]));
  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(signature)); } catch { return false; }
}

export function safePublicError(error: unknown) {
  if (error instanceof Error) console.error("public launch request failed", error.message);
  return { ok: false, error: "request_failed" };
}

export function hashSetupToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function sendSetupEmail(input: { email: string; name: string; token: string; kind: "verify" | "setup" }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PUBLIC_EMAIL_FROM?.trim() || process.env.LEAD_NOTIFICATION_FROM?.trim();
  const appUrl = (process.env.PUBLIC_APP_URL?.trim() || "https://app.veloceos.cloud").replace(/\/$/, "");
  if (!apiKey || !from) return "not_configured" as const;
  const path = input.kind === "verify" ? "/verify" : "/setup";
  // A distinct subject prevents mail clients from grouping a new one-time
  // link under an earlier, intentionally invalidated message.
  const issuedAt = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const subject = input.kind === "verify"
    ? `Verify your Veloce AgenticOS request (${issuedAt})`
    : `Your Veloce AgenticOS setup link (${issuedAt})`;
  const link = `${appUrl}${path}?token=${encodeURIComponent(input.token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(5_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.email], subject, text: `Hi ${input.name},\n\nContinue your Veloce AgenticOS setup here:\n${link}\n\nThis link is single-use. Never share provider keys in email.`, }),
  }).catch(() => null);
  return response?.ok ? "sent" as const : "failed" as const;
}

export async function sendSupportAcknowledgement(email: string, supportId: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PUBLIC_EMAIL_FROM?.trim() || process.env.LEAD_NOTIFICATION_FROM?.trim();
  if (!apiKey || !from) return "not_configured" as const;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(5_000), headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [email], subject: `Veloce support request ${supportId.slice(0, 8)}`, text: `Your Veloce support request ${supportId} was received. Please keep this ID for follow-up. Do not reply with passwords or API keys.` }) }).catch(() => null);
  return response?.ok ? "sent" as const : "failed" as const;
}

export async function sendManagedCreditSpendAlertEmail(input: { email: string; tenantSlug: string; currentSpendMicros: number; thresholdMicros: number }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PUBLIC_EMAIL_FROM?.trim() || process.env.LEAD_NOTIFICATION_FROM?.trim();
  if (!apiKey || !from) return "not_configured" as const;
  const currentSpend = (input.currentSpendMicros / 1_000_000).toFixed(2);
  const threshold = (input.thresholdMicros / 1_000_000).toFixed(2);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(5_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.email], subject: `Veloce managed-credit spend alert for ${input.tenantSlug}`, text: `Your Veloce AgenticOS tenant "${input.tenantSlug}" has spent $${currentSpend} in managed credit this month, crossing your configured alert threshold of $${threshold}. This is informational only; no action is required. No provider credentials or account secrets are included in this email.` }),
  }).catch(() => null);
  return response?.ok ? "sent" as const : "failed" as const;
}
