type Context = {
  tenantSlug: string;
  catalogId: string;
  providerKey: string;
  credentialReference?: string | null;
  manifestVersion?: string | null;
  pricingSnapshotId?: string | null;
  requestId?: string | null;
  idempotencyKey?: string | null;
};

type Quote = { estimatedMicros: number; currency: "usd"; pricingSnapshotId: string; expiresAt: string };
type Reservation = { reservationId: string; reservedMicros: number; expiresAt: string };
type Usage = { actualMicros: number; providerRequestId?: string | null; metadata?: Record<string, unknown> };
type ProviderCall = (context: Context, path: string, init?: RequestInit) => Promise<Response>;

interface Ledger {
  reserve(input: { context: Context; quote: Quote; idempotencyKey: string }): Promise<string | null>;
  settle(input: { context: Context; reservationId: string; actualMicros: number; providerRequestId?: string | null; idempotencyKey: string; metadata?: Record<string, unknown> }): Promise<boolean>;
  refund(input: { context: Context; reservationId: string; reason: string; idempotencyKey: string; metadata?: Record<string, unknown> }): Promise<boolean>;
}

export function createSupabaseManagedCreditLedger(options: { url: string; serviceRoleKey: string; fetcher?: typeof fetch }): Ledger {
  const url = options.url.trim().replace(/\/$/, "");
  const key = options.serviceRoleKey.trim();
  const fetcher = options.fetcher ?? fetch;
  async function rpc(name: string, body: Record<string, unknown>) {
    const response = await fetcher(`${url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" }).catch(() => null);
    return { ok: response?.ok === true, value: await response?.json().catch(() => null) };
  }
  return {
    async reserve(input) {
      const result = await rpc("reserve_client_credit", { p_tenant_slug: input.context.tenantSlug, p_catalog_id: input.context.catalogId, p_provider_key: input.context.providerKey, p_idempotency_key: input.idempotencyKey, p_quoted_amount_micros: input.quote.estimatedMicros, p_expires_at: input.quote.expiresAt, p_pricing_snapshot_id: input.quote.pricingSnapshotId, p_metadata: { request_id: input.context.requestId ?? null, operation: "managed_provider_reserve" } });
      return result.ok && typeof result.value === "string" ? result.value : null;
    },
    async settle(input) {
      const result = await rpc("settle_client_credit", { p_reservation_id: input.reservationId, p_actual_amount_micros: input.actualMicros, p_provider_request_id: input.providerRequestId ?? null, p_idempotency_key: input.idempotencyKey, p_usage_metadata: input.metadata ?? {} });
      return result.ok && result.value === true;
    },
    async refund(input) {
      const result = await rpc("refund_client_credit", { p_reservation_id: input.reservationId, p_reason: input.reason, p_idempotency_key: input.idempotencyKey, p_metadata: input.metadata ?? {} });
      return result.ok && result.value === true;
    },
  };
}

export function createOpenRouterManagedAdapter(options: {
  ledger: Ledger;
  resolveCredential?: (context: Context) => Promise<string | null>;
  /**
   * A server-side gateway used when the provider credential is intentionally
   * kept outside this process (for example, in a Cloud Run service identity).
   */
  callProvider?: ProviderCall;
  pricingSnapshotId?: string;
  pricing?: Record<string, { inputMicrosPer1k: number; outputMicrosPer1k: number }>;
  fetcher?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}) {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const disabled = new Set<string>();
  const timeout = Math.min(120_000, Math.max(5_000, Math.round(options.timeoutMs ?? 90_000)));
  async function call(context: Context, path: string, init: RequestInit = {}) {
    if (disabled.has(context.tenantSlug)) throw new Error("managed_provider_disabled");
    if (options.callProvider) return options.callProvider(context, path, init);
    const key = options.resolveCredential ? await options.resolveCredential(context).catch(() => null) : null;
    if (!key) throw new Error("managed_provider_credential_unavailable");
    return fetcher(`${baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": process.env.PUBLIC_SITE_URL?.trim() || "https://veloceos.cloud", "X-Title": "Veloce AgenticOS managed execution", ...(init.headers ?? {}) }, signal: init.signal ?? AbortSignal.timeout(timeout), cache: "no-store" });
  }
  async function json(response: Response) { const body = await response.text().catch(() => ""); try { return body && body.length <= 2_000_000 ? JSON.parse(body) as Record<string, unknown> : null; } catch { return null; } }
  function rate(input: Record<string, unknown>) { const model = typeof input.model === "string" ? input.model.trim() : ""; return { model, rate: options.pricing?.[model] }; }
  function messageSize(input: Record<string, unknown>) { return Array.isArray(input.messages) ? input.messages.reduce((total, item) => total + (item && typeof item === "object" ? JSON.stringify((item as Record<string, unknown>).content ?? "").length : 0), 0) : 0; }
  return {
    async quote(context: Context, input: Record<string, unknown>): Promise<Quote> {
      const { model, rate: modelRate } = rate(input);
      const maxOutput = Number.isSafeInteger(Number(input.maxOutputTokens)) ? Math.min(16_384, Math.max(256, Number(input.maxOutputTokens))) : 256;
      const pricingSnapshotId = context.pricingSnapshotId?.trim() || options.pricingSnapshotId?.trim() || "";
      if (!pricingSnapshotId) throw new Error("managed_pricing_snapshot_not_configured");
      if (!modelRate || !Number.isSafeInteger(modelRate.inputMicrosPer1k) || modelRate.inputMicrosPer1k < 0 || !Number.isSafeInteger(modelRate.outputMicrosPer1k) || modelRate.outputMicrosPer1k < 0 || (modelRate.inputMicrosPer1k === 0 && modelRate.outputMicrosPer1k === 0)) throw new Error("managed_pricing_not_configured");
      const estimatedMicros = Math.ceil(Math.max(1, messageSize(input)) / 1000 * modelRate.inputMicrosPer1k + maxOutput / 1000 * modelRate.outputMicrosPer1k);
      if (!Number.isSafeInteger(estimatedMicros) || estimatedMicros <= 0) throw new Error("managed_pricing_not_configured");
      return { estimatedMicros, currency: "usd", pricingSnapshotId, expiresAt: new Date(Date.now() + 900_000).toISOString() };
    },
    async healthCheck(context: Context) { try { const result = await call(context, "/models", { method: "GET" }); return result.ok ? { ok: true } : { ok: false, reason: `openrouter_health_${result.status}` }; } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : "openrouter_health_failed" }; } },
    async reserve(context: Context, quote: Quote): Promise<Reservation> {
      const idempotencyKey = context.idempotencyKey?.trim() || context.requestId?.trim();
      if (!idempotencyKey) throw new Error("managed_reservation_idempotency_required");
      const reservationId = await options.ledger.reserve({ context, quote, idempotencyKey });
      if (!reservationId) throw new Error("managed_credit_reservation_denied");
      return { reservationId, reservedMicros: quote.estimatedMicros, expiresAt: quote.expiresAt };
    },
    async execute(context: Context, reservation: Reservation, input: Record<string, unknown>): Promise<Usage> {
      const { model, rate: modelRate } = rate(input);
      if (!model || !Array.isArray(input.messages) || !input.messages.length) throw new Error("managed_openrouter_input_invalid");
      const response = await call(context, "/chat/completions", { method: "POST", body: JSON.stringify({ model, messages: input.messages, max_tokens: Number.isSafeInteger(Number(input.maxOutputTokens)) ? Math.min(16_384, Math.max(256, Number(input.maxOutputTokens))) : 256, temperature: 0.2 }) });
      const data = await json(response);
      if (!response.ok || !data) throw new Error(`managed_openrouter_request_${response.status}`);
      const usage = data.usage && typeof data.usage === "object" ? data.usage as Record<string, unknown> : {};
      const directCost = Number(usage.cost);
      const actualMicros = Number.isFinite(directCost) && directCost >= 0 ? Math.ceil(directCost * 1_000_000) : modelRate ? Math.ceil((Number(usage.prompt_tokens) || Math.max(1, messageSize(input))) / 1000 * modelRate.inputMicrosPer1k + (Number(usage.completion_tokens) || 256) / 1000 * modelRate.outputMicrosPer1k) : null;
      if (actualMicros === null || actualMicros > reservation.reservedMicros) throw new Error("managed_usage_exceeds_reservation");
      return { actualMicros, providerRequestId: typeof data.id === "string" ? data.id : null, metadata: { model, inputTokens: Number(usage.prompt_tokens) || null, outputTokens: Number(usage.completion_tokens) || null } };
    },
    async settle(context: Context, reservation: Reservation, usage: Usage) { if (!await options.ledger.settle({ context, reservationId: reservation.reservationId, actualMicros: usage.actualMicros, providerRequestId: usage.providerRequestId, idempotencyKey: `settle:${reservation.reservationId}`, metadata: usage.metadata })) throw new Error("managed_credit_settlement_failed"); },
    async refund(context: Context, reservation: Reservation, reason: string) { if (!await options.ledger.refund({ context, reservationId: reservation.reservationId, reason: reason.slice(0, 1000), idempotencyKey: `refund:${reservation.reservationId}` })) throw new Error("managed_credit_refund_failed"); },
    async balance(context: Context) { const response = await call(context, "/credits", { method: "GET" }); const data = await json(response); const credits = data?.data && typeof data.data === "object" ? data.data as Record<string, unknown> : null; const available = Number(credits?.total_credits) - Number(credits?.total_usage); if (!response.ok || !credits || !Number.isFinite(available) || available < 0) throw new Error(`managed_openrouter_balance_${response.status}`); return { availableMicros: Math.floor(available * 1_000_000), currency: "usd" as const }; },
    async disable(context: Context, _reason?: string) { disabled.add(context.tenantSlug); },
  };
}
