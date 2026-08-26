import { NextResponse } from "next/server";
import { cloudRunIdTokenFromVercel } from "@/lib/cloudRunOidc";
import { createOpenRouterManagedAdapter, createSupabaseManagedCreditLedger } from "@/lib/managedProviderRuntime";
import { evaluateManagedProviderReadiness, type ManagedProviderOperation } from "@/lib/managedProviderReadiness";
import { publicLaunchConfig, supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATALOG_ID = "provider-openrouter_api_key";
const PROVIDER_KEY = "openrouter";

/**
 * Private managed-provider boundary. This route is deliberately separate from
 * the client runtime: it requires the control-plane secret, service-role
 * ledger access, and a database readiness row before it can call OpenRouter.
 */
export async function POST(request: Request) {
  const operatorSecret = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";
  if (!authorized(request, operatorSecret)) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const config = publicLaunchConfig();
  const secretResource = process.env.OPENROUTER_MANAGED_SECRET_RESOURCE?.trim() || "";
  const gatewayUrl = process.env.OPENROUTER_MANAGED_GATEWAY_URL?.trim().replace(/\/$/, "") || "";
  if (!config || !secretResource || !gatewayUrl) return NextResponse.json({ ok: false, error: "managed_provider_not_configured" }, { status: 503 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const operation = typeof body.operation === "string" ? body.operation.trim() : "";
  const tenantSlug = typeof body.tenantSlug === "string" ? body.tenantSlug.trim() : "";
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : null;
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : null;
  if (!tenantSlug || !/^[-a-z0-9]{2,120}$/.test(tenantSlug) || !["quote", "healthCheck", "reserve", "execute", "settle", "refund", "balance", "disable", "restore", "videoModels", "videoStatus"].includes(operation)) {
    return NextResponse.json({ ok: false, error: "managed_provider_payload_invalid" }, { status: 400 });
  }
  if (!["quote", "healthCheck", "balance", "disable", "restore"].includes(operation) && !idempotencyKey) return NextResponse.json({ ok: false, error: "idempotency_required" }, { status: 400 });

  const readiness = await managedReadiness(tenantSlug, operation as ManagedProviderOperation);
  if (!readiness.ok) return NextResponse.json({ ok: false, error: readiness.error }, { status: readiness.status });
  const requiresGateway = ["healthCheck", "balance", "reserve", "execute", "videoModels", "videoStatus"].includes(operation);
  if (requiresGateway && readiness.credentialReference !== secretResource) {
    return NextResponse.json({ ok: false, error: "managed_provider_credential_reference_invalid" }, { status: 409 });
  }
  let gatewayIdentity: { token: string } | null = null;
  if (requiresGateway) {
    try {
      const minted = await cloudRunIdTokenFromVercel(request, gatewayUrl);
      if (!minted.ok) return NextResponse.json({ ok: false, error: "managed_provider_gateway_unavailable" }, { status: 503 });
      gatewayIdentity = minted;
    } catch {
      return NextResponse.json({ ok: false, error: "managed_provider_gateway_unavailable" }, { status: 503 });
    }
  }
  const context = {
    tenantSlug,
    catalogId: CATALOG_ID,
    providerKey: PROVIDER_KEY,
    credentialReference: readiness.credentialReference,
    manifestVersion: readiness.manifestVersion,
    pricingSnapshotId: readiness.pricingSnapshotId,
    requestId,
    idempotencyKey,
  } as const;
  const adapter = createOpenRouterManagedAdapter({
    ledger: createSupabaseManagedCreditLedger({ url: config.url, serviceRoleKey: config.serviceKey }),
    callProvider: gatewayIdentity ? (_context, path, init) => callManagedGateway(gatewayUrl, gatewayIdentity.token, operatorSecret, path, init) : undefined,
    pricingSnapshotId: readiness.pricingSnapshotId ?? undefined,
    pricing: managedPricing(),
  });

  try {
    // These operations only read OpenRouter metadata/job state. They are
    // intentionally available before managed generation is enabled so the
    // control plane can validate live capabilities and pricing before a
    // billable POST /videos request is ever allowed.
    if (operation === "videoModels") return managedGatewayJson(gatewayUrl, gatewayIdentity?.token, operatorSecret, "/videos/models");
    if (operation === "videoStatus") {
      const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) return NextResponse.json({ ok: false, error: "managed_video_job_invalid" }, { status: 400 });
      return managedGatewayJson(gatewayUrl, gatewayIdentity?.token, operatorSecret, `/videos/${jobId}`);
    }
    if (operation === "quote") return NextResponse.json({ ok: true, quote: await adapter.quote(context, objectInput(body.input)) });
    if (operation === "healthCheck") return NextResponse.json({ ok: true, health: await adapter.healthCheck(context) });
    if (operation === "balance") return NextResponse.json({ ok: true, balance: await adapter.balance(context) });
    if (operation === "disable") {
      await adapter.disable(context, typeof body.reason === "string" ? body.reason : "operator_disabled");
      const updated = await supabaseServiceUpdate("client_credit_budgets", { tenant_slug: `eq.${tenantSlug}`, catalog_id: `eq.${CATALOG_ID}`, provider_key: `eq.${PROVIDER_KEY}` }, {
        managed_route_enabled: false,
        funding_status: "provider_not_enabled",
        health_status: "disabled",
        updated_at: new Date().toISOString(),
      });
      if (!updated.ok) return NextResponse.json({ ok: false, error: "managed_provider_disable_persist_failed" }, { status: 502 });
      return NextResponse.json({ ok: true, status: "disabled" });
    }
    if (operation === "restore") {
      const updated = await supabaseServiceUpdate("client_credit_budgets", { tenant_slug: `eq.${tenantSlug}`, catalog_id: `eq.${CATALOG_ID}`, provider_key: `eq.${PROVIDER_KEY}` }, {
        managed_route_enabled: true,
        funding_status: "wallet_funded",
        health_status: "not_checked",
        updated_at: new Date().toISOString(),
      });
      if (!updated.ok) return NextResponse.json({ ok: false, error: "managed_provider_restore_failed" }, { status: 502 });
      return NextResponse.json({ ok: true, status: "restore_requires_health_check" });
    }
    if (operation === "reserve") {
      const balance = await adapter.balance(context);
      if (balance.availableMicros <= 0) return NextResponse.json({ ok: false, error: "managed_provider_account_depleted" }, { status: 409 });
      const quote = await adapter.quote(context, objectInput(body.input));
      return NextResponse.json({ ok: true, quote, reservation: await adapter.reserve(context, quote) });
    }
    const reservation = reservationInput(body.reservation);
    if (!reservation) return NextResponse.json({ ok: false, error: "reservation_invalid" }, { status: 400 });
    if (operation === "execute") {
      try {
        const usage = await adapter.execute(context, reservation, objectInput(body.input));
        return NextResponse.json({ ok: true, usage });
      } catch (error) {
        await adapter.refund(context, reservation, error instanceof Error ? error.message : "managed_provider_failed").catch(() => undefined);
        throw error;
      }
    }
    if (operation === "settle") {
      const usage = usageInput(body.usage);
      if (!usage) return NextResponse.json({ ok: false, error: "usage_invalid" }, { status: 400 });
      await adapter.settle(context, reservation, usage);
      return NextResponse.json({ ok: true, status: "settled" });
    }
    await adapter.refund(context, reservation, typeof body.reason === "string" ? body.reason : "operator_refund");
    return NextResponse.json({ ok: true, status: "refunded" });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "managed_provider_failed" }, { status: 502 });
  }
}

async function managedGatewayJson(gatewayUrl: string, identityToken: string | undefined, operatorSecret: string, path: string) {
  if (!identityToken) return NextResponse.json({ ok: false, error: "managed_provider_gateway_unavailable" }, { status: 503 });
  const response = await callManagedGateway(gatewayUrl, identityToken, operatorSecret, path, { method: "GET" });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: `managed_video_gateway_${response.status}` }, { status: response.status >= 400 && response.status < 500 ? response.status : 502 });
  }
  return NextResponse.json({ ok: true, data: body }, { headers: { "Cache-Control": "no-store" } });
}

async function callManagedGateway(gatewayUrl: string, identityToken: string, operatorSecret: string, path: string, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  let body: unknown = null;
  if (typeof init.body === "string" && init.body) {
    try { body = JSON.parse(init.body); } catch { return new Response(JSON.stringify({ error: "gateway_payload_invalid" }), { status: 400 }); }
  }
  return fetch(`${gatewayUrl}/v1/openrouter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Control-Plane-Secret": operatorSecret,
      "X-Serverless-Authorization": `Bearer ${identityToken}`,
    },
    body: JSON.stringify({ path, method, body }),
    cache: "no-store",
    signal: AbortSignal.timeout(100_000),
  }).catch(() => new Response(JSON.stringify({ error: "managed_provider_gateway_unavailable" }), { status: 502 }));
}

function authorized(request: Request, expected: string) {
  return Boolean(expected && request.headers.get("x-control-plane-secret")?.trim() === expected);
}

async function managedReadiness(tenantSlug: string, operation: ManagedProviderOperation) {
  const result = await supabaseServiceSelect("client_credit_budgets", {
    tenant_slug: `eq.${tenantSlug}`,
    catalog_id: `eq.${CATALOG_ID}`,
    provider_key: `eq.${PROVIDER_KEY}`,
    select: "managed_route_enabled,status,credential_reference,manifest_version,health_status,reconciliation_status",
  });
  const row = result.rows[0];
  return evaluateManagedProviderReadiness(operation, !result.ok || !row ? null : {
    managedRouteEnabled: row.managed_route_enabled === true,
    status: typeof row.status === "string" ? row.status : null,
    credentialReference: typeof row.credential_reference === "string" && row.credential_reference.trim() ? row.credential_reference.trim() : null,
    manifestVersion: typeof row.manifest_version === "string" && row.manifest_version.trim() ? row.manifest_version.trim() : null,
    healthStatus: typeof row.health_status === "string" ? row.health_status : null,
    reconciliationStatus: typeof row.reconciliation_status === "string" ? row.reconciliation_status : null,
  }, process.env.OPENROUTER_MANAGED_PRICING_SNAPSHOT_ID?.trim() || null);
}

function managedPricing() {
  try {
    const parsed = JSON.parse(process.env.OPENROUTER_MANAGED_PRICING_JSON ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, { inputMicrosPer1k: number; outputMicrosPer1k: number }> : {};
  } catch { return {}; }
}

function objectInput(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function reservationInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const reservedMicros = Number(row.reservedMicros);
  if (typeof row.reservationId !== "string" || !Number.isSafeInteger(reservedMicros) || reservedMicros <= 0 || typeof row.expiresAt !== "string") return null;
  return { reservationId: row.reservationId, reservedMicros, expiresAt: row.expiresAt };
}

function usageInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const actualMicros = Number(row.actualMicros);
  if (!Number.isSafeInteger(actualMicros) || actualMicros < 0) return null;
  return { actualMicros, providerRequestId: typeof row.providerRequestId === "string" ? row.providerRequestId : null, metadata: objectInput(row.metadata) };
}
