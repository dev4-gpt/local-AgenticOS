/**
 * What the "Spend check" panel on the Adapters page shows, built from client_adapter_budget_reconcile_counts rows
 * (ADR-016). It compares the cost an adapter reports for a finished task with the host's own budget ledger.
 *
 * Pure functions with no environment or network access. Counts only: no task ids or amounts reach this code. Anything
 * that does not look right is rejected (null) instead of shown. It only flags: nothing here settles or blocks anything.
 */
import { isValidAdapterId } from "./adapterContracts";

export const SPEND_WINDOW_DAYS = 28;
export const MAX_SPEND_ROWS = 100;

const STATUS_LABELS = {
  unreserved: "Spent without a reservation",
  over_reserved: "Spent more than reserved",
  settled_differs: "Settled amount differs",
  open: "Reservation still open",
  matched: "Agrees with the ledger",
} as const;

export type SpendStatus = keyof typeof STATUS_LABELS;
/** Fixed display order: the ones that need a look first. */
export const SPEND_STATUSES = ["unreserved", "over_reserved", "settled_differs", "open", "matched"] as const satisfies readonly SpendStatus[];
/** The statuses that mean the adapter's number and the ledger disagree. An open reservation is just not closed yet. */
export const FLAGGED_STATUSES: readonly SpendStatus[] = ["unreserved", "over_reserved", "settled_differs"];

export interface SpendRow {
  adapterId: string;
  status: SpendStatus;
  count: number;
}

export interface SpendLine {
  status: SpendStatus;
  label: string;
  count: number;
}

export interface SpendGroup {
  adapterId: string;
  lines: SpendLine[];
  /** Tasks whose reported spend and the ledger disagree. */
  flagged: number;
  total: number;
}

const isStatus = (value: unknown): value is SpendStatus => typeof value === "string" && Object.hasOwn(STATUS_LABELS, value);

/** Validates the rows from client_adapter_budget_reconcile_counts. Returns null if anything is off. */
export function parseSpendRows(value: unknown): SpendRow[] | null {
  if (!Array.isArray(value) || value.length > MAX_SPEND_ROWS) return null;
  const rows: SpendRow[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (!isValidAdapterId(r.adapter_id)) return null;
    if (!isStatus(r.status)) return null;
    if (!Number.isSafeInteger(r.task_count) || (r.task_count as number) < 1) return null;
    rows.push({ adapterId: r.adapter_id as string, status: r.status, count: r.task_count as number });
  }
  return rows;
}

/** One group per adapter, lines in a fixed order, adapters sorted by id. */
export function buildSpendGroups(rows: SpendRow[]): SpendGroup[] {
  const byAdapter = new Map<string, Map<SpendStatus, number>>();
  for (const row of rows) {
    const lines = byAdapter.get(row.adapterId) ?? new Map<SpendStatus, number>();
    lines.set(row.status, (lines.get(row.status) ?? 0) + row.count);
    byAdapter.set(row.adapterId, lines);
  }
  return [...byAdapter.entries()]
    .map(([adapterId, counts]) => {
      const lines = SPEND_STATUSES.filter((status) => counts.has(status)).map((status) => ({ status, label: STATUS_LABELS[status], count: counts.get(status) as number }));
      return {
        adapterId,
        lines,
        flagged: lines.filter((line) => FLAGGED_STATUSES.includes(line.status)).reduce((sum, line) => sum + line.count, 0),
        total: lines.reduce((sum, line) => sum + line.count, 0),
      };
    })
    .sort((a, b) => a.adapterId.localeCompare(b.adapterId));
}
