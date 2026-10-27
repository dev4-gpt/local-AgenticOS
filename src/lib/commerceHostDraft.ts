/**
 * Server-only Commerce host dispatch seam. Reads no environment and grants no user identity.
 * The caller must be the verified host worker, supply fresh authorized Notebook/review rows,
 * a trusted runtime callback and the existing central-budget RPC. No route invokes this yet.
 * Worker tokens stay here; they are never sent in the draft payload. No payment authority exists here.
 */
import { createHash } from "node:crypto";
import { isValidTenantSlug, isValidAdapterId, assertMicros } from "./adapterContracts";
import { reserveAdapterBudget, settleAdapterBudget, releaseAdapterBudget, type BudgetRpc } from "./adapterBudget";
import { notebookSourceMetadataSha256, auditNotebookDraftCitations } from "./clientNotebookExecutionProvenance";
import { notebookSourceLinks, safeNotebookSourceUrl } from "./clientNotebookLanes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DAY = 86_400_000;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown, max: number): v is string => typeof v === "string" && !!v.trim() && v.length <= max;
const timestamp = (v: unknown) => typeof v === "string" ? Date.parse(v) : NaN;

export interface CommerceHostSource {
  tenant: string; id: string; revision: string; title: string; type: "source"; content: string;
  contentHash: string; metadataHash: string; createdAt: string; expiresAt: string;
  status: "active"; reviewState: "approved"; sensitivity: "ordinary";
}
export interface HostSourceBatch {
  tenantSlug: string;
  /** The host's original policy, not a browser-supplied retention duration. */
  retentionDays: number;
  records: unknown[];
  /** Fresh host review rows, bound to both content and Notebook metadata hashes. Never browser claims. */
  reviews: unknown[];
}

/** Converts trusted worker snapshots; does not fetch private sources or authenticate the supplied rows. */
export function prepareCommerceNotebookSources(tenant: string, ids: readonly string[], batch: HostSourceBatch, now: number): CommerceHostSource[] | null {
  if (!isValidTenantSlug(tenant) || !Number.isSafeInteger(now) || now < 0 || !Array.isArray(ids) || ids.length < 1 || ids.length > 5
    || ids.some(id => typeof id !== "string" || !UUID.test(id)) || new Set(ids).size !== ids.length
    || !record(batch) || batch.tenantSlug !== tenant || !Number.isSafeInteger(batch.retentionDays) || batch.retentionDays < 1 || batch.retentionDays > 28
    || !Array.isArray(batch.records) || batch.records.length !== ids.length || !Array.isArray(batch.reviews) || batch.reviews.length !== ids.length) return null;
  const rows = new Map<string, Record<string, unknown>>(), reviews = new Map<string, Record<string, unknown>>();
  for (const r of batch.records) {
    if (!record(r) || typeof r.id !== "string" || rows.has(r.id) || !ids.includes(r.id)) return null;
    rows.set(r.id, r);
  }
  for (const r of batch.reviews) {
    if (!record(r) || typeof r.sourceId !== "string" || reviews.has(r.sourceId) || !ids.includes(r.sourceId)) return null;
    reviews.set(r.sourceId, r);
  }
  const sources: CommerceHostSource[] = []; let total = 0;
  for (const id of [...ids].sort()) {
    const r = rows.get(id), review = reviews.get(id);
    if (!r || !review || (r.tenantSlug !== undefined && r.tenantSlug !== tenant) || (r.tenant_slug !== undefined && r.tenant_slug !== tenant)
      || (r.status !== undefined && r.status !== "active") || r.deletedAt != null || r.deleted_at != null || !string(r.content, 12_000) || !string(r.title, 200) || review.tenantSlug !== tenant
      || review.reviewState !== "approved" || review.sensitivity !== "ordinary" || review.requesterActive !== true || review.reviewerActive !== true || !["owner", "admin"].includes(String(review.reviewerRole))
      || typeof review.revision !== "string" || !ID.test(review.revision)
      || typeof review.requesterId !== "string" || !UUID.test(review.requesterId)
      || typeof review.reviewerId !== "string" || !UUID.test(review.reviewerId) || review.requesterId === review.reviewerId) return null;
    total += r.content.length; if (total > 24_000) return null;
    const created = timestamp(r.createdAt), expiry = timestamp(review.retentionExpiresAt), reviewed = timestamp(review.reviewedAt);
    if (!Number.isSafeInteger(created) || created < 0 || created > now || !Number.isSafeInteger(expiry) || expiry <= now
      || expiry > created + batch.retentionDays * DAY || !Number.isSafeInteger(reviewed) || reviewed < created || reviewed > now) return null;
    const metadata = record(r.metadata) ? r.metadata : {};
    const metadataHash = notebookSourceMetadataSha256({ id, title: r.title, sourceUrl: safeNotebookSourceUrl(metadata.source_url), links: notebookSourceLinks(metadata.source_links), recordCreatedAt: String(r.createdAt) });
    const contentHash = hash(r.content);
    if (typeof review.contentSha256 !== "string" || !HASH.test(review.contentSha256) || review.contentSha256 !== contentHash
      || typeof review.sourceMetadataSha256 !== "string" || review.sourceMetadataSha256 !== metadataHash) return null;
    sources.push({ tenant, id, revision: review.revision, title: r.title, type: "source", content: r.content, contentHash, metadataHash,
      createdAt: new Date(created).toISOString(), expiresAt: new Date(expiry).toISOString(), status: "active", reviewState: "approved", sensitivity: "ordinary" });
  }
  return sources;
}

export interface CommerceHostDraftConfig {
  enabled: boolean; tenantSlug: string; adapterId: string; workerToken: string;
  provider: string; model: string; maxDraftMicros: number; tenantMonthlyCapMicros: number;
}
export interface CommerceHostDraftRequest { taskId: string; sourceIds: string[]; instruction: string }
export interface CommerceHostDraftResponse { title: string; body: string; provider: string; model: string; costMicros: number | null; costStatus: string }
export interface CommerceHostDraftDeps {
  rpc: BudgetRpc;
  /** Must enforce host job/session membership and review-ledger authority before returning rows. */
  loadAuthorizedSources: (tenant: string, ids: readonly string[]) => Promise<HostSourceBatch>;
  /** Calls an already configured runtime/sidecar. No host credential is passed to this callback. */
  runDraft: (input: { tenant: string; taskId: string; sources: CommerceHostSource[]; instruction: string; now: number; budgetMaxMicros: number; provider: string; model: string }) => Promise<CommerceHostDraftResponse>;
  clock?: () => number;
}
export type CommerceHostDraftResult =
  | { ok: true; draft: CommerceHostDraftResponse; budgetState: "settled" | "reserved_cost_unknown"; taskId: string; sourceReferences: Omit<CommerceHostSource, "title" | "type" | "content" | "status" | "reviewState" | "sensitivity" | "createdAt">[] }
  | { ok: false; reason: string; budgetState: "not_reserved" | "released" | "reconciliation_required" | "settled"; taskId?: string };

/** One central reservation admits one dispatch; duplicate reservations never repeat a model call. */
export async function runCommerceHostDraft(config: CommerceHostDraftConfig, deps: CommerceHostDraftDeps, request: CommerceHostDraftRequest): Promise<CommerceHostDraftResult> {
  const deny = (reason: string, budgetState: "not_reserved" | "released" | "reconciliation_required" | "settled" = "not_reserved"): CommerceHostDraftResult => ({ ok: false, reason, budgetState });
  if (config.enabled !== true) return deny("commerce_disabled");
  try { assertMicros(config.maxDraftMicros); assertMicros(config.tenantMonthlyCapMicros); } catch { return deny("invalid_configuration"); }
  if (!isValidTenantSlug(config.tenantSlug) || !isValidAdapterId(config.adapterId) || !string(config.workerToken, 4096) || config.workerToken.length < 24
    || !string(config.provider, 120) || !string(config.model, 180) || config.maxDraftMicros < 1 || config.maxDraftMicros > config.tenantMonthlyCapMicros
    || !record(request) || typeof request.taskId !== "string" || !UUID.test(request.taskId) || !string(request.instruction, 4000)
    || !Array.isArray(request.sourceIds) || request.sourceIds.length < 1 || request.sourceIds.length > 5 || request.sourceIds.some(id => typeof id !== "string" || !UUID.test(id)) || new Set(request.sourceIds).size !== request.sourceIds.length) return deny("invalid_configuration");
  config = { ...config }; request = { ...request, sourceIds: [...request.sourceIds] };
  const clock = deps.clock ?? Date.now;
  async function load() {
    try { return prepareCommerceNotebookSources(config.tenantSlug, request.sourceIds, await deps.loadAuthorizedSources(config.tenantSlug, Object.freeze([...request.sourceIds])), clock()); }
    catch { return null; }
  }
  const sources = await load(); if (!sources) return deny("source_review_unavailable");
  const base = { tenantSlug: config.tenantSlug, workerToken: config.workerToken, adapterId: config.adapterId, taskId: request.taskId };
  const reservation = await reserveAdapterBudget(deps.rpc, { ...base, idempotencyKey: `commerce:${request.taskId}:reserve`, amountMicros: config.maxDraftMicros, provider: config.provider, model: config.model, tenantMonthlyCapMicros: config.tenantMonthlyCapMicros });
  if (!reservation.allowed) return deny("budget_refused", reservation.status === "unavailable" ? "reconciliation_required" : "not_reserved");
  if (reservation.status !== "reserved") return deny("dispatch_reconciliation_required", "reconciliation_required");
  const current = await load();
  if (!current || hash(JSON.stringify(current)) !== hash(JSON.stringify(sources))) {
    const released = await releaseAdapterBudget(deps.rpc, { ...base, idempotencyKey: `commerce:${request.taskId}:release-before-dispatch` });
    return deny(released.allowed ? "source_changed_before_dispatch" : "budget_release_reconciliation_required", released.allowed ? "released" : "reconciliation_required");
  }
  let draft: CommerceHostDraftResponse;
  try { draft = await deps.runDraft({ tenant: config.tenantSlug, taskId: request.taskId, sources: current, instruction: request.instruction, now: clock(), budgetMaxMicros: config.maxDraftMicros, provider: config.provider, model: config.model }); }
  catch { return deny("draft_outcome_unknown", "reconciliation_required"); }
  if (!record(draft) || !string(draft.title, 200) || !string(draft.body, 30_000) || draft.provider !== config.provider || draft.model !== config.model
    || !string(draft.costStatus, 100) || !auditNotebookDraftCitations(draft.body, current).ok) return deny("draft_invalid", "reconciliation_required");
  const safeDraft: CommerceHostDraftResponse = { title: draft.title, body: draft.body, provider: draft.provider, model: draft.model, costMicros: null, costStatus: draft.costStatus };
  let budgetState: "settled" | "reserved_cost_unknown" = "reserved_cost_unknown";
  if (draft.costMicros !== null) {
    try { assertMicros(draft.costMicros); } catch { return deny("draft_cost_unverified", "reconciliation_required"); }
    if (draft.costMicros > config.maxDraftMicros) return deny("draft_over_reservation", "reconciliation_required");
    const settled = await settleAdapterBudget(deps.rpc, { ...base, idempotencyKey: `commerce:${request.taskId}:settle`, actualAmountMicros: draft.costMicros });
    if (!settled.allowed) return deny("budget_settlement_reconciliation_required", "reconciliation_required");
    safeDraft.costMicros = draft.costMicros; budgetState = "settled";
  }
  // The provider may have spent money even when evidence changed during its call. Never release it here.
  const latest = await load();
  if (!latest || hash(JSON.stringify(latest)) !== hash(JSON.stringify(current))) return deny("source_changed_during_draft", budgetState === "settled" ? "settled" : "reconciliation_required");
  const sourceReferences = current.map(({ tenant, id, revision, contentHash, metadataHash, expiresAt }) => ({ tenant, id, revision, contentHash, metadataHash, expiresAt }));
  return { ok: true, draft: safeDraft, budgetState, taskId: request.taskId, sourceReferences };
}
