import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";

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
  return NextResponse.json({
    ok: true,
    sourceCommit: /^[0-9a-f]{40}$/i.test(sourceCommit) ? sourceCommit.toLowerCase() : null,
    cloudRunRevision: /^[a-z][a-z0-9-]{0,126}$/.test(revision) ? revision : null,
    tenantScopeDigest,
    provenance: "reported_by_runtime_not_independent_attestation",
  }, { headers: { "cache-control": "private, no-store" } });
}

function getTenantScopeDigest() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!supabaseUrl || !tenantSlug) return null;
  try {
    const endpoint = new URL(supabaseUrl);
    const projectEndpoint = `${endpoint.origin.toLowerCase()}${endpoint.pathname.replace(/\/+$/, "")}`;
    if (!projectEndpoint) return null;
    return createHash("sha256").update(`${projectEndpoint}\n${tenantSlug}`).digest("hex");
  } catch {
    return null;
  }
}
