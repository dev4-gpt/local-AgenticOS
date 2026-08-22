import { NextResponse } from "next/server";
import { currentClientMember } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, recordClientAudit } from "@/lib/clientDataPlane";
import { publicCatalogEntryById } from "@/lib/publicProviderCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responseForRpc(result: { ok: boolean; status: number; value: unknown }) {
  if (!result.ok) return NextResponse.json({ ok: false, error: result.status === 401 ? "not_authenticated" : "manifest_proposal_failed" }, { status: result.status >= 400 ? result.status : 502 });
  return NextResponse.json({ ok: true, proposals: Array.isArray(result.value) ? result.value : result.value ? [result.value] : [] }, { headers: { "cache-control": "no-store" } });
}

export async function GET() {
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  const limit = await checkClientRuntimeRateLimit("manifest-proposals-read", 60, 900);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });
  return responseForRpc(await clientRpc("list_client_manifest_proposals", { p_tenant_slug: process.env.CLIENT_SLUG || "" }));
}

export async function POST(request: Request) {
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  const limit = await checkClientRuntimeRateLimit("manifest-proposals-write", 10, 3600);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429, headers: { "Retry-After": "3600" } });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const catalogIds = Array.isArray(body.catalogIds) ? body.catalogIds.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean).slice(0, 100) : [];
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim().slice(0, 120) : `matrix-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const rawModes = body.credentialModes && typeof body.credentialModes === "object" && !Array.isArray(body.credentialModes) ? body.credentialModes as Record<string, unknown> : {};
  const credentialModes: Record<string, "byok" | "veloce-managed" | "none"> = {};
  const entries = catalogIds.map((id) => publicCatalogEntryById(id));
  if (!catalogIds.length || entries.some((entry) => !entry || entry.selectionAllowed === false || entry.status === "operator-only" || entry.status === "reference-only")) {
    return NextResponse.json({ ok: false, error: "catalog_selection_invalid" }, { status: 400 });
  }
  for (const id of catalogIds) {
    const mode = rawModes[id];
    credentialModes[id] = mode === "veloce-managed" || mode === "none" ? mode : "byok";
  }
  const providerKeys = entries.flatMap((entry) => entry?.credentialKey ? [entry.credentialKey] : []);
  const pricingSnapshotIds = entries.flatMap((entry) => entry?.pricingSnapshotId ? [entry.pricingSnapshotId] : []);
  const result = await clientRpc("create_client_manifest_proposal", {
    p_tenant_slug: process.env.CLIENT_SLUG || "",
    p_catalog_ids: catalogIds,
    p_provider_keys: providerKeys,
    p_pricing_snapshot_ids: pricingSnapshotIds,
    p_credential_modes: credentialModes,
    p_idempotency_key: idempotencyKey,
  });
  if (result.ok && result.value) {
    await recordClientAudit("manifest.proposal.submitted", { proposalId: result.value, catalogIds, providerKeys, credentialModes });
    return NextResponse.json({ ok: true, proposalId: result.value, status: "submitted", catalogIds, providerKeys }, { headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ ok: false, error: result.status === 401 ? "not_authenticated" : "manifest_proposal_failed" }, { status: result.status >= 400 ? result.status : 502 });
}
