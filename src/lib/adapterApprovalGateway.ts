/**
 * Server-side helpers for the durable two-person approval gateway (ADR-006).
 *
 * The rules live in the database functions in product-experience/supabase-client-adapter-approval-gateway.sql.
 * This module hashes the exact action on the server, calls those functions through an injected RPC function, and
 * turns database errors into stable codes. It never accepts a requester or approver identity from a caller:
 * the database reads it from the signed-in session.
 */
import { createHash } from "node:crypto";
import { APPROVAL_ACTION_KINDS, AdapterContractError, isSha256Hex, isValidAdapterId, isValidTenantSlug } from "./adapterContracts";

export type ApprovalActionKind = (typeof APPROVAL_ACTION_KINDS)[number];

export const MIN_APPROVAL_TTL_SECONDS = 60;
export const DEFAULT_APPROVAL_TTL_SECONDS = 86_400;
export const MAX_APPROVAL_TTL_SECONDS = 259_200;
export const ACTION_HASH_VERSION = "approval-action-h1" as const;

const MAX_DEPTH = 20;
const MAX_DESTINATION_CHARS = 500;
const MAX_POLICY_VERSION_CHARS = 80;
const MIN_WORKER_TOKEN_CHARS = 24;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

function invalid(message: string): never {
  throw new AdapterContractError("invalid_input", message);
}

/** Stable JSON: object keys sorted, no whitespace. Only plain JSON values are allowed, so the hash is reproducible. */
export function canonicalJson(value: unknown, depth = 0): string {
  if (depth > MAX_DEPTH) invalid("payload is nested too deeply");
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) invalid("payload contains a number that is not finite");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item, depth + 1)).join(",")}]`;
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) invalid("payload contains an object that is not plain data");
      const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item, depth + 1)}`).join(",")}}`;
    }
    default:
      return invalid("payload contains a value that cannot be hashed");
  }
}

export interface ApprovalAction {
  kind: ApprovalActionKind;
  adapterId: string;
  destination: string;
  policyVersion: string;
  payload: unknown;
}

function boundedText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max) invalid(`${field} must be text of 1 to ${max} characters`);
  return value;
}

/** The hash an approval is bound to. It covers the kind, adapter, destination, policy version and the full payload. */
export function approvalActionHash(action: ApprovalAction): string {
  if (!APPROVAL_ACTION_KINDS.includes(action.kind)) invalid("unknown approval action kind");
  if (!isValidAdapterId(action.adapterId)) throw new AdapterContractError("invalid_adapter_id", "adapter id is not valid");
  const canonical = canonicalJson({
    v: ACTION_HASH_VERSION,
    kind: action.kind,
    adapterId: action.adapterId,
    destination: boundedText(action.destination, "destination", MAX_DESTINATION_CHARS),
    policyVersion: boundedText(action.policyVersion, "policyVersion", MAX_POLICY_VERSION_CHARS),
    payload: action.payload === undefined ? null : action.payload,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export type GatewayRpc = (functionName: string, body: Record<string, unknown>) => Promise<{ ok: boolean; status: number; value: unknown }>;

export type GatewayErrorCode =
  | "not_allowed"
  | "not_found"
  | "unknown_adapter"
  | "adapter_not_ready"
  | "too_many_open"
  | "requester_cannot_decide"
  | "not_pending"
  | "hash_mismatch"
  | "already_pending"
  | "invalid_input"
  | "unavailable";

const MESSAGE_CODES: Record<string, GatewayErrorCode> = {
  adapter_approval_not_allowed: "not_allowed",
  adapter_approval_not_found: "not_found",
  adapter_approval_unknown_adapter: "unknown_adapter",
  adapter_approval_adapter_not_ready: "adapter_not_ready",
  adapter_approval_too_many_open: "too_many_open",
  adapter_approval_bad_ttl: "invalid_input",
  adapter_approval_bad_kind: "invalid_input",
  adapter_approval_bad_decision: "invalid_input",
  adapter_approval_requester_cannot_decide: "requester_cannot_decide",
  adapter_approval_not_pending: "not_pending",
  adapter_approval_hash_mismatch: "hash_mismatch",
};

export const GATEWAY_HTTP_STATUS: Record<GatewayErrorCode, number> = {
  not_allowed: 403,
  not_found: 404,
  unknown_adapter: 404,
  adapter_not_ready: 409,
  too_many_open: 429,
  requester_cannot_decide: 403,
  not_pending: 409,
  hash_mismatch: 400,
  already_pending: 409,
  invalid_input: 400,
  unavailable: 503,
};

/** Maps a database error (PostgREST body) to a stable code. Anything unrecognised is "unavailable", never a leak. */
export function gatewayErrorFrom(result: { status: number; value: unknown }): GatewayErrorCode {
  const body = result.value && typeof result.value === "object" ? (result.value as Record<string, unknown>) : {};
  const message = typeof body.message === "string" ? body.message : "";
  for (const [needle, code] of Object.entries(MESSAGE_CODES)) {
    if (message.includes(needle)) return code;
  }
  if (body.code === "23505") return "already_pending";
  if (body.code === "23514" || body.code === "22P02") return "invalid_input";
  if (result.status === 401 || result.status === 403) return "not_allowed";
  return "unavailable";
}

export interface RequestApprovalInput {
  tenantSlug: string;
  adapterId: unknown;
  kind: unknown;
  destination: unknown;
  policyVersion: unknown;
  payload: unknown;
  ttlSeconds?: unknown;
}

export type RequestApprovalResult = { ok: true; approvalId: string; actionHash: string } | { ok: false; error: GatewayErrorCode };

export async function requestApproval(rpc: GatewayRpc, input: RequestApprovalInput): Promise<RequestApprovalResult> {
  const ttl = input.ttlSeconds === undefined ? DEFAULT_APPROVAL_TTL_SECONDS : input.ttlSeconds;
  if (!isValidTenantSlug(input.tenantSlug)) return { ok: false, error: "invalid_input" };
  if (typeof ttl !== "number" || !Number.isInteger(ttl) || ttl < MIN_APPROVAL_TTL_SECONDS || ttl > MAX_APPROVAL_TTL_SECONDS) {
    return { ok: false, error: "invalid_input" };
  }
  let actionHash: string;
  try {
    actionHash = approvalActionHash({
      kind: input.kind as ApprovalActionKind,
      adapterId: input.adapterId as string,
      destination: input.destination as string,
      policyVersion: input.policyVersion as string,
      payload: input.payload,
    });
  } catch {
    return { ok: false, error: "invalid_input" };
  }
  const result = await rpc("client_adapter_request_approval", {
    p_tenant_slug: input.tenantSlug,
    p_adapter_id: input.adapterId,
    p_action_kind: input.kind,
    p_action_hash: actionHash,
    p_destination: input.destination,
    p_policy_version: input.policyVersion,
    p_ttl_seconds: ttl,
  });
  if (!result.ok || !isUuid(result.value)) return { ok: false, error: gatewayErrorFrom(result) };
  return { ok: true, approvalId: result.value, actionHash };
}

export interface DecideApprovalInput {
  approvalId: unknown;
  decision: unknown;
  expectedActionHash?: unknown;
}

export type DecideApprovalResult = { ok: true; status: "approved" | "rejected" | "expired" } | { ok: false; error: GatewayErrorCode };

export async function decideApproval(rpc: GatewayRpc, input: DecideApprovalInput): Promise<DecideApprovalResult> {
  if (!isUuid(input.approvalId)) return { ok: false, error: "invalid_input" };
  if (input.decision !== "approve" && input.decision !== "reject") return { ok: false, error: "invalid_input" };
  if (input.decision === "approve" && !isSha256Hex(input.expectedActionHash)) return { ok: false, error: "invalid_input" };
  const result = await rpc("client_adapter_decide_approval", {
    p_approval_id: input.approvalId,
    p_decision: input.decision,
    p_expected_action_hash: input.decision === "approve" ? input.expectedActionHash : null,
  });
  const status = result.value;
  if (!result.ok || (status !== "approved" && status !== "rejected" && status !== "expired")) return { ok: false, error: gatewayErrorFrom(result) };
  return { ok: true, status };
}

export interface ExecuteApprovalInput {
  tenantSlug: string;
  workerToken: string;
  approvalId: string;
  expectedActionHash: string;
  receiptSha256: string;
}

/** Host-internal: consumes an approved request once. Returns false for any problem, including a replay. */
export async function executeApproval(rpc: GatewayRpc, input: ExecuteApprovalInput): Promise<boolean> {
  if (
    !isValidTenantSlug(input.tenantSlug)
    || typeof input.workerToken !== "string"
    || input.workerToken.length < MIN_WORKER_TOKEN_CHARS
    || !isUuid(input.approvalId)
    || !isSha256Hex(input.expectedActionHash)
    || !isSha256Hex(input.receiptSha256)
  ) {
    return false;
  }
  const result = await rpc("client_adapter_execute_approval", {
    p_tenant_slug: input.tenantSlug,
    p_worker_token: input.workerToken,
    p_approval_id: input.approvalId,
    p_expected_action_hash: input.expectedActionHash,
    p_receipt_sha256: input.receiptSha256,
  });
  return result.ok && result.value === true;
}
