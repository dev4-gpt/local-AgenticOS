import { NextResponse } from "next/server";
import { adapterJsonError, adapterRouteGate, NO_STORE, readJsonObject } from "@/lib/adapterRouteGate";
import { SYNC_MODES, SYNC_SWITCH_HTTP_STATUS, parseSyncSwitchStatus, syncSwitchErrorFrom, type SyncSwitchErrorCode } from "@/lib/adapterSyncSwitch";
import { currentClientCredentialManager } from "@/lib/clientAuth";
import { clientRpc, recordClientAudit, selectClientRecords } from "@/lib/clientDataPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADAPTER_ID = /^[a-z][a-z0-9-]{2,40}$/;
const MAX_BODY_BYTES = 1024;
const MAX_ADAPTERS = 25;

const fail = (code: SyncSwitchErrorCode) => adapterJsonError(code, SYNC_SWITCH_HTTP_STATUS[code]);

// Where the sync switch stands for each adapter this client has (ADR-019). Any active member can read it; the database
// answers only members of this tenant, and the tenant comes from the server's setting, never from the request.
export async function GET() {
  const gate = await adapterRouteGate("adapter-sync-switch-read", 60);
  if (!gate.ok) return gate.response;
  const registry = await selectClientRecords("client_adapter_registry", {
    tenant_slug: `eq.${gate.tenantSlug}`, select: "adapter_id,state", order: "adapter_id.asc", limit: String(MAX_ADAPTERS),
  });
  if (!registry.ok) return fail("unavailable");
  const adapters = [];
  for (const row of registry.records) {
    if (typeof row.adapter_id !== "string" || !ADAPTER_ID.test(row.adapter_id)) continue;
    const result = await clientRpc("client_adapter_sync_switch_status", { p_tenant_slug: gate.tenantSlug, p_adapter_id: row.adapter_id });
    const status = result.ok ? parseSyncSwitchStatus(result.value) : null;
    if (!status) return fail("unavailable");
    adapters.push({ adapterId: row.adapter_id, enabled: row.state === "enabled", status });
  }
  // Only a hint for which buttons to show: the database function refuses anyone who is not an owner or admin.
  const canChange = await currentClientCredentialManager();
  return NextResponse.json({ ok: true, canChange, adapters }, { headers: NO_STORE });
}

// Turn the switch off or on for 1, 4 or 24 hours (or always, if the operator has allowed it), or ask for one sync now.
// Who is acting is whoever is signed in; no field in the body can name another person.
export async function POST(request: Request) {
  const gate = await adapterRouteGate("adapter-sync-switch-change", 30);
  if (!gate.ok) return gate.response;
  const body = await readJsonObject(request, MAX_BODY_BYTES);
  if (!body) return fail("invalid_input");
  const { adapterId, action, mode } = body;
  if (typeof adapterId !== "string" || !ADAPTER_ID.test(adapterId)) return fail("invalid_input");

  if (action === "sync_now") {
    if (mode !== undefined) return fail("invalid_input");
    const result = await clientRpc("client_adapter_sync_switch_request_now", { p_tenant_slug: gate.tenantSlug, p_adapter_id: adapterId });
    if (!result.ok || result.value !== true) return fail(syncSwitchErrorFrom(result));
    await recordClientAudit("tenant.adapter.sync_now_requested", { adapter_id: adapterId });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  if (action === "set") {
    if (typeof mode !== "string" || !(SYNC_MODES as readonly string[]).includes(mode)) return fail("invalid_input");
    const result = await clientRpc("client_adapter_sync_switch_set", { p_tenant_slug: gate.tenantSlug, p_adapter_id: adapterId, p_mode: mode });
    if (!result.ok || (result.value !== "off" && result.value !== "timed" && result.value !== "always")) return fail(syncSwitchErrorFrom(result));
    await recordClientAudit("tenant.adapter.sync_switch_set", { adapter_id: adapterId, mode });
    return NextResponse.json({ ok: true, mode: result.value }, { headers: NO_STORE });
  }
  return fail("invalid_input");
}
