import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const budget = loadReviewModule("src/lib/adapterBudget.ts", { "./adapterContracts": contracts });

const WORKER = "w".repeat(30);
const base = { tenantSlug: "tenant-a", workerToken: WORKER, adapterId: "forge", taskId: "task-1", idempotencyKey: "idem-key-1" };
const reserveInput = { ...base, amountMicros: 500, provider: "provider-x", model: "model-x", tenantMonthlyCapMicros: 10_000 };

const rpcReturning = (value: unknown, ok = true) => {
  const calls: [string, Record<string, unknown>][] = [];
  const rpc = async (name: string, body: Record<string, unknown>) => { calls.push([name, body]); return { ok, status: ok ? 200 : 500, value }; };
  return { rpc, calls };
};

test("reserve sends whole micros and the right function, and only reserved answers are allowed", async () => {
  const { rpc, calls } = rpcReturning("reserved");
  expect(await budget.reserveAdapterBudget(rpc, reserveInput)).toEqual({ allowed: true, status: "reserved" });
  expect(calls[0][0]).toBe("client_adapter_budget_reserve");
  expect(calls[0][1]).toMatchObject({ p_tenant_slug: "tenant-a", p_adapter_id: "forge", p_amount_micros: 500, p_tenant_monthly_cap_micros: 10_000, p_model: "model-x" });
  expect((await budget.reserveAdapterBudget(rpcReturning("already_reserved").rpc, reserveInput)).allowed).toBe(true);
  for (const status of ["adapter_cap_exceeded", "tenant_cap_exceeded", "adapter_not_ready", "key_conflict", "task_already_reserved", "refused"]) {
    expect(await budget.reserveAdapterBudget(rpcReturning(status).rpc, reserveInput)).toEqual({ allowed: false, status });
  }
});

test("anything that is not an exact known answer is denied (fails closed)", async () => {
  for (const value of [true, "true", "RESERVED", "maybe", null, undefined, 1, { status: "reserved" }]) {
    expect(await budget.reserveAdapterBudget(rpcReturning(value).rpc, reserveInput)).toEqual({ allowed: false, status: "unavailable" });
  }
  expect(await budget.reserveAdapterBudget(rpcReturning("reserved", false).rpc, reserveInput)).toEqual({ allowed: false, status: "unavailable" });
  const throwing = async () => { throw new Error("network down"); };
  expect(await budget.reserveAdapterBudget(throwing, reserveInput)).toEqual({ allowed: false, status: "unavailable" });
  expect(await budget.settleAdapterBudget(throwing, { ...base, actualAmountMicros: 1 })).toEqual({ allowed: false, status: "unavailable" });
  expect(await budget.releaseAdapterBudget(throwing, base)).toEqual({ allowed: false, status: "unavailable" });
});

test("bad input never reaches the database", async () => {
  const { rpc, calls } = rpcReturning("reserved");
  const bad: Record<string, unknown>[] = [
    { amountMicros: 1.5 }, { amountMicros: -1 }, { amountMicros: "5" }, { amountMicros: Number.MAX_SAFE_INTEGER + 2 },
    { tenantMonthlyCapMicros: 0.1 }, { tenantMonthlyCapMicros: -5 },
    { tenantSlug: "BAD SLUG" }, { adapterId: "X" }, { workerToken: "short" }, { taskId: "" }, { taskId: "t".repeat(129) },
    { idempotencyKey: "short" }, { provider: "" }, { provider: "p".repeat(121) }, { model: "" }, { model: "m".repeat(181) },
  ];
  for (const change of bad) {
    expect(await budget.reserveAdapterBudget(rpc, { ...reserveInput, ...change })).toEqual({ allowed: false, status: "invalid_input" });
  }
  expect(calls).toHaveLength(0);
});

test("a missing model is sent as null", async () => {
  const { rpc, calls } = rpcReturning("reserved");
  await budget.reserveAdapterBudget(rpc, { ...reserveInput, model: undefined });
  expect(calls[0][1].p_model).toBeNull();
});

test("settle and release map their own success answers and validate input", async () => {
  expect(await budget.settleAdapterBudget(rpcReturning("settled").rpc, { ...base, actualAmountMicros: 10 })).toEqual({ allowed: true, status: "settled" });
  expect((await budget.settleAdapterBudget(rpcReturning("already_applied").rpc, { ...base, actualAmountMicros: 10 })).allowed).toBe(true);
  for (const status of ["over_reserved", "already_closed", "not_found", "key_conflict"]) {
    expect((await budget.settleAdapterBudget(rpcReturning(status).rpc, { ...base, actualAmountMicros: 10 })).allowed).toBe(false);
  }
  expect((await budget.settleAdapterBudget(rpcReturning("reserved").rpc, { ...base, actualAmountMicros: 10 })).allowed).toBe(false);
  expect(await budget.releaseAdapterBudget(rpcReturning("released").rpc, base)).toEqual({ allowed: true, status: "released" });
  expect((await budget.releaseAdapterBudget(rpcReturning("already_closed").rpc, base)).allowed).toBe(false);
  const { rpc, calls } = rpcReturning("settled");
  expect(await budget.settleAdapterBudget(rpc, { ...base, actualAmountMicros: -1 })).toEqual({ allowed: false, status: "invalid_input" });
  expect(await budget.settleAdapterBudget(rpc, { ...base, actualAmountMicros: 0.5 })).toEqual({ allowed: false, status: "invalid_input" });
  expect(await budget.releaseAdapterBudget(rpc, { ...base, tenantSlug: "BAD" })).toEqual({ allowed: false, status: "invalid_input" });
  expect(calls).toHaveLength(0);
});

test("zero-cost reservations are allowed", async () => {
  const { rpc, calls } = rpcReturning("reserved");
  expect((await budget.reserveAdapterBudget(rpc, { ...reserveInput, amountMicros: 0 })).allowed).toBe(true);
  expect(calls[0][1].p_amount_micros).toBe(0);
});
