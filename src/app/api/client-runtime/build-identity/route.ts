import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { CLIENT_RUNTIME_CONFIG_KEYS, clientRuntimeConfigDigest, clientTenantScopeDigest } from "@/lib/clientRuntimeConfigDigest.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401, headers: { "cache-control": "private, no-store" } });
  }

  const sourceCommit = process.env.VELOCE_BUILD_SOURCE_COMMIT?.trim() ?? "";
  const revision = process.env.K_REVISION?.trim() ?? "";
  const tenantScopeDigest = getTenantScopeDigest();
  const runtimeConfigDigest = getRuntimeConfigDigest();
  return NextResponse.json({
    ok: true,
    sourceCommit: /^[0-9a-f]{40}$/i.test(sourceCommit) ? sourceCommit.toLowerCase() : null,
    cloudRunRevision: /^[a-z][a-z0-9-]{0,126}$/.test(revision) ? revision : null,
    tenantScopeDigest,
    runtimeConfigDigest,
    provenance: "reported_by_runtime_not_independent_attestation",
  }, { headers: { "cache-control": "private, no-store" } });
}

function getRuntimeConfigDigest() {
  return clientRuntimeConfigDigest(Object.fromEntries(CLIENT_RUNTIME_CONFIG_KEYS.map((key) => [key, process.env[key]])));
}

function getTenantScopeDigest() {
  return clientTenantScopeDigest(process.env.SUPABASE_URL, process.env.CLIENT_SLUG);
}
