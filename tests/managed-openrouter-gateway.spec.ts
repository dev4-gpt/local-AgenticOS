import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("managed gateway rejects unreviewed chat models and passthrough fields", () => {
  const worker = readFileSync(resolve(process.cwd(), "workers/managed-openrouter/worker.mjs"), "utf8");

  expect(worker).toContain("OPENROUTER_MODEL_ALLOWLIST");
  expect(worker).toContain("allowedTextModels.has(model)");
  expect(worker).toContain("normalizedChatInput(value.body)");
  expect(worker).toContain('return { model, messages, max_tokens: maxTokens, temperature, stream: false }');
  expect(worker).not.toContain("...value.body");
});

test("managed execution re-quotes the submitted payload before provider spend", () => {
  const route = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/internal/managed-provider/openrouter/route.ts"), "utf8");
  const runtime = readFileSync(resolve(process.cwd(), "product-experience/src/lib/managedProviderRuntime.ts"), "utf8");

  expect(route).toContain("const executionQuote = await adapter.quote(context, input)");
  expect(route).toContain("reservation.reservedMicros < executionQuote.estimatedMicros");
  expect(route).toContain('error: "managed_provider_reservation_insufficient"');
  expect(route).toContain("reservationUsable(reservation)");
  expect(route).toContain('supabaseServiceRpc("claim_client_credit_reservation"');
  expect(route).toContain('error: "managed_provider_reservation_claim_failed"');
  expect(route).toContain('error: "managed_credit_reservation_denied"');
  expect(route).toContain('error: "managed_credit_reservation_rpc_failed"');
  expect(route).toContain('{ status: 409 }');
  expect(runtime).toContain("status: response?.status ?? 503");
  expect(runtime).toContain("managed_credit_reservation_rpc_${result.status}");
  expect(route.indexOf("const executionQuote = await adapter.quote(context, input)")).toBeLessThan(route.indexOf("const usage = await adapter.execute(context, reservation, input)"));
  expect(route.indexOf('await claimReservation(context, reservation, input, "chat")')).toBeLessThan(route.indexOf("const usage = await adapter.execute(context, reservation, input)"));
});
