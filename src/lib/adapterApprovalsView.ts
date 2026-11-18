/**
 * What the approvals screen shows, built from the rows the list route returns.
 *
 * Pure functions with no network or environment access. The database is still the authority: it refuses a decision by
 * the requester, by a plain member, on an expired request, or with the wrong fingerprint. This module only decides
 * which buttons to offer and how to describe each request, and it rejects any row that does not look right rather
 * than guessing. A request with no stored text, or whose text disagrees with its own row, cannot be approved from here.
 */
import { APPROVAL_ACTION_KINDS, APPROVAL_STATUSES, isSha256Hex, isValidAdapterId } from "./adapterContracts";

export const MAX_APPROVAL_ROWS = 100;
const MAX_CANONICAL_CHARS = 16_384;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type ApprovalKind = (typeof APPROVAL_ACTION_KINDS)[number];
export type StatusTone = "waiting" | "good" | "bad" | "muted";

export interface ApprovalRow {
  id: string;
  adapterId: string;
  actionKind: ApprovalKind;
  actionHash: string;
  actionCanonical: string | null;
  destination: string;
  policyVersion: string;
  requestedBy: string;
  decidedBy: string | null;
  status: ApprovalStatus;
  expiresAt: string;
  decidedAt: string | null;
  executedAt: string | null;
  createdAt: string;
}

export interface ParsedApprovals {
  rows: ApprovalRow[];
  viewerId: string;
  canDecide: boolean;
}

export interface ApprovalContent {
  /** The payload that will be acted on, pretty-printed. Never shortened: the fingerprint covers all of it. */
  payloadText: string;
}

export interface ApprovalCard {
  id: string;
  adapterId: string;
  kind: ApprovalKind;
  kindLabel: string;
  destination: string;
  policyVersion: string;
  actionHash: string;
  shortHash: string;
  status: ApprovalStatus;
  /** What it counts as right now: a pending or approved request past its expiry is shown as expired. */
  effectiveStatus: ApprovalStatus;
  statusLabel: string;
  tone: StatusTone;
  requestedByLabel: string;
  decidedByLabel: string | null;
  timeLeftLabel: string;
  expiresAt: string;
  createdAt: string;
  content: ApprovalContent | null;
  contentProblem: string | null;
  canApprove: boolean;
  canReject: boolean;
  blockedReason: string | null;
}

const isTime = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const isNullableTime = (value: unknown): value is string | null => value === null || isTime(value);
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);

/** Validates the list route's answer. Returns null if anything is off, so the screen says "unavailable" instead of guessing. */
export function parseApprovalsResponse(body: unknown): ParsedApprovals | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.ok !== true || !Array.isArray(b.approvals) || b.approvals.length > MAX_APPROVAL_ROWS) return null;
  if (typeof b.viewerId !== "string" || b.viewerId.length < 1 || b.viewerId.length > 64 || typeof b.canDecide !== "boolean") return null;
  const rows: ApprovalRow[] = [];
  for (const raw of b.approvals) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const canonical = r.action_canonical ?? null;
    if (!isUuid(r.id) || !isValidAdapterId(r.adapter_id) || !oneOf(APPROVAL_ACTION_KINDS, r.action_kind) || !isSha256Hex(r.action_hash)) return null;
    if (canonical !== null && (typeof canonical !== "string" || canonical.length < 2 || canonical.length > MAX_CANONICAL_CHARS)) return null;
    if (typeof r.destination !== "string" || r.destination.length < 1 || r.destination.length > 500) return null;
    if (typeof r.policy_version !== "string" || r.policy_version.length < 1 || r.policy_version.length > 80) return null;
    if (!isUuid(r.requested_by) || !(r.decided_by === null || r.decided_by === undefined || isUuid(r.decided_by))) return null;
    if (!oneOf(APPROVAL_STATUSES, r.status) || !isTime(r.expires_at) || !isTime(r.created_at)) return null;
    if (!isNullableTime(r.decided_at ?? null) || !isNullableTime(r.executed_at ?? null)) return null;
    rows.push({
      id: r.id,
      adapterId: r.adapter_id,
      actionKind: r.action_kind,
      actionHash: r.action_hash,
      actionCanonical: canonical as string | null,
      destination: r.destination,
      policyVersion: r.policy_version,
      requestedBy: r.requested_by,
      decidedBy: (r.decided_by as string | null | undefined) ?? null,
      status: r.status,
      expiresAt: r.expires_at,
      decidedAt: (r.decided_at as string | null | undefined) ?? null,
      executedAt: (r.executed_at as string | null | undefined) ?? null,
      createdAt: r.created_at,
    });
  }
  return { rows, viewerId: b.viewerId, canDecide: b.canDecide };
}

const KIND_LABELS: Record<ApprovalKind, string> = {
  publish: "Publish something outside Veloce",
  promote: "Share a note with every adapter",
  "enable-adapter": "Turn an adapter on",
  "run-command": "Run a command",
};
const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "Waiting for a second person",
  approved: "Approved. The host runs it next",
  executed: "Done",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
};
const TONES: Record<ApprovalStatus, StatusTone> = { pending: "waiting", approved: "good", executed: "good", rejected: "bad", expired: "muted", cancelled: "muted" };

export function timeLeftLabel(expiresAt: string, now: number): string {
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Less than a minute left";
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min left`;
  return `${Math.floor(hours / 24)} days ${hours % 24} h left`;
}

/**
 * Reads the stored text. It must be a JSON object whose own kind, adapter, destination and policy version agree with the
 * row it belongs to. The database already guarantees this for new requests; the check here means a bad row is never
 * shown as if it were reviewable.
 */
export function readContent(row: ApprovalRow): { content: ApprovalContent | null; problem: string | null } {
  if (row.actionCanonical === null) return { content: null, problem: "This request has no stored text, so there is nothing to review." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.actionCanonical);
  } catch {
    return { content: null, problem: "The stored text could not be read." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { content: null, problem: "The stored text could not be read." };
  const c = parsed as Record<string, unknown>;
  if (c.kind !== row.actionKind || c.adapterId !== row.adapterId || c.destination !== row.destination || c.policyVersion !== row.policyVersion) {
    return { content: null, problem: "The stored text does not match this request." };
  }
  return { content: { payloadText: JSON.stringify(c.payload ?? null, null, 2) }, problem: null };
}

const who = (id: string, viewerId: string) => (id === viewerId ? "You" : "Another member");

export function buildApprovalCards(parsed: ParsedApprovals, now: number): ApprovalCard[] {
  const cards = parsed.rows.map((row): ApprovalCard => {
    const live = row.status === "pending" || row.status === "approved";
    const effectiveStatus: ApprovalStatus = live && Date.parse(row.expiresAt) <= now ? "expired" : row.status;
    const { content, problem } = readContent(row);
    const requestedByYou = row.requestedBy === parsed.viewerId;
    const open = effectiveStatus === "pending";
    let blockedReason: string | null = null;
    if (open && !parsed.canDecide) blockedReason = "Only owners and admins can approve or reject.";
    else if (open && requestedByYou) blockedReason = "You asked for this, so a different owner or admin has to decide.";
    const canReject = open && blockedReason === null;
    const canApprove = canReject && content !== null;
    // The problem itself is shown with the content; here only what that means for the buttons.
    if (canReject && !canApprove) blockedReason = "It can be rejected, but not approved.";
    return {
      id: row.id,
      adapterId: row.adapterId,
      kind: row.actionKind,
      kindLabel: KIND_LABELS[row.actionKind],
      destination: row.destination,
      policyVersion: row.policyVersion,
      actionHash: row.actionHash,
      shortHash: row.actionHash.slice(0, 12),
      status: row.status,
      effectiveStatus,
      statusLabel: STATUS_LABELS[effectiveStatus],
      tone: TONES[effectiveStatus],
      requestedByLabel: who(row.requestedBy, parsed.viewerId),
      decidedByLabel: row.decidedBy ? who(row.decidedBy, parsed.viewerId) : null,
      timeLeftLabel: live ? timeLeftLabel(row.expiresAt, now) : "",
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      content,
      contentProblem: problem,
      canApprove,
      canReject,
      blockedReason,
    };
  });
  const rank = (card: ApprovalCard) => (card.effectiveStatus === "pending" ? 0 : card.effectiveStatus === "approved" ? 1 : 2);
  return cards.sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank) return byRank;
    return rank(a) === 2 ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : Date.parse(a.expiresAt) - Date.parse(b.expiresAt);
  });
}

export function waitingCount(cards: ApprovalCard[]): number {
  return cards.filter((card) => card.effectiveStatus === "pending").length;
}

/** Plain words for the errors the decision route can return. Anything unknown becomes a safe generic message. */
export function decisionErrorMessage(code: unknown): string {
  switch (code) {
    case "requester_cannot_decide": return "You asked for this, so someone else has to decide.";
    case "not_pending": return "This request was already decided or has expired. Refresh to see where it stands.";
    case "hash_mismatch": return "The request changed while you were looking. Refresh and review it again.";
    case "not_found": return "This request was not found.";
    case "not_allowed": return "Only owners and admins can decide.";
    case "adapter_host_disabled": return "The adapter host is not switched on.";
    case "runtime_rate_limited": return "Too many attempts. Wait a little and try again.";
    default: return "The decision could not be recorded. Nothing was changed.";
  }
}
