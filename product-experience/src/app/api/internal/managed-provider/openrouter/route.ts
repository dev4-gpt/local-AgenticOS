import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { cloudRunIdTokenFromVercel } from "@/lib/cloudRunOidc";
import { createOpenRouterManagedAdapter, createSupabaseManagedCreditLedger } from "@/lib/managedProviderRuntime";
import { parseManagedTextPricing, validateManagedPricingSnapshot, type ManagedTextPricing } from "@/lib/managedProviderPricing";
import { evaluateManagedProviderReadiness, type ManagedProviderOperation } from "@/lib/managedProviderReadiness";
import { normalizeManagedVideoInput, parseManagedVideoPricing, quoteManagedVideo } from "@/lib/managedVideoRuntime";
import { publicLaunchConfig, supabaseServiceRpc, supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATALOG_ID = "provider-openrouter_api_key";
// This is the existing provider identifier used by the tenant-credit catalog.
// It is an identifier only, never the OpenRouter credential itself.
const PROVIDER_KEY = "OPENROUTER_API_KEY";

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
  if (!tenantSlug || !/^[-a-z0-9]{2,120}$/.test(tenantSlug) || !["quote", "healthCheck", "reserve", "execute", "settle", "refund", "balance", "disable", "restore", "videoModels", "videoStatus", "videoQuote", "videoReserve", "videoExecute"].includes(operation)) {
    return NextResponse.json({ ok: false, error: "managed_provider_payload_invalid" }, { status: 400 });
  }
  if (!["quote", "healthCheck", "balance", "disable", "restore", "videoModels", "videoStatus", "videoQuote"].includes(operation) && !idempotencyKey) return NextResponse.json({ ok: false, error: "idempotency_required" }, { status: 400 });

  const configuredPricing = parseManagedTextPricing(process.env.OPENROUTER_MANAGED_PRICING_JSON);
  const readiness = await managedReadiness(tenantSlug, operation as ManagedProviderOperation, configuredPricing);
  if (!readiness.ok) return NextResponse.json({ ok: false, error: readiness.error }, { status: readiness.status });
  const requiresGateway = ["healthCheck", "balance", "reserve", "execute", "videoModels", "videoStatus", "videoExecute"].includes(operation);
  if (requiresGateway && readiness.credentialReference !== secretResource) {
    return NextResponse.json({ ok: false, error: "managed_provider_credential_reference_invalid" }, { status: 409 });
  }
  let gatewayIdentity: { token: string } | null = null;
  if (requiresGateway) {
    try {
      const minted = await cloudRunIdTokenFromVercel(request, gatewayUrl);
      // This endpoint is already operator-secret protected. Returning the
      // bounded federation reason makes IAM/OIDC failures diagnosable without
      // exposing a credential or falling back to unauthenticated access.
      if (!minted.ok) return NextResponse.json({ ok: false, error: minted.error }, { status: 503 });
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
  const ledger = createSupabaseManagedCreditLedger({ url: config.url, serviceRoleKey: config.serviceKey });
  const adapter = createOpenRouterManagedAdapter({
    ledger,
    callProvider: gatewayIdentity ? (_context, path, init) => callManagedGateway(gatewayUrl, gatewayIdentity.token, operatorSecret, path, init) : undefined,
    pricingSnapshotId: readiness.pricingSnapshotId ?? undefined,
    pricing: configuredPricing ?? {},
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
    if (operation === "videoQuote" || operation === "videoReserve" || operation === "videoExecute") {
      const input = normalizeManagedVideoInput(objectInput(body.input), managedVideoPricing());
      if (!input) return NextResponse.json({ ok: false, error: "managed_video_input_invalid" }, { status: 400 });
      const quote = quoteManagedVideo(input, managedVideoPricing(), process.env.OPENROUTER_MANAGED_VIDEO_PRICING_SNAPSHOT_ID?.trim() || readiness.pricingSnapshotId || "");
      if (operation === "videoQuote") return NextResponse.json({ ok: true, quote });
      if (operation === "videoReserve") {
        const reservationId = await ledger.reserve({ context, quote, idempotencyKey: idempotencyKey! });
        if (!reservationId) return NextResponse.json({ ok: false, error: "managed_credit_reservation_denied" }, { status: 409 });
        return NextResponse.json({ ok: true, quote, reservation: { reservationId, reservedMicros: quote.estimatedMicros, expiresAt: quote.expiresAt } });
      }
      const reservation = reservationInput(body.reservation);
      if (!reservation || reservation.reservedMicros < quote.estimatedMicros) return NextResponse.json({ ok: false, error: "managed_video_reservation_invalid" }, { status: 400 });
      if (!reservationUsable(reservation)) return NextResponse.json({ ok: false, error: "managed_provider_reservation_expired" }, { status: 409 });
      if (!await claimReservation(context, reservation, input, "video")) return NextResponse.json({ ok: false, error: "managed_provider_reservation_claim_failed" }, { status: 409 });
      try {
        const response = await callManagedGateway(gatewayUrl, gatewayIdentity?.token || "", operatorSecret, "/videos", { method: "POST", body: JSON.stringify(input) });
        const job = await response.json().catch(() => null) as Record<string, unknown> | null;
        const jobId = typeof job?.id === "string" ? job.id : "";
        if (!response.ok || !/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) throw new Error(`managed_video_request_${response.status}`);
        return NextResponse.json({ ok: true, job: { id: jobId, status: typeof job?.status === "string" ? job.status : "pending", pollingUrl: typeof job?.polling_url === "string" ? job.polling_url : null }, usage: { actualMicros: quote.estimatedMicros, providerRequestId: jobId, metadata: { kind: "video", model: input.model, duration: input.duration, resolution: input.resolution, aspectRatio: input.aspect_ratio, quotedMicros: quote.estimatedMicros } } });
      } catch (error) {
        await ledger.refund({ context, reservationId: reservation.reservationId, reason: error instanceof Error ? error.message : "managed_video_request_failed", idempotencyKey: `refund:${reservation.reservationId}`, metadata: { kind: "video", stage: "submit" } }).catch(() => undefined);
        throw error;
      }
    }
    if (operation === "quote") return NextResponse.json({ ok: true, quote: await adapter.quote(context, objectInput(body.input)) });
    if (operation === "healthCheck") {
      // A health probe only reads OpenRouter's model catalog, but its outcome
      // must be persisted before a later, separately approved execution can
      // become eligible. The probe never enables the managed route.
      const health = await adapter.healthCheck(context);
      const checkedAt = new Date().toISOString();
      const [updated, connectionUpdated] = await Promise.all([
        supabaseServiceUpdate("client_credit_budgets", {
          tenant_slug: `eq.${tenantSlug}`,
          catalog_id: `eq.${CATALOG_ID}`,
          provider_key: `eq.${PROVIDER_KEY}`,
        }, {
          health_status: health.ok ? "passed" : "failed",
          last_health_check_at: checkedAt,
          updated_at: checkedAt,
        }),
        supabaseServiceUpdate("client_provider_connections", {
          tenant_slug: `eq.${tenantSlug}`,
          catalog_id: `eq.${CATALOG_ID}`,
          provider_key: `eq.${PROVIDER_KEY}`,
        }, {
          status: health.ok ? "connected" : "validating",
          last_validated_at: checkedAt,
          validation_metadata: { health_ok: health.ok, health_reason: health.ok ? null : health.reason ?? "managed_provider_health_failed", validated_at: checkedAt },
          updated_at: checkedAt,
        }),
      ]);
      if (!updated.ok || updated.rows.length !== 1 || !connectionUpdated.ok || connectionUpdated.rows.length !== 1) return NextResponse.json({ ok: false, error: "managed_provider_health_persist_failed" }, { status: 502 });
      return NextResponse.json({ ok: health.ok, health }, { status: health.ok ? 200 : 502 });
    }
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
      try {
        return NextResponse.json({ ok: true, quote, reservation: await adapter.reserve(context, quote) });
      } catch (error) {
        if (error instanceof Error && error.message === "managed_credit_reservation_denied") {
          return NextResponse.json({ ok: false, error: "managed_credit_reservation_denied" }, { status: 409 });
        }
        if (error instanceof Error && error.message.startsWith("managed_credit_reservation_rpc_")) {
          return NextResponse.json({ ok: false, error: "managed_credit_reservation_rpc_failed" }, { status: 502 });
        }
        throw error;
      }
    }
    const reservation = reservationInput(body.reservation);
    if (!reservation) return NextResponse.json({ ok: false, error: "reservation_invalid" }, { status: 400 });
    if (operation === "execute") {
      if (!reservationUsable(reservation)) return NextResponse.json({ ok: false, error: "managed_provider_reservation_expired" }, { status: 409 });
      try {
        const input = objectInput(body.input);
        const executionQuote = await adapter.quote(context, input);
        if (reservation.reservedMicros < executionQuote.estimatedMicros) return NextResponse.json({ ok: false, error: "managed_provider_reservation_insufficient" }, { status: 409 });
        if (!await claimReservation(context, reservation, input, "chat")) return NextResponse.json({ ok: false, error: "managed_provider_reservation_claim_failed" }, { status: 409 });
        const usage = await adapter.execute(context, reservation, input);
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

async function managedReadiness(tenantSlug: string, operation: ManagedProviderOperation, configuredPricing: ManagedTextPricing | null) {
  const pricingSnapshotId = process.env.OPENROUTER_MANAGED_PRICING_SNAPSHOT_ID?.trim() || null;
  const [budgetResult, connectionResult] = await Promise.all([
    supabaseServiceSelect("client_credit_budgets", {
      tenant_slug: `eq.${tenantSlug}`,
      catalog_id: `eq.${CATALOG_ID}`,
      provider_key: `eq.${PROVIDER_KEY}`,
      select: "managed_route_enabled,status,credential_reference,manifest_version,health_status,reconciliation_status",
    }),
    supabaseServiceSelect("client_provider_connections", {
      tenant_slug: `eq.${tenantSlug}`,
      catalog_id: `eq.${CATALOG_ID}`,
      provider_key: `eq.${PROVIDER_KEY}`,
      select: "credential_mode,status,secret_resource,pricing_snapshot_id,manifest_version,last_validated_at",
    }),
  ]);
  const row = budgetResult.rows[0];
  const connection = connectionResult.rows[0];
  const connectionMaxAgeHoursValue = Number(process.env.OPENROUTER_MANAGED_CONNECTION_MAX_AGE_HOURS ?? 720);
  const connectionMaxAgeHours = Number.isFinite(connectionMaxAgeHoursValue) ? Math.min(2160, Math.max(1, connectionMaxAgeHoursValue)) : 720;
  const connectionValidatedAt = connectionResult.ok && typeof connection?.last_validated_at === "string" ? Date.parse(connection.last_validated_at) : Number.NaN;
  const connectionValidationCurrent = Number.isFinite(connectionValidatedAt)
    && connectionValidatedAt <= Date.now() + 300_000
    && connectionValidatedAt >= Date.now() - connectionMaxAgeHours * 3_600_000;
  const readiness = evaluateManagedProviderReadiness(operation, !budgetResult.ok || !row ? null : {
    managedRouteEnabled: row.managed_route_enabled === true,
    status: typeof row.status === "string" ? row.status : null,
    credentialReference: typeof row.credential_reference === "string" && row.credential_reference.trim() ? row.credential_reference.trim() : null,
    manifestVersion: typeof row.manifest_version === "string" && row.manifest_version.trim() ? row.manifest_version.trim() : null,
    healthStatus: typeof row.health_status === "string" ? row.health_status : null,
    reconciliationStatus: typeof row.reconciliation_status === "string" ? row.reconciliation_status : null,
    connectionStatus: connectionResult.ok && typeof connection?.status === "string" ? connection.status : null,
    credentialMode: connectionResult.ok && typeof connection?.credential_mode === "string" ? connection.credential_mode : null,
    connectionSecretResource: connectionResult.ok && typeof connection?.secret_resource === "string" ? connection.secret_resource.trim() || null : null,
    connectionPricingSnapshotId: connectionResult.ok && typeof connection?.pricing_snapshot_id === "string" ? connection.pricing_snapshot_id.trim() || null : null,
    connectionManifestVersion: connectionResult.ok && typeof connection?.manifest_version === "string" ? connection.manifest_version.trim() || null : null,
    connectionValidationCurrent,
  }, pricingSnapshotId);
  if (!readiness.ok) return readiness;
  const execution = ["quote", "reserve", "execute", "videoQuote", "videoReserve", "videoExecute"].includes(operation);
  if (!execution) return readiness;
  const snapshotResult = await supabaseServiceSelect("client_pricing_snapshots", {
    id: `eq.${pricingSnapshotId}`,
    select: "id,version,effective_at,prices",
  });
  const snapshot = snapshotResult.ok ? snapshotResult.rows[0] : null;
  const maxAgeHours = Number(process.env.OPENROUTER_MANAGED_PRICING_MAX_AGE_HOURS ?? 168);
  const validation = validateManagedPricingSnapshot({
    configuredSnapshotId: pricingSnapshotId,
    configuredPricing,
    row: snapshot ? { id: snapshot.id, version: snapshot.version, effective_at: snapshot.effective_at, prices: snapshot.prices } : null,
    maxAgeHours,
  });
  return validation.ok ? readiness : validation;
}

function managedVideoPricing() {
  return parseManagedVideoPricing(process.env.OPENROUTER_MANAGED_VIDEO_PRICING_JSON);
}

function objectInput(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function reservationInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const reservedMicros = Number(row.reservedMicros);
  if (typeof row.reservationId !== "string" || !Number.isSafeInteger(reservedMicros) || reservedMicros <= 0 || typeof row.expiresAt !== "string" || !Number.isFinite(Date.parse(row.expiresAt))) return null;
  return { reservationId: row.reservationId, reservedMicros, expiresAt: row.expiresAt };
}

function reservationUsable(value: { expiresAt: string }) {
  return Date.parse(value.expiresAt) > Date.now();
}

async function claimReservation(
  context: { tenantSlug: string; catalogId: string; providerKey: string; pricingSnapshotId?: string | null },
  reservation: { reservationId: string; reservedMicros: number },
  input: Record<string, unknown>,
  kind: "chat" | "video",
) {
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const claim = await supabaseServiceRpc("claim_client_credit_reservation", {
    p_reservation_id: reservation.reservationId,
    p_tenant_slug: context.tenantSlug,
    p_catalog_id: context.catalogId,
    p_provider_key: context.providerKey,
    p_reserved_amount_micros: reservation.reservedMicros,
    p_pricing_snapshot_id: context.pricingSnapshotId ?? null,
    p_claim_key: `${kind}:${reservation.reservationId}`,
    p_request_hash: requestHash,
    p_metadata: { kind },
  });
  return claim.ok && claim.value === true;
}

function usageInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const actualMicros = Number(row.actualMicros);
  if (!Number.isSafeInteger(actualMicros) || actualMicros < 0) return null;
  return { actualMicros, providerRequestId: typeof row.providerRequestId === "string" ? row.providerRequestId : null, metadata: objectInput(row.metadata) };
}
