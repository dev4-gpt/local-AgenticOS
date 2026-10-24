/**
 * What the "Recent activity" panel on the Adapters page shows, built from client_adapter_activity_counts rows.
 *
 * Pure functions with no environment or network access. Counts only: no payloads, ids or text from events ever
 * reach this code. Anything that does not look right is rejected (null) instead of shown.
 */
import { isValidAdapterId } from "./adapterContracts";

export const ACTIVITY_WINDOW_DAYS = 28;
export const MAX_ACTIVITY_ROWS = 400;

const EVENT_LABELS = {
  "approval.requested": "Approvals requested",
  "approval.decided": "Approvals decided",
  "approval.executed": "Approvals executed",
  "memory.committed": "Shared memory committed",
  "memory.tombstoned": "Memory deleted",
  "memory.proposed": "Proposals received",
  "memory.erased": "Erasures confirmed",
  "task.requested": "Tasks requested",
  "promotion.decided": "Shared memory decisions",
  "token.use": "Adapter calls authorised",
  "budget.reserve": "Budget reserved",
  "budget.settle": "Budget settled",
  "budget.release": "Budget released",
} as const;

export type ActivityEventType = keyof typeof EVENT_LABELS;
export const ACTIVITY_EVENT_TYPES = Object.keys(EVENT_LABELS) as ActivityEventType[];

export interface ActivityRow {
  /** Null for events that belong to no single adapter. */
  adapterId: string | null;
  eventType: ActivityEventType;
  count: number;
}

export interface ActivityLine {
  eventType: ActivityEventType;
  label: string;
  count: number;
}

export interface ActivityGroup {
  adapterId: string | null;
  lines: ActivityLine[];
  total: number;
}

const isEventType = (value: unknown): value is ActivityEventType => typeof value === "string" && Object.hasOwn(EVENT_LABELS, value);

/** Validates the rows from client_adapter_activity_counts. Returns null if anything is off. */
export function parseActivityRows(value: unknown): ActivityRow[] | null {
  if (!Array.isArray(value) || value.length > MAX_ACTIVITY_ROWS) return null;
  const rows: ActivityRow[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const adapterId = r.adapter_id ?? null;
    if (adapterId !== null && !isValidAdapterId(adapterId)) return null;
    if (!isEventType(r.event_type)) return null;
    if (!Number.isSafeInteger(r.event_count) || (r.event_count as number) < 1) return null;
    rows.push({ adapterId: adapterId as string | null, eventType: r.event_type, count: r.event_count as number });
  }
  return rows;
}

/** One group per adapter, lines in a fixed order, adapters sorted by id (tenant-wide events last). */
export function buildActivityGroups(rows: ActivityRow[]): ActivityGroup[] {
  const byAdapter = new Map<string | null, Map<ActivityEventType, number>>();
  for (const row of rows) {
    const lines = byAdapter.get(row.adapterId) ?? new Map<ActivityEventType, number>();
    lines.set(row.eventType, (lines.get(row.eventType) ?? 0) + row.count);
    byAdapter.set(row.adapterId, lines);
  }
  return [...byAdapter.entries()]
    .map(([adapterId, counts]) => {
      const lines = ACTIVITY_EVENT_TYPES.filter((type) => counts.has(type)).map((type) => ({ eventType: type, label: EVENT_LABELS[type], count: counts.get(type) as number }));
      return { adapterId, lines, total: lines.reduce((sum, line) => sum + line.count, 0) };
    })
    .sort((a, b) => (a.adapterId === null ? 1 : b.adapterId === null ? -1 : a.adapterId.localeCompare(b.adapterId)));
}
