import { NextResponse } from "next/server";

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
  "monthlyBudget",
  "approvalRule",
  "preferredSubdomain",
  "timeline",
  "notes",
] as const;

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 5;
const MAX_BODY_BYTES = 100_000;
const requestAttempts = new Map<string, number[]>();

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function clientKey(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

function rateLimit(req: Request) {
  const key = clientKey(req);
  const now = Date.now();
  const recent = (requestAttempts.get(key) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    requestAttempts.set(key, recent);
    return false;
  }
  requestAttempts.set(key, [...recent, now]);
  return true;
}

export async function POST(req: Request) {
  if (!rateLimit(req)) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(RATE_WINDOW_MS / 1000)) } },
    );
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
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

  const values = Object.fromEntries(fields.map((field) => [field, clean(body[field])]));
  if (!values.name || !values.email || !values.company || !values.workflow) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  if (!/^\S+@\S+\.\S+$/.test(values.email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  if (fields.some((field) => values[field].length > 4_000)) {
    return NextResponse.json({ ok: false, error: "field_too_large" }, { status: 413 });
  }

  const combined = fields.map((field) => values[field]).join("\n");
  if (secretLikePattern.test(combined)) {
    return NextResponse.json({ ok: false, error: "secret_like_content" }, { status: 400 });
  }

  const row = {
    name: values.name,
    email: values.email,
    company: values.company,
    role: values.role || null,
    website: values.website || null,
    workflow: values.workflow,
    current_tools: values.currentTools || null,
    data_sources: values.dataSources || null,
    required_integrations: values.integrations || null,
    credential_model: values.credentialModel || "client_owned",
    monthly_budget_cap: values.monthlyBudget || null,
    approval_rule: values.approvalRule || "approve_external_actions",
    preferred_subdomain: values.preferredSubdomain || null,
    timeline: values.timeline || null,
    notes: values.notes || null,
    status: "pending_approval",
    source: "product-start",
    meta: {
      userAgent: req.headers.get("user-agent") ?? null,
      receivedAt: new Date().toISOString(),
    },
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/deployment_requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });

    if (!res.ok) {
      console.error("deployment request store failed", { status: res.status });
      return NextResponse.json({ ok: false, error: "store_failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("deployment request store unreachable", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ ok: false, error: "store_unreachable" }, { status: 502 });
  }
}
