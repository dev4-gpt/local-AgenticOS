import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OPENROUTER_MANAGED_ROUTE } from "../src/lib/managedProviderAdapter";

type ReservationStatus = "reserved" | "settled" | "refunded" | "expired";

type Reservation = {
  id: string;
  idempotencyKey: string;
  quotedMicros: number;
  status: ReservationStatus;
  actualMicros: number;
  expiresAt: number;
};

class LifecycleHarness {
  private nextId = 1;
  private readonly reservations = new Map<string, Reservation>();

  constructor(private balanceMicros: number) {}

  reserve(idempotencyKey: string, quotedMicros: number, expiresAt = Date.now() + 60_000) {
    const prior = this.reservations.get(idempotencyKey);
    if (prior) return prior;
    if (!Number.isSafeInteger(quotedMicros) || quotedMicros <= 0 || quotedMicros > this.balanceMicros) return null;
    const reservation: Reservation = {
      id: "reservation-" + this.nextId++,
      idempotencyKey,
      quotedMicros,
      status: "reserved",
      actualMicros: 0,
      expiresAt,
    };
    this.balanceMicros -= quotedMicros;
    this.reservations.set(idempotencyKey, reservation);
    return reservation;
  }

  settle(reservationId: string, actualMicros: number) {
    const reservation = [...this.reservations.values()].find((item) => item.id === reservationId);
    if (!reservation || reservation.status === "expired" || reservation.status === "refunded") return false;
    if (reservation.status === "settled") return true;
    if (actualMicros < 0 || actualMicros > reservation.quotedMicros || Date.now() > reservation.expiresAt) return false;
    this.balanceMicros += reservation.quotedMicros - actualMicros;
    reservation.actualMicros = actualMicros;
    reservation.status = "settled";
    return true;
  }

  refund(reservationId: string) {
    const reservation = [...this.reservations.values()].find((item) => item.id === reservationId);
    if (!reservation) return false;
    if (reservation.status === "refunded" || reservation.status === "expired") return true;
    if (reservation.status === "reserved") this.balanceMicros += reservation.quotedMicros;
    else if (reservation.status === "settled") this.balanceMicros += reservation.actualMicros;
    else return false;
    reservation.status = "refunded";
    return true;
  }

  expire(now = Date.now()) {
    let count = 0;
    for (const reservation of this.reservations.values()) {
      if (reservation.status === "reserved" && reservation.expiresAt <= now) {
        this.balanceMicros += reservation.quotedMicros;
        reservation.status = "expired";
        count += 1;
      }
    }
    return count;
  }
}

const migrationPath = resolve(process.cwd(), "product-experience/supabase-v33-managed-credit-lifecycle.sql");
const webhookPath = resolve(process.cwd(), "product-experience/src/app/api/billing/webhook/route.ts");
const executionClaimsPath = resolve(process.cwd(), "product-experience/supabase-v34-managed-credit-execution-claims.sql");
const reserveRepairPath = resolve(process.cwd(), "product-experience/supabase-v35-reserve-client-credit-fix.sql");

test("reservation succeeds and duplicate reservation is idempotent", () => {
  const ledger = new LifecycleHarness(1_000_000);
  const first = ledger.reserve("job-1", 400_000);
  const duplicate = ledger.reserve("job-1", 400_000);

  expect(first?.id).toBe(duplicate?.id);
  expect(first?.status).toBe("reserved");
});

test("insufficient allocation fails without creating a reservation", () => {
  const ledger = new LifecycleHarness(100_000);

  expect(ledger.reserve("job-too-large", 100_001)).toBeNull();
});

test("settlement records actual usage and rejects an overrun", () => {
  const ledger = new LifecycleHarness(1_000_000);
  const reservation = ledger.reserve("job-2", 400_000);

  expect(reservation).not.toBeNull();
  expect(ledger.settle(reservation!.id, 400_001)).toBe(false);
  expect(ledger.settle(reservation!.id, 250_000)).toBe(true);
  expect(ledger.settle(reservation!.id, 250_000)).toBe(true);
});

test("provider failure refunds a reservation and expiration releases stale funds", () => {
  const ledger = new LifecycleHarness(1_000_000);
  const failed = ledger.reserve("job-failed", 300_000);
  const stale = ledger.reserve("job-stale", 200_000, Date.now() - 1);

  expect(ledger.refund(failed!.id)).toBe(true);
  expect(ledger.refund(failed!.id)).toBe(true);
  expect(ledger.expire()).toBe(1);
  expect(stale?.status).toBe("expired");
});

test("tracked SQL contains the lifecycle tables, gates, and server functions", () => {
  const sql = readFileSync(migrationPath, "utf8");

  for (const fragment of [
    "client_credit_purchase_plan_allocations",
    "client_credit_reservations",
    "client_credit_reservation_events",
    "sync_client_credit_purchase_plan_allocations",
    "reserve_client_credit",
    "settle_client_credit",
    "refund_client_credit",
    "expire_client_credit_reservations",
    "provider_request_id",
    "reconciliation_status",
    "audit_metadata",
    "managed_route_enabled = true",
    "and provider_key = plan_allocation.provider_key\n    for update;",
    "and provider_key = plan_allocation.provider_key;\n\n    update public.client_credit_purchase_plan_allocations",
    "greatest(0, p_amount_micros - plan_row.refunded_micros)",
    "revoke all on public.client_credit_purchase_plan_allocations",
    "new_reservation_id uuid",
    "return new_reservation_id",
  ]) {
    expect(sql).toContain(fragment);
  }
});

test("reservation-event writes use an unambiguous reservation variable in fresh and repaired schemas", () => {
  for (const path of [migrationPath, reserveRepairPath]) {
    const sql = readFileSync(path, "utf8");
    expect(sql).toContain("new_reservation_id uuid");
    expect(sql).toMatch(/reservation_id,\s+tenant_slug,\s+event_type/);
    expect(sql).toMatch(/new_reservation_id,\s+p_tenant_slug,\s+'reserved'/);
    expect(sql).not.toMatch(/\breservation_id uuid;/);
  }
});

test("Stripe lifecycle events remain signature-verified and idempotent", () => {
  const source = readFileSync(webhookPath, "utf8");

  expect(source).toContain("await request.text()");
  expect(source).toContain("verifyStripeSignature");
  expect(source).toContain("stripe_webhook_events");
  for (const eventType of [
    "checkout.session.completed",
    "checkout.session.expired",
    "payment_intent.payment_failed",
    "charge.refunded",
    "charge.dispute.created",
    "failure_reason",
    "event_store_failed",
  ]) {
    expect(source).toContain(eventType);
  }
});

test("failed PaymentIntent preserves a pending purchase for Checkout retry", () => {
  const sql = readFileSync(migrationPath, "utf8");

  expect(sql).toContain("when p_event_type = 'checkout.session.expired' and status = 'pending' then 'expired'");
  expect(sql).toContain("-- Stripe can retry the same open Checkout Session with a new payment");
  expect(sql).not.toContain("then 'expired' else 'cancelled' end");
});

test("OpenRouter managed execution remains disabled", () => {
  expect(OPENROUTER_MANAGED_ROUTE.enabled).toBe(false);
});

test("provider spend requires one atomic tenant-matched reservation claim", () => {
  const sql = readFileSync(executionClaimsPath, "utf8");

  for (const fragment of [
    "client_credit_execution_claims",
    "claim_client_credit_reservation",
    "reservation_row.status <> 'reserved'",
    "reservation_row.expires_at <= now()",
    "reservation_row.tenant_slug <> p_tenant_slug",
    "reservation_row.catalog_id <> p_catalog_id",
    "reservation_row.provider_key <> p_provider_key",
    "reservation_row.reserved_amount_micros <> p_reserved_amount_micros",
    "reservation_row.pricing_snapshot_id is null",
    "reservation_row.pricing_snapshot_id <> p_pricing_snapshot_id",
    "references public.client_pricing_snapshots(id)",
    "on conflict do nothing",
    "from public, anon, authenticated",
  ]) expect(sql).toContain(fragment);
});
