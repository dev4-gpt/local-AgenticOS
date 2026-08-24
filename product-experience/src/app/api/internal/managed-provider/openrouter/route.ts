import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { createOpenRouterManagedAdapter, createSupabaseManagedCreditLedger } from "@/lib/managedProviderRuntime";
import { evaluateManagedProviderReadiness, type ManagedProviderOperation } from "@/lib/managedProviderReadiness";
import { publicLaunchConfig, supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATALOG_ID = "provider-openrouter_api_key";
const PROVIDER_KEY = "openrouter";
const SECRET_MANAGER_ROOT = "https://secretmanager.googleapis.com/v1";

/**
 * Private managed-provider boundary. This route is deliberately separate from
 * the client runtime: it requires the control-plane secret, service-role
 * ledger access, and a database readiness row before it can call OpenRouter.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const config = publicLaunchConfig();
  if (!config || !process.env.OPENROUTER_MANAGED_SECRET_RESOURCE?.trim()) return NextResponse.json({ ok: false, error: "managed_provider_not_configured" }, { status: 503 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const operation = typeof body.operation === "string" ? body.operation.trim() : "";
  const tenantSlug = typeof body.tenantSlug === "string" ? body.tenantSlug.trim() : "";
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : null;
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : null;
  if (!tenantSlug || !/^[-a-z0-9]{2,120}$/.test(tenantSlug) || !["quote", "healthCheck", "reserve", "execute", "settle", "refund", "balance", "disable", "restore"].includes(operation)) {
    return NextResponse.json({ ok: false, error: "managed_provider_payload_invalid" }, { status: 400 });
  }
  if (!["quote", "healthCheck", "balance", "disable", "restore"].includes(operation) && !idempotencyKey) return NextResponse.json({ ok: false, error: "idempotency_required" }, { status: 400 });

  const readiness = await managedReadiness(tenantSlug, operation as ManagedProviderOperation);
  if (!readiness.ok) return NextResponse.json({ ok: false, error: readiness.error }, { status: readiness.status });
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
    resolveCredential: () => readManagedCredential(readiness.credentialReference ?? ""),
    pricingSnapshotId: readiness.pricingSnapshotId ?? undefined,
    pricing: managedPricing(),
  });

  try {
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

function authorized(request: Request) {
  const expected = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim();
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

async function readManagedCredential(resource: string) {
  const token = await metadataToken();
  if (!token || resource !== process.env.OPENROUTER_MANAGED_SECRET_RESOURCE?.trim()) return null;
  const response = await fetch(`${SECRET_MANAGER_ROOT}/${resource}:access`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => null) as { payload?: { data?: unknown } } | null;
  return typeof payload?.payload?.data === "string" ? Buffer.from(payload.payload.data, "base64").toString("utf8").trim() : null;
}

async function metadataToken() {
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" }, cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  const body = await response.json().catch(() => null) as { access_token?: unknown } | null;
  return typeof body?.access_token === "string" ? body.access_token : null;
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
