import { NextResponse } from "next/server";
import { adapterJsonError, adapterRouteGate, NO_STORE } from "@/lib/adapterRouteGate";
import { currentClientCredentialManager } from "@/lib/clientAuth";
import { selectClientRecords } from "@/lib/clientDataPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const LIMIT = 100;

type Row = Record<string, unknown>;
const unique = (values: unknown[], test: RegExp): string[] => [...new Set(values.filter((v): v is string => typeof v === "string" && test.test(v)))];

// Read-only. What each person can see is decided by the database's row-level security: owners and admins see every
// promotion and the private note behind it; the person who asked sees only their own promotion and not the private
// note. Nothing here widens that. The tenant comes from the server's setting, never from the request.
export async function GET() {
  const gate = await adapterRouteGate("adapter-promotion-read", 60);
  if (!gate.ok) return gate.response;
  const base = { tenant_slug: `eq.${gate.tenantSlug}` };

  const promotions = await selectClientRecords("client_adapter_memory_promotions", {
    ...base,
    select: "id,source_item_id,origin_adapter_id,content_sha256,status,scan_result,requested_by,requested_by_adapter,reviewed_by,reviewed_at,decision_note,approved_sensitivity,created_at",
    order: "created_at.desc,id.asc",
    limit: String(LIMIT),
  });
  if (!promotions.ok) return adapterJsonError("unavailable", 502);

  const sourceIds = unique(promotions.records.map((r) => r.source_item_id), UUID);
  const hashes = unique(promotions.records.map((r) => r.content_sha256), SHA256);
  const none = { ok: true, records: [] as Row[] };
  const [sources, provenance, alreadyShared, sharedNotes] = await Promise.all([
    sourceIds.length
      ? selectClientRecords("client_adapter_memory_items", { ...base, id: `in.(${sourceIds.join(",")})`, select: "id,content,status", limit: String(LIMIT) })
      : none,
    sourceIds.length
      ? selectClientRecords("client_adapter_memory_provenance", {
          ...base, item_id: `in.(${sourceIds.join(",")})`, limit: String(LIMIT * 2),
          select: "item_id,adapter_id,adapter_version,agent_principal,source_task_id,source_url,source_sha256,confidence,created_at",
        })
      : none,
    hashes.length
      ? selectClientRecords("client_adapter_memory_items", { ...base, namespace: "eq.shared", status: "eq.active", content_sha256: `in.(${hashes.join(",")})`, select: "id,content_sha256", limit: String(LIMIT) })
      : none,
    selectClientRecords("client_adapter_memory_items", {
      ...base, namespace: "eq.shared", status: "eq.active", order: "created_at.desc,id.asc", limit: String(LIMIT),
      select: "id,origin_adapter_id,content,content_sha256,promotion_id,sensitivity,created_at",
    }),
  ]);
  if (![sources, provenance, alreadyShared, sharedNotes].every((r) => r.ok)) return adapterJsonError("unavailable", 502);

  const contentById = new Map(sources.records.map((r) => [r.id, typeof r.content === "string" ? r.content : null]));
  const sharedByHash = new Map(alreadyShared.records.map((r) => [r.content_sha256, r.id]));
  const provenanceByItem = new Map<unknown, Row[]>();
  for (const row of provenance.records) provenanceByItem.set(row.item_id, [...(provenanceByItem.get(row.item_id) ?? []), row]);

  const canDecide = await currentClientCredentialManager();
  return NextResponse.json({
    ok: true,
    viewerId: gate.userId,
    canDecide,
    promotions: promotions.records.map((row) => ({
      ...row,
      // Only owners and admins can read the private note; for anyone else this is null, not an empty string.
      source_content: contentById.get(row.source_item_id) ?? null,
      provenance: provenanceByItem.get(row.source_item_id) ?? [],
      already_shared_item_id: sharedByHash.get(row.content_sha256) ?? null,
    })),
    sharedNotes: sharedNotes.records,
  }, { headers: NO_STORE });
}
