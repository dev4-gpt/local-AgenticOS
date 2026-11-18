import { NextResponse } from "next/server";
import { currentClientCredentialManager, currentClientMember } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, recordClientAudit } from "@/lib/clientDataPlane";
import { clientCredentialOption } from "@/lib/clientCredentialCatalog";
import { readBoundedJsonObject } from "@/lib/clientNetworkSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_REQUEST_BYTES = 4 * 1024;

export async function POST(request: Request) {
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  if (!(await currentClientCredentialManager())) return NextResponse.json({ ok: false, error: "credential_admin_required" }, { status: 403 });

  const rateLimit = await checkClientRuntimeRateLimit("credentials-revoke", 20, 3600);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429, headers: { "Retry-After": "3600" } });

  const parsed = await readBoundedJsonObject(request, MAX_REQUEST_BYTES);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.reason === "too_large" ? "credential_revoke_request_too_large" : "credential_revoke_input_invalid" }, { status: parsed.reason === "too_large" ? 413 : 400 });
  const body = parsed.value;
  const providerKey = typeof body.providerKey === "string" ? body.providerKey.trim().toUpperCase() : "";
  const option = clientCredentialOption(providerKey);
  if (!option) return NextResponse.json({ ok: false, error: "unsupported_provider" }, { status: 400 });

  const tenantSlug = process.env.CLIENT_SLUG || "";
  const result = await clientRpc("revoke_client_provider_connection", { p_tenant_slug: tenantSlug, p_provider_key: option.key });
  if (!result.ok) return NextResponse.json({ ok: false, error: "revoke_request_failed" }, { status: 502 });
  if (result.value !== true) return NextResponse.json({ ok: false, error: "connection_not_found" }, { status: 404 });

  await recordClientAudit("credential.revoked", { provider: option.key });
  return NextResponse.json({ ok: true, provider: { key: option.key, label: option.label } }, { headers: { "cache-control": "no-store" } });
}
