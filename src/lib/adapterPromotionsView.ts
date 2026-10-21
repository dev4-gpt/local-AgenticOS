/**
 * What the promotion review screen shows, built from the rows the list route returns.
 *
 * Pure functions with no network, environment or server-only imports (so the screen can use it in the browser). The
 * database is still the authority: it refuses the requester, plain members, a blocked scan, a flagged scan without a
 * written reason, a wrong content hash and a promotion that is already decided. This module only decides which buttons
 * to offer and how to describe each promotion, and it rejects any answer that does not look right instead of guessing.
 * A reviewer can approve only when they can read the note itself, the scan covers exactly that note, and the scan did
 * not block it.
 */
import { PROMOTION_STATUSES, isSha256Hex, isValidAdapterId } from "./adapterContracts";

export const MAX_PROMOTION_ROWS = 100;
export const MAX_NOTE_TEXT = 30_000;
export const FLAGGED_NOTE_MIN_CHARS = 20;
export const SENSITIVE_NOTE_MIN_CHARS = 20;
export const REVOKE_REASON_MIN_CHARS = 5;
export const REVOKE_REASON_MAX_CHARS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];
/** The two labels a reviewer can give (QM-6a). A note that must never be shared is rejected, not labelled. Mirrors adapterMemoryGuard.ts; a test keeps them equal. */
export type ApprovableLabel = "ordinary" | "sensitive";
export type NoteSensitivity = ApprovableLabel | "restricted" | "unknown";
export const LABEL_CHOICES: ReadonlyArray<{ value: ApprovableLabel; title: string; help: string }> = [
  { value: "ordinary", title: "Ordinary", help: "Clearly harmless, safe to mention to any coworker." },
  { value: "sensitive", title: "Sensitive", help: `Private personal, financial or confidential details. Needs your written reason (at least ${SENSITIVE_NOTE_MIN_CHARS} characters), and it stays out of model prompts by default.` },
];
const NOTE_SENSITIVITIES: readonly string[] = ["ordinary", "sensitive", "restricted", "unknown"];
const SENSITIVITY_TITLE: Record<NoteSensitivity, string> = { ordinary: "Ordinary", sensitive: "Sensitive", restricted: "Restricted", unknown: "Not labelled" };
export type ScanVerdict = "clean" | "flagged" | "blocked";
export type Tone = "waiting" | "good" | "bad" | "muted";

export interface ScanFindingView { rule: string; label: string; severity: "high" | "medium"; count: number; sample: string }
export interface ProvenanceRow {
  adapterId: string; adapterVersion: string; agentPrincipal: string; sourceTaskId: string;
  /** Null when the adapter reported none; shown as "not reported", never as 0%. */
  sourceUrl: string | null; sourceSha256: string | null; confidence: number | null; createdAt: string;
}
export interface PromotionRow {
  id: string; sourceItemId: string; adapterId: string; contentSha256: string; status: PromotionStatus;
  scanVerdict: ScanVerdict | null; scanContentSha256: string | null; scanFindings: ScanFindingView[];
  /** A person's id, or null when an adapter asked: exactly one of requestedBy and requestedByAdapter is set. */
  requestedBy: string | null; requestedByAdapter: string | null; reviewedBy: string | null; reviewedAt: string | null; decisionNote: string | null; createdAt: string;
  sourceContent: string | null; provenance: ProvenanceRow[]; alreadySharedItemId: string | null; approvedSensitivity: ApprovableLabel | null;
}
export interface SharedNoteRow { id: string; adapterId: string; content: string; contentSha256: string; promotionId: string; createdAt: string; sensitivity: NoteSensitivity }
export interface ParsedPromotions { promotions: PromotionRow[]; sharedNotes: SharedNoteRow[]; viewerId: string; canDecide: boolean }

const isTime = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

const RULE_LABELS: Record<string, string> = {
  instruction_override: "Tries to give orders to whoever reads it",
  concealment: "Asks to hide something from a person",
  special_token: "Contains model control markers",
  tool_call_syntax: "Contains tool-call markup",
  dangerous_command: "Contains a dangerous command",
  url_credentials: "A link with a username and password in it",
  secret: "Looks like a secret (key, token or password)",
  hidden_text: "Contains invisible or direction-changing characters",
  role_marker: "Has lines that look like a chat transcript (System:, User:)",
  impersonation: "Asks the reader to pretend or act as something",
  markdown_image: "Embeds an image from the web",
  data_uri: "Embeds data inside a link",
  shell_command: "Mentions a shell command",
  tool_request: "Asks the reader to run a tool or command",
  long_query_link: "A link with a very long query string",
  foreign_link_with_query: "A link to another site that carries data",
  encoded_blob: "A long run of encoded-looking text",
};
export const ruleLabel = (rule: string): string => RULE_LABELS[rule] ?? "Something the scanner flagged";

function parseFindings(value: unknown): ScanFindingView[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) return null;
  const out: ScanFindingView[] = [];
  for (const raw of value) {
    const f = obj(raw);
    if (!f || typeof f.rule !== "string" || f.rule.length > 60 || (f.severity !== "high" && f.severity !== "medium")) return null;
    if (!Number.isSafeInteger(f.count) || (f.count as number) < 0 || !isText(f.sample, 200)) return null;
    out.push({ rule: f.rule, label: ruleLabel(f.rule), severity: f.severity, count: f.count as number, sample: f.sample });
  }
  return out;
}

function parseProvenance(value: unknown): ProvenanceRow[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const out: ProvenanceRow[] = [];
  for (const raw of value) {
    const p = obj(raw);
    if (!p || !isValidAdapterId(p.adapter_id) || !isText(p.adapter_version, 40) || !isText(p.agent_principal, 120) || !isText(p.source_task_id, 128)) return null;
    if (!(p.confidence == null || (typeof p.confidence === "number" && p.confidence >= 0 && p.confidence <= 1)) || !isTime(p.created_at)) return null;
    if (!(p.source_url == null || isText(p.source_url, 2048)) || !(p.source_sha256 == null || isSha256Hex(p.source_sha256))) return null;
    out.push({
      adapterId: p.adapter_id, adapterVersion: p.adapter_version, agentPrincipal: p.agent_principal, sourceTaskId: p.source_task_id,
      sourceUrl: (p.source_url as string | null | undefined) ?? null, sourceSha256: (p.source_sha256 as string | null | undefined) ?? null,
      confidence: (p.confidence as number | null | undefined) ?? null, createdAt: p.created_at,
    });
  }
  return out;
}

/** Validates the list route's answer. Returns null if anything is off, so the screen says "unavailable" instead of guessing. */
export function parsePromotionsResponse(body: unknown): ParsedPromotions | null {
  const b = obj(body);
  if (!b || b.ok !== true || !Array.isArray(b.promotions) || b.promotions.length > MAX_PROMOTION_ROWS) return null;
  if (!Array.isArray(b.sharedNotes) || b.sharedNotes.length > MAX_PROMOTION_ROWS) return null;
  if (typeof b.viewerId !== "string" || b.viewerId.length < 1 || b.viewerId.length > 64 || typeof b.canDecide !== "boolean") return null;
  const promotions: PromotionRow[] = [];
  for (const raw of b.promotions) {
    const r = obj(raw);
    if (!r || !isUuid(r.id) || !isUuid(r.source_item_id) || !isValidAdapterId(r.origin_adapter_id) || !isSha256Hex(r.content_sha256)) return null;
    if (typeof r.status !== "string" || !(PROMOTION_STATUSES as readonly string[]).includes(r.status)) return null;
    if (!(r.reviewed_by == null || isUuid(r.reviewed_by)) || !(r.reviewed_at == null || isTime(r.reviewed_at)) || !isTime(r.created_at)) return null;
    // Exactly one requester: a person, or the adapter that owns the note (the database enforces the same rule).
    const byPerson = r.requested_by == null ? null : isUuid(r.requested_by) ? r.requested_by : undefined;
    const byAdapter = r.requested_by_adapter == null ? null : isValidAdapterId(r.requested_by_adapter) && r.requested_by_adapter === r.origin_adapter_id ? r.requested_by_adapter : undefined;
    if (byPerson === undefined || byAdapter === undefined || (byPerson === null) === (byAdapter === null)) return null;
    if (!(r.decision_note == null || isText(r.decision_note, 2000)) || !(r.source_content == null || isText(r.source_content, MAX_NOTE_TEXT))) return null;
    const scan = obj(r.scan_result) ?? {};
    const verdict = scan.verdict === "clean" || scan.verdict === "flagged" || scan.verdict === "blocked" ? scan.verdict : null;
    if (scan.verdict !== undefined && verdict === null) return null;
    const findings = parseFindings(scan.findings);
    const provenance = parseProvenance(r.provenance);
    if (findings === null || provenance === null || !(r.already_shared_item_id == null || isUuid(r.already_shared_item_id))) return null;
    if (!(r.approved_sensitivity == null || r.approved_sensitivity === "ordinary" || r.approved_sensitivity === "sensitive")) return null;
    promotions.push({
      id: r.id, sourceItemId: r.source_item_id, adapterId: r.origin_adapter_id, contentSha256: r.content_sha256, status: r.status as PromotionStatus,
      scanVerdict: verdict, scanContentSha256: typeof scan.content_sha256 === "string" ? scan.content_sha256 : null, scanFindings: findings,
      requestedBy: byPerson, requestedByAdapter: byAdapter, reviewedBy: (r.reviewed_by as string | null | undefined) ?? null, reviewedAt: (r.reviewed_at as string | null | undefined) ?? null,
      decisionNote: (r.decision_note as string | null | undefined) ?? null, createdAt: r.created_at,
      sourceContent: (r.source_content as string | null | undefined) ?? null, provenance, alreadySharedItemId: (r.already_shared_item_id as string | null | undefined) ?? null,
      approvedSensitivity: (r.approved_sensitivity as ApprovableLabel | null | undefined) ?? null,
    });
  }
  const sharedNotes: SharedNoteRow[] = [];
  for (const raw of b.sharedNotes) {
    const s = obj(raw);
    if (!s || !isUuid(s.id) || !isValidAdapterId(s.origin_adapter_id) || !isText(s.content, MAX_NOTE_TEXT) || !isSha256Hex(s.content_sha256) || !isUuid(s.promotion_id) || !isTime(s.created_at)) return null;
    // A note shared before labels existed has none; it is shown as not labelled, never as ordinary.
    if (!(s.sensitivity === undefined || (typeof s.sensitivity === "string" && NOTE_SENSITIVITIES.includes(s.sensitivity)))) return null;
    sharedNotes.push({ id: s.id, adapterId: s.origin_adapter_id, content: s.content, contentSha256: s.content_sha256, promotionId: s.promotion_id, createdAt: s.created_at, sensitivity: (s.sensitivity as NoteSensitivity | undefined) ?? "unknown" });
  }
  return { promotions, sharedNotes, viewerId: b.viewerId, canDecide: b.canDecide };
}

// Characters that show as nothing or change the order of text. A reviewer must see them, not be fooled by them.
const HIDDEN = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ\u{E0000}-\u{E007F}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu;

/** Makes invisible characters visible, as [U+200B], so what is on screen is what is in the note. */
export function showHiddenCharacters(text: string): { text: string; hiddenCount: number } {
  let count = 0;
  const shown = text.replace(HIDDEN, (ch) => {
    count += 1;
    return `[U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}]`;
  });
  return { text: shown, hiddenCount: count };
}

const VERDICT_TEXT: Record<ScanVerdict, { label: string; summary: string }> = {
  clean: { label: "No common attack patterns", summary: "The scan found nothing it recognises. That is a tripwire, not a guarantee: read the note yourself." },
  flagged: { label: "Look twice", summary: "Something here needs a second look. You can approve it only with a written reason of at least 20 characters." },
  blocked: { label: "Blocked by the scan", summary: "This note looks like an attack or carries something that must not spread. It cannot be approved; the adapter must rewrite it." },
};
const STATUS_TEXT: Record<PromotionStatus, { label: string; tone: Tone }> = {
  quarantined: { label: "Waiting for review", tone: "waiting" },
  approved: { label: "Approved", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
  withdrawn: { label: "Withdrawn", tone: "muted" },
};

export interface PromotionCard {
  id: string;
  adapterId: string;
  status: PromotionStatus;
  statusLabel: string;
  tone: Tone;
  open: boolean;
  requestedByLabel: string;
  reviewedByLabel: string | null;
  createdAt: string;
  contentHash: string;
  shortHash: string;
  /** The note as written, with invisible characters made visible. Null when this person cannot read it. */
  content: string | null;
  hiddenCharacterCount: number;
  contentUnavailable: string | null;
  verdict: ScanVerdict | null;
  verdictLabel: string;
  verdictSummary: string;
  findings: ScanFindingView[];
  provenanceLines: string[];
  alreadyShared: boolean;
  decisionNote: string | null;
  canApprove: boolean;
  canReject: boolean;
  /** 0 when no written reason is needed by the scan alone; a "sensitive" label adds its own minimum (see minNoteChars). */
  noteMinChars: number;
  blockedReason: string | null;
  /** The label the reviewer gave, for a promotion already approved. */
  labelTitle: string | null;
}

const who = (id: string | null, adapter: string | null, viewerId: string) =>
  adapter ? `The ${adapter} adapter` : id === viewerId ? "You" : "Another member";

function provenanceLine(p: ProvenanceRow): string {
  const parts = [`${p.adapterId} ${p.adapterVersion}`, `agent ${p.agentPrincipal}`, `task ${p.sourceTaskId}`, p.confidence === null ? "confidence not reported" : `confidence ${Math.round(p.confidence * 100)}%`];
  if (p.sourceUrl) parts.push(`source ${p.sourceUrl}`);
  if (p.sourceSha256) parts.push(`source fingerprint ${p.sourceSha256.slice(0, 12)}…`);
  return parts.join(" · ");
}

export function buildPromotionCards(parsed: ParsedPromotions): PromotionCard[] {
  const cards = parsed.promotions.map((row): PromotionCard => {
    const open = row.status === "quarantined";
    const verdict = row.scanVerdict;
    const shown = row.sourceContent === null ? null : showHiddenCharacters(row.sourceContent);
    const scanCoversNote = verdict !== null && row.scanContentSha256 === row.contentSha256;
    let blockedReason: string | null = null;
    if (open && !parsed.canDecide) blockedReason = "Only owners and admins can approve or reject.";
    else if (open && row.requestedBy === parsed.viewerId) blockedReason = "You asked for this, so a different owner or admin has to decide.";
    const canReject = open && blockedReason === null;
    let canApprove = canReject;
    if (canReject) {
      if (verdict === "blocked") { canApprove = false; blockedReason = "Blocked by the scan: it can only be rejected."; }
      else if (!scanCoversNote) { canApprove = false; blockedReason = "There is no scan of exactly this note, so it can only be rejected."; }
      else if (shown === null) { canApprove = false; blockedReason = "You cannot read the note itself here, so it cannot be approved from this screen. It can be rejected."; }
      else if (row.alreadySharedItemId) { canApprove = false; blockedReason = "This exact fact is already shared, so there is nothing to approve. It can be rejected."; }
    }
    const verdictText = verdict ? VERDICT_TEXT[verdict] : { label: "Not scanned", summary: "There is no scan result for this promotion. It cannot be approved." };
    return {
      id: row.id,
      adapterId: row.adapterId,
      status: row.status,
      statusLabel: STATUS_TEXT[row.status].label,
      tone: STATUS_TEXT[row.status].tone,
      open,
      requestedByLabel: who(row.requestedBy, row.requestedByAdapter, parsed.viewerId),
      reviewedByLabel: row.reviewedBy ? who(row.reviewedBy, null, parsed.viewerId) : null,
      createdAt: row.createdAt,
      contentHash: row.contentSha256,
      shortHash: row.contentSha256.slice(0, 12),
      content: shown ? shown.text : null,
      hiddenCharacterCount: shown ? shown.hiddenCount : 0,
      contentUnavailable: shown ? null : parsed.canDecide ? "The note could not be read." : "Only owners and admins can read the note itself.",
      verdict,
      verdictLabel: verdictText.label,
      verdictSummary: verdictText.summary,
      findings: row.scanFindings,
      provenanceLines: row.provenance.map(provenanceLine),
      alreadyShared: row.alreadySharedItemId !== null,
      decisionNote: row.decisionNote,
      canApprove,
      canReject,
      noteMinChars: canApprove && verdict === "flagged" ? FLAGGED_NOTE_MIN_CHARS : 0,
      blockedReason,
      labelTitle: row.approvedSensitivity ? SENSITIVITY_TITLE[row.approvedSensitivity] : null,
    };
  });
  return cards.sort((a, b) => (a.open === b.open ? (a.open ? Date.parse(a.createdAt) - Date.parse(b.createdAt) : Date.parse(b.createdAt) - Date.parse(a.createdAt)) : a.open ? -1 : 1));
}

export function waitingPromotionCount(cards: PromotionCard[]): number {
  return cards.filter((c) => c.open).length;
}

/** The shortest written reason the decision needs: the scan may ask for one, and so does a "sensitive" label. */
export function minNoteChars(card: PromotionCard, label: ApprovableLabel | null | undefined): number {
  return Math.max(card.noteMinChars, label === "sensitive" ? SENSITIVE_NOTE_MIN_CHARS : 0);
}

/** True when the written reason is long enough for the decision about to be made. */
export function reasonIsEnough(card: PromotionCard, note: string, label?: ApprovableLabel | null): boolean {
  const min = minNoteChars(card, label);
  return min === 0 || note.trim().length >= min;
}

/** Approving needs a label; the button stays off until the reviewer has chosen one and written enough. */
export function canSubmitApproval(card: PromotionCard, note: string, label: ApprovableLabel | null | undefined): boolean {
  return card.canApprove && (label === "ordinary" || label === "sensitive") && reasonIsEnough(card, note, label);
}

export interface SharedNoteCard { id: string; adapterId: string; content: string; hiddenCharacterCount: number; shortHash: string; createdAt: string; canRevoke: boolean; sensitivity: NoteSensitivity; sensitivityTitle: string }

export function buildSharedNoteCards(parsed: ParsedPromotions): SharedNoteCard[] {
  return [...parsed.sharedNotes]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((note) => {
      const shown = showHiddenCharacters(note.content);
      return { id: note.id, adapterId: note.adapterId, content: shown.text, hiddenCharacterCount: shown.hiddenCount, shortHash: note.contentSha256.slice(0, 12), createdAt: note.createdAt, canRevoke: parsed.canDecide, sensitivity: note.sensitivity, sensitivityTitle: SENSITIVITY_TITLE[note.sensitivity] };
    });
}

export const revokeReasonIsEnough = (reason: string): boolean => reason.trim().length >= REVOKE_REASON_MIN_CHARS && reason.trim().length <= REVOKE_REASON_MAX_CHARS;

/** Plain words for the errors the routes can return. Anything unknown becomes a safe generic message. */
export function promotionErrorMessage(code: unknown): string {
  switch (code) {
    case "requester_cannot_decide": return "You asked for this, so someone else has to decide.";
    case "not_pending": return "This promotion was already decided. Refresh to see where it stands.";
    case "hash_mismatch": return "The note changed while you were looking. Refresh and read it again.";
    case "blocked_by_scan": return "The scan blocked this note, so it cannot be approved.";
    case "scan_required": return "There is no usable scan of this note, so it cannot be approved.";
    case "note_required": return `A flagged or sensitive note needs a written reason of at least ${FLAGGED_NOTE_MIN_CHARS} characters.`;
    case "sensitivity_required": return "Choose whether the note is ordinary or sensitive before approving it. If it must never be shared, reject it.";
    case "not_found": return "This was not found. It may have expired or been removed.";
    case "not_allowed": return "Only owners and admins can do this.";
    case "not_shared": return "Only shared notes can be withdrawn.";
    case "invalid_input": return "That could not be sent. Check the text and try again.";
    case "adapter_host_disabled": return "The adapter host is not switched on.";
    case "runtime_rate_limited": return "Too many attempts. Wait a little and try again.";
    default: return "That could not be recorded. Nothing was changed.";
  }
}
