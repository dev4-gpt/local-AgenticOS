import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, recordClientAudit, selectClientRecords } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return jsonError("not_authenticated", 401);
  if (!clientCapabilityEnabled("tenant-data")) return jsonError("capability_not_enabled", 403);
  const rateLimit = await checkClientRuntimeRateLimit("memory-graph-read", 60, 900);
  if (!rateLimit.ok) return jsonError("runtime_limit_unavailable", 503);
  if (!rateLimit.allowed) return jsonError("runtime_rate_limited", 429);
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return jsonError("tenant_not_configured", 503);

  const [nodes, edges] = await Promise.all([
    readGraphPreview("client_runtime_memory_graph_nodes", tenantSlug, "kind.asc,label.asc,id.asc", 500),
    readGraphPreview("client_runtime_memory_graph_edges", tenantSlug, "created_at.asc,id.asc", 2000),
  ]);
  if (!nodes.ok || !edges.ok) return jsonError("memory_graph_read_failed", 502);
  const nodeIds = new Set(nodes.records.map((node) => node.id));
  const visibleEdges = edges.records.filter((edge) => nodeIds.has(edge.source_node_id) && nodeIds.has(edge.target_node_id));
  return NextResponse.json({ ok: true, nodes: nodes.records, edges: visibleEdges, previewLimited: { nodes: nodes.more, edges: edges.more || visibleEdges.length < edges.records.length } }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return jsonError("not_authenticated", 401);
  if (!clientCapabilityEnabled("tenant-data")) return jsonError("capability_not_enabled", 403);
  const rateLimit = await checkClientRuntimeRateLimit("memory-graph-refresh", 10, 900);
  if (!rateLimit.ok) return jsonError("runtime_limit_unavailable", 503);
  if (!rateLimit.allowed) return jsonError("runtime_rate_limited", 429);
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return jsonError("tenant_not_configured", 503);
  const refreshed = await clientRpc("refresh_client_runtime_memory_graph", { p_tenant_slug: tenantSlug });
  if (!refreshed.ok || refreshed.value !== true) return jsonError("memory_graph_refresh_failed", 502);
  await recordClientAudit("tenant.memory.graph_refreshed");
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "private, no-store" } });
}

async function readGraphPreview(table: string, tenantSlug: string, order: string, cap: number) {
  const records: Record<string, unknown>[] = [];
  while (records.length <= cap) {
    const batchSize = Math.min(1000, cap + 1 - records.length);
    const page = await selectClientRecords(table, { tenant_slug: `eq.${tenantSlug}`, order, limit: String(batchSize), offset: String(records.length) });
    if (!page.ok) return { ok: false as const, records: [], more: false };
    if (!page.records.length) break;
    records.push(...page.records);
  }
  return { ok: true as const, records: records.slice(0, cap), more: records.length > cap };
}
