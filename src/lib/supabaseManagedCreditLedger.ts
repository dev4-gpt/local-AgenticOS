import type { ManagedCreditLedger } from "@/lib/managedProviderAdapter";

export interface SupabaseManagedCreditLedgerOptions {
  url: string;
  serviceRoleKey: string;
  fetcher?: typeof fetch;
}

/**
 * Service-side ledger bridge for the private managed-provider worker. The
 * lifecycle SQL grants these RPCs only to service_role, so this module must
 * never be imported by a browser route or receive a client access token.
 */
export function createSupabaseManagedCreditLedger(options: SupabaseManagedCreditLedgerOptions): ManagedCreditLedger {
  const url = options.url.trim().replace(/\/$/, "");
  const serviceRoleKey = options.serviceRoleKey.trim();
  const fetcher = options.fetcher ?? fetch;
  if (!url || !serviceRoleKey) throw new Error("managed_credit_ledger_not_configured");

  async function rpc(functionName: string, body: Record<string, unknown>) {
    const response = await fetcher(`${url}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }).catch(() => null);
    return { ok: response?.ok === true, value: await response?.json().catch(() => null) };
  }

  return {
    async reserve(input) {
      const result = await rpc("reserve_client_credit", {
        p_tenant_slug: input.context.tenantSlug,
        p_catalog_id: input.context.catalogId,
        p_provider_key: input.context.providerKey,
        p_idempotency_key: input.idempotencyKey,
        p_quoted_amount_micros: input.quote.estimatedMicros,
        p_expires_at: input.quote.expiresAt,
        p_pricing_snapshot_id: input.quote.pricingSnapshotId,
        p_metadata: { request_id: input.context.requestId ?? null, operation: "managed_provider_reserve" },
      });
      return result.ok && typeof result.value === "string" ? result.value : null;
    },

    async settle(input) {
      const result = await rpc("settle_client_credit", {
        p_reservation_id: input.reservationId,
        p_actual_amount_micros: input.actualMicros,
        p_provider_request_id: input.providerRequestId ?? null,
        p_idempotency_key: input.idempotencyKey,
        p_usage_metadata: input.metadata ?? {},
      });
      return result.ok && result.value === true;
    },

    async refund(input) {
      const result = await rpc("refund_client_credit", {
        p_reservation_id: input.reservationId,
        p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
        p_metadata: input.metadata ?? {},
      });
      return result.ok && result.value === true;
    },
  };
}
