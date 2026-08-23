export type ManagedProviderOperation = "quote" | "healthCheck" | "reserve" | "execute" | "settle" | "refund" | "balance" | "disable";

export interface ManagedProviderContext {
  tenantSlug: string;
  catalogId: string;
  providerKey: string;
  credentialReference?: string | null;
  manifestVersion?: string | null;
  pricingSnapshotId?: string | null;
  requestId?: string | null;
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
  "quote", "healthCheck", "reserve", "execute", "settle", "refund", "balance", "disable",
];

/**
 * The OpenRouter managed lane is deliberately a contract-only placeholder.
 * Keeping it explicit prevents a funded wallet from silently becoming a
 * pooled provider credential or an unaccounted provider call.
 */
export const OPENROUTER_MANAGED_ROUTE = {
  providerId: "openrouter",
  enabled: false,
  reason: "Managed OpenRouter execution requires tenant-scoped account ownership, balance reconciliation, and smoke evidence.",
} as const;
