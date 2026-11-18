/**
 * What the Adapters page and the Budget tab show, built from the rows the database returns.
 *
 * Pure functions with no environment or network access, so they are easy to test. Anything that does not look
 * right is rejected (null) rather than shown: a screen that shows a wrong money figure is worse than one that
 * says it is unavailable.
 */
import { ADAPTER_STATES, DELETION_GUARANTEES, SIDE_EFFECT_CLASSES, isValidAdapterId } from "./adapterContracts";

export const BUDGET_WARNING_FRACTION = 0.8;
export const MAX_ADAPTER_ROWS = 200;
const PERIODS = ["day", "month", "total"] as const;

export type AdapterState = (typeof ADAPTER_STATES)[number];
export type SideEffectClass = (typeof SIDE_EFFECT_CLASSES)[number];
export type DeletionGuarantee = (typeof DELETION_GUARANTEES)[number];
export type CapPeriod = (typeof PERIODS)[number];
export type CapStatus = "no-cap" | "ok" | "warning" | "exhausted";

export interface AdapterSummaryRow {
  adapterId: string;
  displayName: string;
  state: AdapterState;
  sideEffectCeiling: SideEffectClass;
  deletionGuarantee: DeletionGuarantee;
  budgetCapMicros: number | null;
  budgetPeriod: CapPeriod | null;
  spentPeriodMicros: number;
  spentMonthMicros: number;
  openReservations: number;
}

export interface AdapterCard extends AdapterSummaryRow {
  usedFraction: number | null;
  capStatus: CapStatus;
  deletionLabel: string;
  riskLabel: string;
  stateLabel: string;
}

const isMicros = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);

/** Validates the rows from client_adapter_budget_summary. Returns null if anything is off. */
export function parseSummaryRows(value: unknown): AdapterSummaryRow[] | null {
  if (!Array.isArray(value) || value.length > MAX_ADAPTER_ROWS) return null;
  const rows: AdapterSummaryRow[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const cap = r.budget_cap_micros ?? null;
    const period = r.budget_period ?? null;
    if (!isValidAdapterId(r.adapter_id) || typeof r.display_name !== "string" || r.display_name.length < 1 || r.display_name.length > 120) return null;
    if (!oneOf(ADAPTER_STATES, r.state) || !oneOf(SIDE_EFFECT_CLASSES, r.side_effect_ceiling) || !oneOf(DELETION_GUARANTEES, r.deletion_guarantee)) return null;
    if ((cap === null) !== (period === null)) return null;
    if (cap !== null && !isMicros(cap)) return null;
    if (period !== null && !oneOf(PERIODS, period)) return null;
    if (!isMicros(r.spent_period_micros) || !isMicros(r.spent_month_micros)) return null;
    if (!Number.isSafeInteger(r.open_reservations) || (r.open_reservations as number) < 0) return null;
    rows.push({
      adapterId: r.adapter_id,
      displayName: r.display_name,
      state: r.state,
      sideEffectCeiling: r.side_effect_ceiling,
      deletionGuarantee: r.deletion_guarantee,
      budgetCapMicros: cap as number | null,
      budgetPeriod: period as CapPeriod | null,
      spentPeriodMicros: r.spent_period_micros,
      spentMonthMicros: r.spent_month_micros,
      openReservations: r.open_reservations as number,
    });
  }
  return rows;
}

const DELETION_LABELS: Record<DeletionGuarantee, string> = {
  none: "Outside the deletion guarantee: this adapter cannot prove it erased data",
  "host-owned": "Veloce holds the data, so Veloce can erase it",
  receipt: "Erases data and returns a receipt",
};
const RISK_LABELS: Record<SideEffectClass, string> = {
  read: "Read only",
  draft: "Can draft, nothing leaves",
  publish: "Can publish (needs two-person approval)",
};
const STATE_LABELS: Record<AdapterState, string> = {
  disabled: "Disabled",
  preview: "Preview",
  enabled: "Enabled",
  suspended: "Suspended",
};

export function capStatusOf(spent: number, cap: number | null): { fraction: number | null; status: CapStatus } {
  if (cap === null) return { fraction: null, status: "no-cap" };
  if (cap === 0) return { fraction: 1, status: "exhausted" }; // a zero cap means nothing may be spent
  const fraction = spent / cap;
  return { fraction, status: fraction >= 1 ? "exhausted" : fraction >= BUDGET_WARNING_FRACTION ? "warning" : "ok" };
}

export function buildAdapterCards(rows: AdapterSummaryRow[]): AdapterCard[] {
  return rows.map((row) => {
    const { fraction, status } = capStatusOf(row.spentPeriodMicros, row.budgetCapMicros);
    return {
      ...row,
      usedFraction: fraction,
      capStatus: status,
      deletionLabel: DELETION_LABELS[row.deletionGuarantee],
      riskLabel: RISK_LABELS[row.sideEffectCeiling],
      stateLabel: STATE_LABELS[row.state],
    };
  });
}

export interface BudgetBreakdown {
  tenantCapMicros: number;
  tenantSpentMicros: number;
  adapters: Array<{ adapterId: string; displayName: string; spentMonthMicros: number; shareOfTenantSpend: number }>;
  adapterTotalMicros: number;
  /** Tenant spending that did not come from an adapter. Shown as its own line so the parts add up to the total. */
  otherMicros: number;
  /** False when adapter spending is larger than the tenant total, which should not happen and means the two readings disagree. */
  reconciles: boolean;
}

export function buildBudgetBreakdown(rows: AdapterSummaryRow[], tenant: { capMicros: number; spentMicros: number }): BudgetBreakdown | null {
  if (!isMicros(tenant.capMicros) || !isMicros(tenant.spentMicros)) return null;
  if (!Array.isArray(rows) || !rows.every((row) => row && typeof row.adapterId === "string" && typeof row.displayName === "string" && isMicros(row.spentMonthMicros))) return null;
  const adapterTotal = rows.reduce((sum, row) => sum + row.spentMonthMicros, 0);
  if (!Number.isSafeInteger(adapterTotal)) return null;
  const share = (micros: number) => (tenant.spentMicros > 0 ? micros / tenant.spentMicros : 0);
  return {
    tenantCapMicros: tenant.capMicros,
    tenantSpentMicros: tenant.spentMicros,
    adapters: rows
      .filter((row) => row.spentMonthMicros > 0 || row.state !== "disabled")
      .map((row) => ({ adapterId: row.adapterId, displayName: row.displayName, spentMonthMicros: row.spentMonthMicros, shareOfTenantSpend: share(row.spentMonthMicros) }))
      .sort((a, b) => b.spentMonthMicros - a.spentMonthMicros || a.adapterId.localeCompare(b.adapterId)),
    adapterTotalMicros: adapterTotal,
    otherMicros: Math.max(0, tenant.spentMicros - adapterTotal),
    reconciles: adapterTotal <= tenant.spentMicros,
  };
}

/** Micros are millionths of a US dollar. Small amounts show as "<$0.01", never as "free". */
export function formatMicrosUsd(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars === 0) return "$0.00";
  if (dollars < 0.01) return "<$0.01";
  return `$${dollars.toFixed(2)}`;
}
