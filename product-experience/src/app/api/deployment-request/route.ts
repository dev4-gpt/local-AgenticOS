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

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
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
      const detail = await res.text().catch(() => "");
      return NextResponse.json({ ok: false, error: "store_failed", detail }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "store_unreachable", detail: String(e) }, { status: 502 });
  }
}
