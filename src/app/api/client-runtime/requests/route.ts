import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { currentClientUser } from "@/lib/clientAuth";
import { insertClientRecord, recordClientAudit } from "@/lib/clientDataPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METADATA_ROOT = "http://metadata.google.internal/computeMetadata/v1";
const REQUEST_TYPES = new Set(["command", "context", "orchestrate", "create", "deliver"]);

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const inboxSecret = (process.env.CLIENT_REQUEST_INBOX_SECRET || process.env.CLIENT_CREDENTIAL_INBOX_SECRET)?.trim();
  if (!inboxSecret) return NextResponse.json({ ok: false, error: "request_inbox_not_configured" }, { status: 503 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const type = typeof body.type === "string" ? body.type.trim().toLowerCase() : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 180) : "";
  const details = typeof body.details === "string" ? body.details.trim().slice(0, 10000) : "";
  const fields = body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? body.fields : {};

  if (!REQUEST_TYPES.has(type)) return NextResponse.json({ ok: false, error: "invalid_request_type" }, { status: 400 });
  if (title.length < 3 || details.length < 10) return NextResponse.json({ ok: false, error: "request_needs_detail" }, { status: 400 });

  if (process.env.CLIENT_RUNTIME_DATA_MODE === "supabase") {
    const result = await insertClientRecord("client_runtime_requests", {
      tenant_slug: process.env.CLIENT_SLUG || null,
      submitted_by: user.id,
      request_type: type,
      title,
      details,
      fields,
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: "request_store_failed" }, { status: result.status >= 400 ? 502 : 503 });
    await recordClientAudit("request.submitted", { requestType: type });
    return NextResponse.json({ ok: true, requestType: type }, { headers: { "cache-control": "no-store" } });
  }

  const projectId = await gcpProjectId();
  const token = await gcpAccessToken();
  if (!projectId || !token) return NextResponse.json({ ok: false, error: "gcp_identity_unavailable" }, { status: 503 });

  const secretResource = inboxSecret.startsWith("projects/")
    ? inboxSecret
    : `projects/${projectId}/secrets/${inboxSecret}`;
  const payload = {
    source: "client-runtime-request",
    submittedAt: new Date().toISOString(),
    submittedBy: { id: user.id, email: user.email ?? null },
    client: { slug: process.env.CLIENT_SLUG || null, name: process.env.CLIENT_NAME || null },
    request: { type, title, details, fields },
  };

  const response = await fetch(`https://secretmanager.googleapis.com/v1/${secretResource}:addVersion`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ payload: { data: Buffer.from(JSON.stringify(payload), "utf8").toString("base64") } }),
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) return NextResponse.json({ ok: false, error: "request_inbox_write_failed" }, { status: 502 });
  await recordClientAudit("request.submitted", { requestType: type, storage: "secret-manager-inbox" });
  return NextResponse.json({ ok: true, requestType: type }, { headers: { "cache-control": "no-store" } });
}

async function metadataText(path: string) {
  const response = await fetch(`${METADATA_ROOT}/${path}`, { headers: { "Metadata-Flavor": "Google" }, cache: "no-store" }).catch(() => null);
  return response?.ok ? response.text() : null;
}

async function gcpProjectId() {
  return process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GCLOUD_PROJECT?.trim() || (await metadataText("project/project-id"));
}

async function gcpAccessToken() {
  const response = await fetch(`${METADATA_ROOT}/instance/service-accounts/default/token`, { headers: { "Metadata-Flavor": "Google" }, cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  const token = await response.json().catch(() => null) as { access_token?: unknown } | null;
  return typeof token?.access_token === "string" ? token.access_token : null;
}
