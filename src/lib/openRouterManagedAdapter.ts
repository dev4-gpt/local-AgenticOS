import { createHash } from "node:crypto";
import type {
  ManagedCreditLedger,
  ManagedProviderAdapter,
  ManagedProviderContext,
  ManagedProviderQuote,
  ManagedProviderReservation,
  ManagedProviderUsage,
} from "@/lib/managedProviderAdapter";

type FetchLike = typeof fetch;

type OpenRouterResponse = {
  id?: unknown;
  model?: unknown;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
    cost?: unknown;
  };
  choices?: Array<{ message?: { content?: unknown } }>;
};

export interface OpenRouterManagedAdapterOptions {
  ledger: ManagedCreditLedger;
  resolveCredential: (context: ManagedProviderContext) => Promise<string | null>;
  fetcher?: FetchLike;
  baseUrl?: string;
  pricingSnapshotId?: string;
  pricing?: Record<string, { inputMicrosPer1k: number; outputMicrosPer1k: number }>;
  timeoutMs?: number;
  onDisable?: (context: ManagedProviderContext, reason: string) => Promise<void>;
}

/**
 * OpenRouter's managed lane. The adapter owns the provider request boundary;
 * the injected ledger owns tenant wallet accounting. This keeps provider
 * credentials out of request payloads and makes reserve/settle/refund fully
 * idempotent through the SQL RPC layer.
 */
export function createOpenRouterManagedAdapter(options: OpenRouterManagedAdapterOptions): ManagedProviderAdapter {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const pricingSnapshotId = options.pricingSnapshotId?.trim() || "openrouter-managed-unconfigured";
  const disabledTenants = new Set<string>();
  const timeoutMs = clampTimeout(options.timeoutMs);

  const credential = async (context: ManagedProviderContext) => {
    if (!context.tenantSlug || context.providerKey !== "openrouter") return null;
    if (disabledTenants.has(context.tenantSlug)) return null;
    const value = await options.resolveCredential(context).catch(() => null);
    return typeof value === "string" && value.trim().length >= 8 ? value.trim() : null;
  };

  const request = async (context: ManagedProviderContext, path: string, init: RequestInit = {}) => {
    const key = await credential(context);
    if (!key) throw new Error("managed_provider_credential_unavailable");
    return fetcher(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PUBLIC_SITE_URL?.trim() || "https://veloceos.cloud",
        "X-Title": "Veloce AgenticOS managed execution",
        ...(init.headers ?? {}),
      },
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  };

  return {
    providerId: "openrouter",

    async quote(context, input) {
      const model = stringInput(input.model) || "";
      const messages = Array.isArray(input.messages) ? input.messages : [];
      const maxOutputTokens = boundedInteger(input.maxOutputTokens, 256, 16_384);
      const rate = options.pricing?.[model];
      if (!model || !rate || !Number.isFinite(rate.inputMicrosPer1k) || !Number.isFinite(rate.outputMicrosPer1k)) {
        throw new Error("managed_pricing_not_configured");
      }
      const inputChars = messages.reduce((total, message) => total + messageTextLength(message), 0);
      const inputTokensUpperBound = Math.max(1, inputChars);
      const estimatedMicros = Math.ceil(
        inputTokensUpperBound / 1000 * rate.inputMicrosPer1k
        + maxOutputTokens / 1000 * rate.outputMicrosPer1k,
      );
      if (!Number.isSafeInteger(estimatedMicros) || estimatedMicros <= 0) throw new Error("managed_quote_invalid");
      return {
        estimatedMicros,
        currency: "usd",
        pricingSnapshotId: context.pricingSnapshotId?.trim() || pricingSnapshotId,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      } satisfies ManagedProviderQuote;
    },

    async healthCheck(context) {
      try {
        const response = await request(context, "/models", { method: "GET" });
        return response.ok ? { ok: true } : { ok: false, reason: `openrouter_health_${response.status}` };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : "openrouter_health_failed" };
      }
    },

    async reserve(context, quote) {
      const idempotencyKey = context.idempotencyKey?.trim() || context.requestId?.trim();
      if (!idempotencyKey) throw new Error("managed_reservation_idempotency_required");
      const reservationId = await options.ledger.reserve({ context, quote, idempotencyKey });
      if (!reservationId) throw new Error("managed_credit_reservation_denied");
      return { reservationId, reservedMicros: quote.estimatedMicros, expiresAt: quote.expiresAt } satisfies ManagedProviderReservation;
    },

    async execute(context, reservation, input) {
      const model = stringInput(input.model) || "";
      const messages = Array.isArray(input.messages) ? input.messages : [];
      if (!model || messages.length === 0) throw new Error("managed_openrouter_input_invalid");
      const response = await request(context, "/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model,
          messages,
          max_tokens: boundedInteger(input.maxOutputTokens, 256, 16_384),
          temperature: 0.2,
          ...(typeof input.providerOrder === "object" ? { provider: input.providerOrder } : {}),
        }),
      }).catch((error) => {
        throw new Error(error instanceof Error ? error.message : "managed_openrouter_request_failed");
      });
      const data = await responseJson(response) as OpenRouterResponse | null;
      if (!response.ok || !data) throw new Error(`managed_openrouter_request_${response.status}`);
      const actualMicros = usageCostMicros(data.usage, options.pricing?.[model], messages, input.maxOutputTokens);
      if (actualMicros === null || actualMicros > reservation.reservedMicros) throw new Error("managed_usage_exceeds_reservation");
      return {
        actualMicros,
        providerRequestId: typeof data.id === "string" ? data.id : null,
        metadata: {
          model: typeof data.model === "string" ? data.model : model,
          inputTokens: safeNumber(data.usage?.prompt_tokens),
          outputTokens: safeNumber(data.usage?.completion_tokens),
          totalTokens: safeNumber(data.usage?.total_tokens),
          responseHash: createHash("sha256").update(JSON.stringify(data.choices?.[0]?.message?.content ?? "")).digest("hex"),
        },
      } satisfies ManagedProviderUsage;
    },

    async settle(context, reservation, usage) {
      const idempotencyKey = `settle:${reservation.reservationId}`;
      if (!await options.ledger.settle({ context, reservationId: reservation.reservationId, actualMicros: usage.actualMicros, providerRequestId: usage.providerRequestId, idempotencyKey, metadata: usage.metadata })) {
        throw new Error("managed_credit_settlement_failed");
      }
    },

    async refund(context, reservation, reason) {
      const idempotencyKey = `refund:${reservation.reservationId}`;
      if (!await options.ledger.refund({ context, reservationId: reservation.reservationId, reason: reason.slice(0, 1000), idempotencyKey })) {
        throw new Error("managed_credit_refund_failed");
      }
    },

    async balance(context) {
      const response = await request(context, "/credits", { method: "GET" });
      const data = await responseJson(response) as { data?: { total_credits?: unknown; total_usage?: unknown } } | null;
      if (!response.ok || !data?.data) throw new Error(`managed_openrouter_balance_${response.status}`);
      const available = Number(data.data.total_credits) - Number(data.data.total_usage);
      if (!Number.isFinite(available) || available < 0) throw new Error("managed_openrouter_balance_invalid");
      return { availableMicros: Math.floor(available * 1_000_000), currency: "usd" as const };
    },

    async disable(context, reason) {
      disabledTenants.add(context.tenantSlug);
      await options.onDisable?.(context, reason.slice(0, 1000));
    },
  };
}

function clampTimeout(value: number | undefined) {
  return Number.isFinite(value) ? Math.min(120_000, Math.max(5_000, Math.round(value!))) : 90_000;
}

function stringInput(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function boundedInteger(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? Math.min(max, Math.max(min, number)) : min;
}

function messageTextLength(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const content = (value as { content?: unknown }).content;
  return typeof content === "string" ? content.length : JSON.stringify(content ?? "").length;
}

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function usageCostMicros(
  usage: OpenRouterResponse["usage"] | undefined,
  rate: { inputMicrosPer1k: number; outputMicrosPer1k: number } | undefined,
  messages: unknown[],
  maxOutputTokens: unknown,
) {
  const direct = Number(usage?.cost);
  if (Number.isFinite(direct) && direct >= 0) return Math.ceil(direct * 1_000_000);
  if (!rate) return null;
  const inputTokens = safeNumber(usage?.prompt_tokens) ?? Math.max(1, messages.reduce<number>((total, item) => total + messageTextLength(item), 0));
  const outputTokens = safeNumber(usage?.completion_tokens) ?? boundedInteger(maxOutputTokens, 256, 16_384);
  return Math.ceil(inputTokens / 1000 * rate.inputMicrosPer1k + outputTokens / 1000 * rate.outputMicrosPer1k);
}

async function responseJson(response: Response) {
  const body = await response.text().catch(() => "");
  if (!body || body.length > 2_000_000) return null;
  try { return JSON.parse(body) as unknown; } catch { return null; }
}
