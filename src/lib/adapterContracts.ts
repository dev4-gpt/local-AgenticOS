/**
 * Shared, dependency-free contract between the Veloce host and the adapter products it hosts
 * (Creator OS, Knowledge, Forge, SymVibe + REA).
 *
 * Like capabilityContracts.ts this module is safe to import from client-facing code: it reads no
 * secrets and calls no providers. It defines record shapes and validates the boundary. The host owns
 * identity, approval, budget and the shared memory ledger; an adapter only ever proposes.
 * Design record: docs/architecture/adr-005-adapter-host-contract.md
 */

export const ADAPTER_CONTRACT_VERSION = "h1" as const;

export const ADAPTER_OPERATIONS = [
  "manifest",
  "health",
  "context.read",
  "task.run",
  "task.get",
  "task.result",
  "task.cancel",
  "events",
  "memory.propose",
  "memory.tombstone",
  "ui.launch",
] as const;

export const SIDE_EFFECT_CLASSES = ["read", "draft", "publish"] as const;
export const DELETION_GUARANTEES = ["none", "host-owned", "receipt"] as const;
export const ADAPTER_STATES = ["disabled", "preview", "enabled", "suspended"] as const;
export const MEMORY_ITEM_STATUSES = ["active", "superseded", "tombstoned"] as const;
export const PROMOTION_STATUSES = ["quarantined", "approved", "rejected", "withdrawn"] as const;
export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "expired", "executed", "cancelled"] as const;
export const APPROVAL_ACTION_KINDS = ["publish", "promote", "enable-adapter", "run-command"] as const;
export const BUDGET_EVENT_KINDS = ["reserve", "settle", "release"] as const;

export type AdapterOperation = (typeof ADAPTER_OPERATIONS)[number];
export type SideEffectClass = (typeof SIDE_EFFECT_CLASSES)[number];
export type DeletionGuarantee = (typeof DELETION_GUARANTEES)[number];
export type MemoryItemStatus = (typeof MEMORY_ITEM_STATUSES)[number];
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const SHARED_NAMESPACE = "shared" as const;
export const MAX_MEMORY_CONTENT_CHARS = 30_000;
export const MICROS_PER_USD = 1_000_000;

export type AdapterContractErrorCode =
  | "invalid_input"
  | "version_mismatch"
  | "invalid_adapter_id"
  | "invalid_tenant_slug"
  | "invalid_idempotency_key"
  | "invalid_hash"
  | "invalid_micros"
  | "unknown_operation"
  | "unknown_task"
  | "side_effect_exceeds_ceiling"
  | "approval_required"
  | "tombstone_requires_receipt_guarantee"
  | "reviewer_must_differ";

export class AdapterContractError extends Error {
  readonly code: AdapterContractErrorCode;

  constructor(code: AdapterContractErrorCode, message: string) {
    super(message);
    this.name = "AdapterContractError";
    this.code = code;
  }
}

// The tenant and adapter id rules match client_tenants.slug in the database.
const ADAPTER_ID = /^[a-z][a-z0-9-]{2,40}$/;
const TENANT_SLUG = /^[a-z][a-z0-9-]{2,40}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$/;
const TASK_NAME = /^[a-z][a-z0-9._-]{1,63}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SIDE_EFFECT_RANK: Record<SideEffectClass, number> = { read: 0, draft: 1, publish: 2 };

export const isValidAdapterId = (value: unknown): value is string => typeof value === "string" && ADAPTER_ID.test(value);
export const isValidTenantSlug = (value: unknown): value is string => typeof value === "string" && TENANT_SLUG.test(value);
export const isValidIdempotencyKey = (value: unknown): value is string => typeof value === "string" && IDEMPOTENCY_KEY.test(value);
export const isSha256Hex = (value: unknown): value is string => typeof value === "string" && SHA256_HEX.test(value);

export function adapterNamespace(adapterId: string): string {
  if (!isValidAdapterId(adapterId)) throw new AdapterContractError("invalid_adapter_id", "adapter id is not valid");
  return `adapter:${adapterId}`;
}

/** Money is a non-negative integer number of micros (millionths of a US dollar) end to end. */
export function assertMicros(value: unknown, field = "micros"): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new AdapterContractError("invalid_micros", `${field} must be a non-negative integer`);
  }
  return value;
}

export function microsFromUsd(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) throw new AdapterContractError("invalid_micros", "usd must be a non-negative number");
  return Math.round(usd * MICROS_PER_USD);
}

export function usdFromMicros(micros: number): number {
  return assertMicros(micros) / MICROS_PER_USD;
}

type Rec = Record<string, unknown>;

function asRecord(input: unknown, what: string): Rec {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AdapterContractError("invalid_input", `${what} must be an object`);
  return input as Rec;
}

function asText(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw new AdapterContractError("invalid_input", `${field} must be text of ${min} to ${max} characters`);
  }
  return value;
}

function asOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new AdapterContractError("invalid_input", `${field} is not one of the allowed values`);
  return value as T;
}

function asTenant(value: unknown): string {
  if (!isValidTenantSlug(value)) throw new AdapterContractError("invalid_tenant_slug", "tenant slug is not valid");
  return value;
}

function asAdapterId(value: unknown): string {
  if (!isValidAdapterId(value)) throw new AdapterContractError("invalid_adapter_id", "adapter id is not valid");
  return value;
}

function asIdempotencyKey(value: unknown): string {
  if (!isValidIdempotencyKey(value)) throw new AdapterContractError("invalid_idempotency_key", "idempotency key must be 8 to 180 safe characters");
  return value;
}

function asHash(value: unknown, field: string): string {
  if (!isSha256Hex(value)) throw new AdapterContractError("invalid_hash", `${field} must be a lower-case sha256 hex string`);
  return value;
}

export interface AdapterTaskSchema {
  name: string;
  sideEffect: SideEffectClass;
}

export interface AdapterManifest {
  contractVersion: typeof ADAPTER_CONTRACT_VERSION;
  adapterId: string;
  displayName: string;
  adapterVersion: string;
  publisher: string;
  license: string;
  operations: AdapterOperation[];
  tasks: AdapterTaskSchema[];
  sideEffectCeiling: SideEffectClass;
  deletionGuarantee: DeletionGuarantee;
}

const TASK_OPERATIONS: readonly AdapterOperation[] = ["task.run", "task.get", "task.cancel"];

export function validateAdapterManifest(input: unknown): AdapterManifest {
  const raw = asRecord(input, "manifest");
  if (raw.contractVersion !== ADAPTER_CONTRACT_VERSION) throw new AdapterContractError("version_mismatch", `contract version must be ${ADAPTER_CONTRACT_VERSION}`);
  if (!Array.isArray(raw.operations)) throw new AdapterContractError("invalid_input", "operations must be a list");
  const operations = raw.operations.map((operation) => {
    if (typeof operation !== "string" || !ADAPTER_OPERATIONS.includes(operation as AdapterOperation)) {
      throw new AdapterContractError("unknown_operation", "manifest lists an unknown operation");
    }
    return operation as AdapterOperation;
  });
  if (new Set(operations).size !== operations.length) throw new AdapterContractError("invalid_input", "operations must be unique");
  if (!operations.includes("manifest") || !operations.includes("health")) throw new AdapterContractError("invalid_input", "manifest and health are required");
  const taskOperations = TASK_OPERATIONS.filter((operation) => operations.includes(operation));
  if (taskOperations.length !== 0 && taskOperations.length !== TASK_OPERATIONS.length) {
    throw new AdapterContractError("invalid_input", "task.run, task.get and task.cancel are offered together or not at all");
  }
  const sideEffectCeiling = asOneOf(raw.sideEffectCeiling, SIDE_EFFECT_CLASSES, "sideEffectCeiling");
  const deletionGuarantee = asOneOf(raw.deletionGuarantee, DELETION_GUARANTEES, "deletionGuarantee");
  const hasTombstone = operations.includes("memory.tombstone");
  if (hasTombstone !== (deletionGuarantee === "receipt")) {
    throw new AdapterContractError("tombstone_requires_receipt_guarantee", "memory.tombstone and the receipt deletion guarantee go together");
  }
  const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  const tasks = rawTasks.map((entry) => {
    const task = asRecord(entry, "task");
    const name = asText(task.name, "task name", 2, 64);
    if (!TASK_NAME.test(name)) throw new AdapterContractError("invalid_input", "task name is not valid");
    const sideEffect = asOneOf(task.sideEffect, SIDE_EFFECT_CLASSES, "task sideEffect");
    if (SIDE_EFFECT_RANK[sideEffect] > SIDE_EFFECT_RANK[sideEffectCeiling]) {
      throw new AdapterContractError("side_effect_exceeds_ceiling", `task ${name} exceeds the adapter's side-effect ceiling`);
    }
    return { name, sideEffect };
  });
  if (new Set(tasks.map((task) => task.name)).size !== tasks.length) throw new AdapterContractError("invalid_input", "task names must be unique");
  if (taskOperations.length > 0 && tasks.length === 0) throw new AdapterContractError("invalid_input", "an adapter that runs tasks must declare them");
  return {
    contractVersion: ADAPTER_CONTRACT_VERSION,
    adapterId: asAdapterId(raw.adapterId),
    displayName: asText(raw.displayName, "displayName", 1, 120),
    adapterVersion: asText(raw.adapterVersion, "adapterVersion", 1, 40),
    publisher: asText(raw.publisher, "publisher", 1, 120),
    license: asText(raw.license, "license", 1, 80),
    operations,
    tasks,
    sideEffectCeiling,
    deletionGuarantee,
  };
}

export interface AdapterTaskRequest {
  tenantSlug: string;
  adapterId: string;
  task: string;
  idempotencyKey: string;
  budgetMaxMicros: number;
  sideEffect: SideEffectClass;
  approval?: { approvalId: string; actionHash: string };
  input: unknown;
}

/** The side-effect class comes from the manifest, never from the caller. Publish-class tasks need a hash-bound approval. */
export function validateAdapterTaskRequest(input: unknown, manifest: AdapterManifest): AdapterTaskRequest {
  const raw = asRecord(input, "task request");
  const adapterId = asAdapterId(raw.adapterId);
  if (adapterId !== manifest.adapterId) throw new AdapterContractError("invalid_adapter_id", "task request is for a different adapter");
  const taskName = asText(raw.task, "task", 2, 64);
  const task = manifest.tasks.find((candidate) => candidate.name === taskName);
  if (!task) throw new AdapterContractError("unknown_task", `adapter does not declare task ${taskName}`);
  const request: AdapterTaskRequest = {
    tenantSlug: asTenant(raw.tenantSlug),
    adapterId,
    task: task.name,
    idempotencyKey: asIdempotencyKey(raw.idempotencyKey),
    budgetMaxMicros: assertMicros(raw.budgetMaxMicros, "budgetMaxMicros"),
    sideEffect: task.sideEffect,
    input: raw.input ?? null,
  };
  if (raw.approval !== undefined) {
    const approval = asRecord(raw.approval, "approval");
    if (typeof approval.approvalId !== "string" || !UUID.test(approval.approvalId)) throw new AdapterContractError("invalid_input", "approvalId must be a uuid");
    request.approval = { approvalId: approval.approvalId, actionHash: asHash(approval.actionHash, "actionHash") };
  }
  if (task.sideEffect === "publish" && !request.approval) {
    throw new AdapterContractError("approval_required", "publish-class tasks need an approval bound to the exact action hash");
  }
  return request;
}

export interface MemoryProposal {
  tenantSlug: string;
  adapterId: string;
  idempotencyKey: string;
  content: string;
  contentSha256: string;
  provenance: {
    sourceTaskId: string;
    adapterVersion: string;
    agentPrincipal: string;
    confidence: number;
    sourceUrl?: string;
    sourceSha256?: string;
  };
}

export interface ProposalOptions {
  /** The host passes its hasher so this module stays free of crypto imports. */
  sha256?: (content: string) => string;
}

export function validateMemoryProposal(input: unknown, options: ProposalOptions = {}): MemoryProposal {
  const raw = asRecord(input, "memory proposal");
  const content = asText(raw.content, "content", 1, MAX_MEMORY_CONTENT_CHARS);
  const contentSha256 = asHash(raw.contentSha256, "contentSha256");
  if (options.sha256 && options.sha256(content) !== contentSha256) throw new AdapterContractError("invalid_hash", "contentSha256 does not match the content");
  const provenance = asRecord(raw.provenance, "provenance");
  const confidence = provenance.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new AdapterContractError("invalid_input", "confidence must be a number from 0 to 1");
  }
  const result: MemoryProposal = {
    tenantSlug: asTenant(raw.tenantSlug),
    adapterId: asAdapterId(raw.adapterId),
    idempotencyKey: asIdempotencyKey(raw.idempotencyKey),
    content,
    contentSha256,
    provenance: {
      sourceTaskId: asText(provenance.sourceTaskId, "sourceTaskId", 1, 128),
      adapterVersion: asText(provenance.adapterVersion, "adapterVersion", 1, 40),
      agentPrincipal: asText(provenance.agentPrincipal, "agentPrincipal", 1, 120),
      confidence,
    },
  };
  if (provenance.sourceUrl !== undefined) {
    const url = asText(provenance.sourceUrl, "sourceUrl", 1, 2048);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new AdapterContractError("invalid_input", "sourceUrl is not a valid URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new AdapterContractError("invalid_input", "sourceUrl must be http or https");
    result.provenance.sourceUrl = url;
  }
  if (provenance.sourceSha256 !== undefined) result.provenance.sourceSha256 = asHash(provenance.sourceSha256, "sourceSha256");
  return result;
}

export interface TombstoneReceipt {
  tenantSlug: string;
  adapterId: string;
  eventId: string;
  receiptSha256: string;
  deletedCount: number;
}

/** An adapter acknowledges a deletion event by returning this receipt; no receipt means the copy is unverified. */
export function validateTombstoneReceipt(input: unknown): TombstoneReceipt {
  const raw = asRecord(input, "tombstone receipt");
  if (typeof raw.eventId !== "string" || !UUID.test(raw.eventId)) throw new AdapterContractError("invalid_input", "eventId must be a uuid");
  const deletedCount = raw.deletedCount;
  if (typeof deletedCount !== "number" || !Number.isSafeInteger(deletedCount) || deletedCount < 0) {
    throw new AdapterContractError("invalid_input", "deletedCount must be a non-negative integer");
  }
  return {
    tenantSlug: asTenant(raw.tenantSlug),
    adapterId: asAdapterId(raw.adapterId),
    eventId: raw.eventId,
    receiptSha256: asHash(raw.receiptSha256, "receiptSha256"),
    deletedCount,
  };
}

type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;

// These maps mirror the guard triggers in product-experience/supabase-client-adapter-host.sql.
export const MEMORY_ITEM_TRANSITIONS: TransitionMap<MemoryItemStatus> = {
  active: ["superseded", "tombstoned"],
  superseded: ["tombstoned"],
  tombstoned: [],
};

export const PROMOTION_TRANSITIONS: TransitionMap<PromotionStatus> = {
  quarantined: ["approved", "rejected", "withdrawn"],
  approved: [],
  rejected: [],
  withdrawn: [],
};

export const APPROVAL_TRANSITIONS: TransitionMap<ApprovalStatus> = {
  pending: ["approved", "rejected", "expired", "cancelled"],
  approved: ["executed", "expired", "cancelled"],
  rejected: [],
  expired: [],
  executed: [],
  cancelled: [],
};

export function canTransition<S extends string>(map: TransitionMap<S>, from: S, to: S): boolean {
  return map[from].includes(to);
}

/** The person who requested an action can never also approve it. Comparison ignores case and surrounding spaces. */
export function assertDistinctReviewer(requestedBy: string, reviewedBy: string): void {
  if (requestedBy.trim().toLowerCase() === reviewedBy.trim().toLowerCase()) {
    throw new AdapterContractError("reviewer_must_differ", "the reviewer must be a different person from the requester");
  }
}

/** An approval can be used once, before it expires, and only while it is in the approved state. */
export function isApprovalUsable(approval: { status: ApprovalStatus; expiresAt: string }, now: Date = new Date()): boolean {
  return approval.status === "approved" && new Date(approval.expiresAt).getTime() > now.getTime();
}
