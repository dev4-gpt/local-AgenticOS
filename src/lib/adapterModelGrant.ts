/**
 * Model grants (ADR-020): the one credential an adapter holds for calling the host, and only for `model.call`.
 *
 * When the host starts an adapter task it opens a grant in the database (limits and the provider:model list) and signs
 * a credential naming the tenant, the adapter, the host's key for the task and the grant id. Unlike the host's own
 * tokens (ADR-012: 300 seconds, used once) this one is reused for every model call of the task, so it lives up to 15
 * minutes and each call is also checked against the grant row, which the sync job closes when the task ends.
 * The format is the host token's (base64url payload "." Ed25519 signature) with version `mg1`, so neither kind can be
 * used as the other. Keys are passed in; this module never reads the environment or the disk.
 */
import { randomUUID, sign, verify, type KeyObject } from "node:crypto";
import { isValidAdapterId, isValidTenantSlug } from "./adapterContracts";
import { ed25519PrivateKey, ed25519PublicKey, MAX_CLOCK_SKEW_SECONDS, MAX_VERIFY_KEYS, TOKEN_ISSUER } from "./adapterTokens";

export const GRANT_VERSION = "mg1" as const;
export const GRANT_SCOPE = "model.call" as const;
export const DEFAULT_GRANT_TTL_SECONDS = 600;
export const MAX_GRANT_TTL_SECONDS = 900;
export const MAX_GRANT_CALLS = 100;
export const MAX_GRANT_TOKENS = 1_000_000;
export const MAX_ALLOWED_MODELS = 20;
const MAX_TOKEN_CHARS = 4096;
const MIN_WORKER_TOKEN_CHARS = 24;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The host's key for a task. At most 120 characters so the per-call ledger key `<key>/m<n>` fits the ledger's 128. */
export const TASK_KEY = /^[A-Za-z0-9._:-]{1,120}$/;
const ADAPTER_TASK_ID = /^[A-Za-z0-9._:-]{1,128}$/;
/** `provider:model`, matching the database's rule. */
export const ALLOWED_MODEL = /^[a-z][a-z0-9-]{1,40}:[A-Za-z0-9._:/-]{1,180}$/;

export interface ModelGrantClaims {
  v: typeof GRANT_VERSION;
  iss: typeof TOKEN_ISSUER;
  tenant: string;
  aud: string;
  task: string;
  scope: [typeof GRANT_SCOPE];
  jti: string;
  iat: number;
  exp: number;
}

export type GrantFailure =
  | "malformed" | "bad_signature" | "wrong_version" | "wrong_issuer" | "wrong_tenant" | "scope_not_allowed"
  | "expired" | "not_yet_valid" | "ttl_too_long";

export type GrantVerifyResult = { ok: true; claims: ModelGrantClaims } | { ok: false; reason: GrantFailure };

export interface MintGrantInput {
  privateKey: string | KeyObject;
  tenant: string;
  adapterId: string;
  taskKey: string;
  grantId: string;
  ttlSeconds?: number;
  now?: number; // seconds since epoch; tests only
}

export function mintModelGrantCredential(input: MintGrantInput): { token: string; claims: ModelGrantClaims } {
  const ttl = input.ttlSeconds ?? DEFAULT_GRANT_TTL_SECONDS;
  if (!isValidTenantSlug(input.tenant)) throw new Error("invalid tenant");
  if (!isValidAdapterId(input.adapterId)) throw new Error("invalid adapter id");
  if (typeof input.taskKey !== "string" || !TASK_KEY.test(input.taskKey)) throw new Error("invalid task key");
  if (typeof input.grantId !== "string" || !UUID.test(input.grantId)) throw new Error("invalid grant id");
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_GRANT_TTL_SECONDS) throw new Error("invalid grant lifetime");
  const iat = input.now ?? Math.floor(Date.now() / 1000);
  const claims: ModelGrantClaims = {
    v: GRANT_VERSION, iss: TOKEN_ISSUER, tenant: input.tenant, aud: input.adapterId, task: input.taskKey,
    scope: [GRANT_SCOPE], jti: input.grantId, iat, exp: iat + ttl,
  };
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = sign(null, Buffer.from(body, "utf8"), ed25519PrivateKey(input.privateKey));
  return { token: `${body}.${signature.toString("base64url")}`, claims };
}

export interface VerifyGrantInput {
  token: unknown;
  publicKey: string | KeyObject | readonly (string | KeyObject)[];
  expectedTenant: string;
  now?: number;
}

function parseClaims(body: string): ModelGrantClaims | null {
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const { v, iss, tenant, aud, task, scope, jti, iat, exp } = value;
    if (typeof v !== "string" || typeof iss !== "string" || typeof tenant !== "string") return null;
    if (typeof aud !== "string" || !isValidAdapterId(aud)) return null;
    if (typeof task !== "string" || !TASK_KEY.test(task)) return null;
    if (!Array.isArray(scope) || !scope.every((op) => typeof op === "string")) return null;
    if (typeof jti !== "string" || !UUID.test(jti)) return null;
    if (!Number.isInteger(iat) || !Number.isInteger(exp)) return null;
    return { v, iss, tenant, aud, task, scope, jti, iat, exp } as ModelGrantClaims;
  } catch {
    return null;
  }
}

/** Checks the signature first, then every claim. Never throws on a bad credential; only on a bad key. */
export function verifyModelGrantCredential(input: VerifyGrantInput): GrantVerifyResult {
  const list = Array.isArray(input.publicKey) ? input.publicKey : [input.publicKey];
  if (list.length < 1 || list.length > MAX_VERIFY_KEYS) throw new Error(`verification needs 1 to ${MAX_VERIFY_KEYS} public keys`);
  const keys = list.map((key) => ed25519PublicKey(key as string | KeyObject));
  if (typeof input.token !== "string" || input.token.length > MAX_TOKEN_CHARS) return { ok: false, reason: "malformed" };
  const parts = input.token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [body, signature] = parts;
  const signatureBytes = Buffer.from(signature, "base64url");
  if (signatureBytes.length !== 64) return { ok: false, reason: "malformed" };
  if (!keys.some((key) => verify(null, Buffer.from(body, "utf8"), key, signatureBytes))) return { ok: false, reason: "bad_signature" };
  const claims = parseClaims(body);
  if (!claims) return { ok: false, reason: "malformed" };
  if (claims.v !== GRANT_VERSION) return { ok: false, reason: "wrong_version" };
  if (claims.iss !== TOKEN_ISSUER) return { ok: false, reason: "wrong_issuer" };
  if (claims.tenant !== input.expectedTenant) return { ok: false, reason: "wrong_tenant" };
  if (claims.scope.length !== 1 || claims.scope[0] !== GRANT_SCOPE) return { ok: false, reason: "scope_not_allowed" };
  if (claims.exp - claims.iat > MAX_GRANT_TTL_SECONDS || claims.exp <= claims.iat) return { ok: false, reason: "ttl_too_long" };
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (claims.iat > now + MAX_CLOCK_SKEW_SECONDS) return { ok: false, reason: "not_yet_valid" };
  if (claims.exp <= now) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}

export const newGrantId = () => randomUUID();

export type GrantRpc = (functionName: string, body: Record<string, unknown>) => Promise<{ ok: boolean; status: number; value: unknown }>;

async function statusOf(rpc: GrantRpc, name: string, body: Record<string, unknown>, known: ReadonlySet<string>): Promise<string> {
  try {
    const result = await rpc(name, body);
    return result.ok && typeof result.value === "string" && known.has(result.value) ? result.value : "unavailable";
  } catch {
    return "unavailable";
  }
}

export interface OpenGrantInput {
  tenantSlug: string;
  workerToken: string;
  adapterId: string;
  taskKey: string;
  grantId: string;
  allowed: readonly string[];
  maxCalls: number;
  maxTokens: number;
  expiresAt: Date;
}

const OPEN_STATUSES = new Set(["opened", "already_open", "task_has_grant", "adapter_not_ready", "invalid", "refused"]);

/** Opens the task's grant. Fails closed: only the database's "opened" or "already_open" counts. */
export async function openModelGrant(rpc: GrantRpc, input: OpenGrantInput): Promise<{ opened: boolean; status: string }> {
  const valid = isValidTenantSlug(input.tenantSlug)
    && typeof input.workerToken === "string" && input.workerToken.length >= MIN_WORKER_TOKEN_CHARS
    && isValidAdapterId(input.adapterId)
    && typeof input.taskKey === "string" && TASK_KEY.test(input.taskKey)
    && typeof input.grantId === "string" && UUID.test(input.grantId)
    && Array.isArray(input.allowed) && input.allowed.length >= 1 && input.allowed.length <= MAX_ALLOWED_MODELS
    && input.allowed.every((entry) => typeof entry === "string" && ALLOWED_MODEL.test(entry))
    && Number.isInteger(input.maxCalls) && input.maxCalls >= 1 && input.maxCalls <= MAX_GRANT_CALLS
    && Number.isInteger(input.maxTokens) && input.maxTokens >= 1 && input.maxTokens <= MAX_GRANT_TOKENS
    && input.expiresAt instanceof Date && Number.isFinite(input.expiresAt.getTime());
  if (!valid) return { opened: false, status: "invalid" };
  const status = await statusOf(rpc, "client_adapter_model_grant_open", {
    p_tenant_slug: input.tenantSlug,
    p_worker_token: input.workerToken,
    p_adapter_id: input.adapterId,
    p_task_id: input.taskKey,
    p_grant_id: input.grantId,
    p_allowed: [...input.allowed],
    p_max_calls: input.maxCalls,
    p_max_tokens: input.maxTokens,
    p_expires_at: input.expiresAt.toISOString(),
  }, OPEN_STATUSES);
  return { opened: status === "opened" || status === "already_open", status };
}

const BIND_STATUSES = new Set(["bound", "already_bound", "conflict", "not_found", "invalid", "refused"]);

/** Records the adapter's own task id on the grant, so the sync job can close it when the task ends. */
export async function bindModelGrant(
  rpc: GrantRpc,
  input: { tenantSlug: string; workerToken: string; grantId: string; adapterTaskId: string },
): Promise<{ bound: boolean; status: string }> {
  const valid = isValidTenantSlug(input.tenantSlug)
    && typeof input.workerToken === "string" && input.workerToken.length >= MIN_WORKER_TOKEN_CHARS
    && typeof input.grantId === "string" && UUID.test(input.grantId)
    && typeof input.adapterTaskId === "string" && ADAPTER_TASK_ID.test(input.adapterTaskId);
  if (!valid) return { bound: false, status: "invalid" };
  const status = await statusOf(rpc, "client_adapter_model_grant_bind", {
    p_tenant_slug: input.tenantSlug,
    p_worker_token: input.workerToken,
    p_grant_id: input.grantId,
    p_adapter_task_id: input.adapterTaskId,
  }, BIND_STATUSES);
  return { bound: status === "bound" || status === "already_bound", status };
}

/**
 * The `provider:model` entries one adapter may use, from the host's own setting (`ADAPTER_MODEL_ALLOWLIST_JSON`, an object
 * of adapter id to list). Never from the adapter's manifest. Anything malformed means no list, so no grant.
 */
export function adapterModelAllowlist(raw: string | undefined, adapterId: string): string[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Object.hasOwn(parsed, adapterId)) return null;
  const list = (parsed as Record<string, unknown>)[adapterId];
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_ALLOWED_MODELS) return null;
  return list.every((entry) => typeof entry === "string" && ALLOWED_MODEL.test(entry)) ? [...list] as string[] : null;
}
