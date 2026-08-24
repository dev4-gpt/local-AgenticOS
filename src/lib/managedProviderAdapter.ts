export type ManagedProviderOperation = "quote" | "healthCheck" | "reserve" | "execute" | "settle" | "refund" | "balance" | "disable" | "restore";

export interface ManagedProviderContext {
  tenantSlug: string;
  catalogId: string;
  providerKey: string;
  credentialReference?: string | null;
  manifestVersion?: string | null;
  pricingSnapshotId?: string | null;
  requestId?: string | null;
  idempotencyKey?: string | null;
}

export interface ManagedProviderQuote {
  estimatedMicros: number;
  currency: "usd";
  pricingSnapshotId: string;
  expiresAt: string;
}

export interface ManagedProviderReservation {
  reservationId: string;
  reservedMicros: number;
  expiresAt: string;
}

export interface ManagedProviderUsage {
  actualMicros: number;
  providerRequestId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * The managed adapter never mutates the ledger directly. The worker supplies
 * these RPC-backed operations so the provider boundary can be tested with a
 * fake ledger and production execution can remain tenant-scoped and audited.
 */
export interface ManagedCreditLedger {
  reserve(input: {
    context: ManagedProviderContext;
    quote: ManagedProviderQuote;
    idempotencyKey: string;
  }): Promise<string | null>;
  settle(input: {
    context: ManagedProviderContext;
    reservationId: string;
    actualMicros: number;
    providerRequestId?: string | null;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<boolean>;
  refund(input: {
    context: ManagedProviderContext;
    reservationId: string;
    reason: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<boolean>;
}

export interface ManagedProviderAdapter {
  providerId: string;
  quote(context: ManagedProviderContext, input: Record<string, unknown>): Promise<ManagedProviderQuote>;
  healthCheck(context: ManagedProviderContext): Promise<{ ok: boolean; reason?: string }>;
  reserve(context: ManagedProviderContext, quote: ManagedProviderQuote): Promise<ManagedProviderReservation>;
  execute(context: ManagedProviderContext, reservation: ManagedProviderReservation, input: Record<string, unknown>): Promise<ManagedProviderUsage>;
  settle(context: ManagedProviderContext, reservation: ManagedProviderReservation, usage: ManagedProviderUsage): Promise<void>;
  refund(context: ManagedProviderContext, reservation: ManagedProviderReservation, reason: string): Promise<void>;
  balance(context: ManagedProviderContext): Promise<{ availableMicros: number; currency: "usd" }>;
  disable(context: ManagedProviderContext, reason: string): Promise<void>;
}

export const MANAGED_PROVIDER_OPERATIONS: readonly ManagedProviderOperation[] = [
  "quote", "healthCheck", "reserve", "execute", "settle", "refund", "balance", "disable", "restore",
];

export const OPENROUTER_MANAGED_ROUTE = {
  providerId: "openrouter",
  enabled: false,
  reason: "Managed OpenRouter execution is implemented behind explicit account, credential, readiness, and smoke gates; it is not enabled by funding alone.",
} as const;
