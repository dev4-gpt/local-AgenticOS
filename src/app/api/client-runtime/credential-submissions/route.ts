import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { clientCredentialOption } from "@/lib/clientCredentialCatalog";
import { checkClientRuntimeRateLimit, clientRpc, recordClientAudit } from "@/lib/clientDataPlane";
import { clientCredentialSubmissionEnabled } from "@/lib/clientRuntimePolicy";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { publicCatalogEntryForCredential } from "@/lib/publicProviderCatalog";
import { buildClientActivationManifestProposal } from "@/lib/clientActivationManifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METADATA_ROOT = "http://metadata.google.internal/computeMetadata/v1";

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const rateLimit = await checkClientRuntimeRateLimit("credential-submissions", 5, 3600);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429, headers: { "Retry-After": "3600" } });

  const inboxSecret = process.env.CLIENT_CREDENTIAL_INBOX_SECRET?.trim();
  if (!inboxSecret) return NextResponse.json({ ok: false, error: "credential_inbox_not_configured" }, { status: 503 });
  if (!clientCredentialSubmissionEnabled()) return NextResponse.json({ ok: false, error: "credential_submission_disabled" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const providerKey = typeof body.providerKey === "string" ? body.providerKey.trim().toUpperCase() : "";
  const secretValue = typeof body.secretValue === "string" ? body.secretValue.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1200) : "";
  const catalogId = typeof body.catalogId === "string" ? body.catalogId.trim() : "";
  const option = clientCredentialOption(providerKey);
  const catalogEntry = publicCatalogEntryForCredential(providerKey);

  if (!option || !option.submitAllowed) return NextResponse.json({ ok: false, error: "unsupported_provider" }, { status: 400 });
  if (!catalogEntry || catalogEntry.status !== "client-key" || catalogEntry.selectionAllowed !== true || (catalogId && catalogId !== catalogEntry.id)) {
    return NextResponse.json({ ok: false, error: "catalog_selection_invalid" }, { status: 400 });
  }
  if (secretValue.length < 6 || secretValue.length > 12000) {
    return NextResponse.json({ ok: false, error: "invalid_secret_value" }, { status: 400 });
  }
  if (containsClientSecretLike(notes)) return NextResponse.json({ ok: false, error: "secret_like_notes_rejected" }, { status: 400 });

  const projectId = await gcpProjectId();
  const token = await gcpAccessToken();
  if (!projectId || !token) return NextResponse.json({ ok: false, error: "gcp_identity_unavailable" }, { status: 503 });

  const secretResource = inboxSecret.startsWith("projects/")
    ? inboxSecret
    : `projects/${projectId}/secrets/${inboxSecret}`;
  const payload = {
    source: "client-runtime-credential-submission",
    submittedAt: new Date().toISOString(),
    submittedBy: { id: user.id, email: user.email ?? null },
    client: {
      slug: process.env.CLIENT_SLUG || null,
      name: process.env.CLIENT_NAME || null,
    },
    provider: {
      key: option.key,
      label: option.label,
      category: option.category,
      secret: option.secret,
    },
    catalog: {
      id: catalogEntry.id,
      status: catalogEntry.status,
      pipelineStage: catalogEntry.pipelineStage,
      credentialMode: catalogEntry.credentialMode,
    },
    activationManifest: buildClientActivationManifestProposal({
      tenantSlug: process.env.CLIENT_SLUG || null,
      user: { id: user.id, email: user.email ?? null },
      providerKey: option.key,
      providerLabel: option.label,
      catalog: catalogEntry,
      secretName: option.key,
    }),
    value: secretValue,
    notes,
  };

  const response = await fetch(`https://secretmanager.googleapis.com/v1/${secretResource}:addVersion`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ payload: { data: Buffer.from(JSON.stringify(payload), "utf8").toString("base64") } }),
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) {
    return NextResponse.json({ ok: false, error: "secret_inbox_write_failed" }, { status: 502 });
  }

  const connection = await clientRpc("record_client_provider_connection", {
    p_tenant_slug: process.env.CLIENT_SLUG || "",
    p_catalog_id: catalogEntry.id,
    p_provider_key: option.key,
    p_credential_mode: "byok",
    p_secret_resource: secretResource,
    p_validation_metadata: { status: "submitted-for-review", submittedAt: new Date().toISOString() },
  });
  if (!connection.ok || connection.value !== true) return NextResponse.json({ ok: false, error: "connection_record_failed" }, { status: 502 });

  await recordClientAudit("credential.submitted", { provider: option.key, catalogId: catalogEntry.id, activation: "submitted-for-review" });
  return NextResponse.json({
    ok: true,
    provider: { key: option.key, label: option.label },
    catalog: { id: catalogEntry.id, status: catalogEntry.status, pipelineStage: catalogEntry.pipelineStage },
    activation: { status: "submitted-for-review", tenantSlug: process.env.CLIENT_SLUG || null, providerId: catalogEntry.id, manifestStatus: "proposal-created" },
  }, { headers: { "cache-control": "no-store" } });
}

async function metadataText(path: string) {
  const response = await fetch(`${METADATA_ROOT}/${path}`, {
    headers: { "Metadata-Flavor": "Google" },
    cache: "no-store",
  }).catch(() => null);
  return response?.ok ? response.text() : null;
}

async function gcpProjectId() {
  return process.env.GOOGLE_CLOUD_PROJECT?.trim()
    || process.env.GCLOUD_PROJECT?.trim()
    || (await metadataText("project/project-id"));
}

async function gcpAccessToken() {
  const response = await fetch(`${METADATA_ROOT}/instance/service-accounts/default/token`, {
    headers: { "Metadata-Flavor": "Google" },
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  const token = await response.json().catch(() => null) as { access_token?: unknown } | null;
  return typeof token?.access_token === "string" ? token.access_token : null;
}
