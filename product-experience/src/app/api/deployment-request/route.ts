import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { allowPublicRequest, payloadTooLarge } from "@/lib/publicRequestGuard";
import { notifyLead } from "@/lib/leadNotification";
import { normalizeCommercialScopeInputs, recommendCommercialScope } from "@/lib/commercialScope";
import { hashSetupToken, publicEmail, requestId as launchRequestId, sendSetupEmail, supabaseServiceInsert, supabaseServiceSelect } from "@/lib/publicLaunch";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const secretLikePattern =
  /(sk-[A-Za-z0-9_-]{20,}|api[_ -]?key\s*[:=]|secret\s*[:=]|password\s*[:=]|token\s*[:=]|bearer\s+[A-Za-z0-9._-]{20,})/i;

const fields = [
  "name",
  "email",
  "company",
  "role",
  "website",
  "workflow",
  "currentTools",
  "dataSources",
  "integrations",
  "credentialModel",
  "providerUsagePreference",
  "providerCreditBudgetUsd",
  "monthlyBudget",
  "approvalRule",
  "seatCount",
  "brandCount",
  "workflowCount",
  "mediaRequirement",
  "supportLevel",
  "managedServiceNeed",
  "retentionDays",
  "preferredSubdomain",
  "timeline",
  "notes",
] as const;

function clean(value: unknown, max = 4_000) {
  return String(value ?? "").trim().slice(0, max);
}

export async function POST(req: Request) {
  if (!(await allowPublicRequest(req, "deployment-request"))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });
  }

  if (payloadTooLarge(req)) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false, error: "invalid_fields" }, { status: 400 });

  const termsAccepted = body.termsAccepted === true;
  const privacyAccepted = body.privacyAccepted === true;
  if (!termsAccepted || !privacyAccepted) return NextResponse.json({ ok: false, error: "consent_required" }, { status: 400 });
  if (fields.some((field) => body[field] != null && typeof body[field] !== "string")) return NextResponse.json({ ok: false, error: "invalid_fields" }, { status: 400 });
  if (fields.some((field) => String(body[field] ?? "").trim().length > 4_000)) return NextResponse.json({ ok: false, error: "field_too_large" }, { status: 413 });
  if (typeof body.email === "string" && body.email.trim().length > 320) return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  if (body.capabilityAreas != null && (!Array.isArray(body.capabilityAreas) || body.capabilityAreas.length > 32 || body.capabilityAreas.some((item) => typeof item !== "string" || item.length > 120))) {
    return NextResponse.json({ ok: false, error: "invalid_fields" }, { status: 400 });
  }
  if (body.idempotencyKey != null && (typeof body.idempotencyKey !== "string" || body.idempotencyKey.trim().length > 180)) return NextResponse.json({ ok: false, error: "invalid_fields" }, { status: 400 });
  const values = Object.fromEntries(fields.map((field) => [field, clean(body[field])]));

  if (process.env.TURNSTILE_SECRET_KEY?.trim()) {
    const captchaToken = clean(body.captchaToken, 2_000);
    if (!captchaToken) return NextResponse.json({ ok: false, error: "captcha_required" }, { status: 400 });
    const captchaResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: captchaToken, remoteip: req.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() }),
    }).catch(() => null);
    const captcha = await captchaResponse?.json().catch(() => null) as { success?: unknown } | null;
    if (!captchaResponse?.ok || captcha?.success !== true) return NextResponse.json({ ok: false, error: "captcha_failed" }, { status: 400 });
  }
  if (!values.name || !values.email || !values.company || !values.workflow) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const email = publicEmail(values.email);
  if (!email) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const combined = fields.map((field) => values[field]).join("\n");
  if (secretLikePattern.test(combined)) {
    return NextResponse.json({ ok: false, error: "secret_like_content" }, { status: 400 });
  }

  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (idempotencyKey) {
    const prior = await supabaseServiceSelect("deployment_requests", { idempotency_key: `eq.${idempotencyKey}` });
    if (!prior.ok) return NextResponse.json({ ok: false, error: "store_failed" }, { status: 502 });
    if (prior.rows[0]?.id) {
      const priorRequest = prior.rows[0];
      if (priorRequest.email !== email || priorRequest.name !== values.name || priorRequest.company !== values.company || priorRequest.workflow !== values.workflow) {
        return NextResponse.json({ ok: false, error: "idempotency_conflict" }, { status: 409 });
      }
      return NextResponse.json({ ok: true, requestId: priorRequest.id, status: "requested", duplicate: true });
    }
  }

  const scopeInputs = normalizeCommercialScopeInputs({
    ...values,
    capabilityAreas: Array.isArray(body.capabilityAreas) ? body.capabilityAreas.map((item) => clean(item, 120)) : [],
    externalActions: body.externalActions === true,
    knowledgeMigration: body.knowledgeMigration === true,
  });
  const scopeRecommendation = recommendCommercialScope(scopeInputs);

  const row = {
    name: values.name,
    email,
    company: values.company,
    role: values.role || null,
    website: values.website || null,
    workflow: values.workflow,
    current_tools: values.currentTools || null,
    data_sources: values.dataSources || null,
    required_integrations: values.integrations || null,
    credential_model: values.credentialModel || "client_owned",
    monthly_budget_cap: values.providerCreditBudgetUsd || values.monthlyBudget || null,
    approval_rule: values.approvalRule || "approve_external_actions",
    preferred_subdomain: values.preferredSubdomain || null,
    timeline: values.timeline || null,
    notes: values.notes || null,
    status: "pending_approval",
    billing_status: "not_started",
    terms_accepted_at: new Date().toISOString(),
    privacy_accepted_at: new Date().toISOString(),
    idempotency_key: idempotencyKey || launchRequestId(),
    source: "product-start",
    scope_inputs: scopeInputs,
    meta: {
      userAgent: req.headers.get("user-agent") ?? null,
      receivedAt: new Date().toISOString(),
      commercialScopeVersion: scopeRecommendation.version,
    },
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/deployment_requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });

    if (!res.ok) {
      console.error("deployment request store failed", { status: res.status });
      return NextResponse.json({ ok: false, error: "store_failed" }, { status: 502 });
    }

    const stored = await res.json().catch(() => []) as Array<{ id?: unknown }>;
    const requestId = typeof stored[0]?.id === "string" ? stored[0].id : null;
    if (!requestId) return NextResponse.json({ ok: false, error: "store_failed" }, { status: 502 });

    const onboarding = await supabaseServiceInsert("client_onboarding_accounts", {
      request_id: requestId,
      email,
      status: "requested",
      commercial_scope_status: "recommended",
      commercial_scope_inputs: scopeInputs,
      commercial_scope_recommendation: scopeRecommendation,
    });
    const onboardingId = typeof onboarding.rows[0]?.id === "string" ? onboarding.rows[0].id : null;
    if (!onboarding.ok || !onboardingId) {
      console.error("onboarding account store failed", { status: onboarding.status, requestId });
      return NextResponse.json({ ok: false, error: "onboarding_store_failed", requestId }, { status: 502 });
    }

    const rawToken = randomBytes(32).toString("base64url");
    const token = await supabaseServiceInsert("client_onboarding_tokens", {
      onboarding_id: onboardingId,
      token_hash: hashSetupToken(rawToken),
      purpose: "verify-email",
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });
    const emailDelivery = token.ok ? await sendSetupEmail({ email, name: values.name, token: rawToken, kind: "verify" }) : "failed";
    await notifyLead({
      kind: "runtime request",
      name: values.name,
      email,
      company: values.company,
      source: "product-start",
    });
    return NextResponse.json({ ok: true, requestId, onboardingId, status: "requested", emailDelivery, checkoutRequired: false, message: "Verify your email to continue. Payment and activation happen after review; no runtime is created by signup alone." });
  } catch (e) {
    console.error("deployment request store unreachable", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ ok: false, error: "store_unreachable" }, { status: 502 });
  }
}
