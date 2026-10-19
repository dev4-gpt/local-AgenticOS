/**
 * Short-lived Ed25519 tokens the host sends to an adapter (and an adapter sends back) so each call proves
 * who it is for, which tenant, which operations, and when it expires. See ADR-006.
 *
 * Token format: base64url(payload JSON) "." base64url(Ed25519 signature over the first part).
 * Keys are passed in by the caller; this module never reads the environment or the disk.
 * Replay protection is a separate database step (client_adapter_consume_token), keyed by tenant and jti.
 */
import { randomUUID, sign, verify, createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { ADAPTER_OPERATIONS, isValidAdapterId, isValidTenantSlug, type AdapterOperation } from "./adapterContracts";

export const TOKEN_VERSION = "h1" as const;
export const TOKEN_ISSUER = "veloce-host" as const;
export const MAX_TOKEN_TTL_SECONDS = 300;
export const DEFAULT_TOKEN_TTL_SECONDS = 60;
export const MAX_CLOCK_SKEW_SECONDS = 30;
const MAX_TOKEN_CHARS = 4096;
const JTI = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface AdapterTokenClaims {
  v: typeof TOKEN_VERSION;
  iss: typeof TOKEN_ISSUER;
  tenant: string;
  aud: string;
  scope: AdapterOperation[];
  jti: string;
  iat: number;
  exp: number;
}

export type TokenFailure =
  | "malformed"
  | "bad_signature"
  | "wrong_version"
  | "wrong_issuer"
  | "wrong_tenant"
  | "wrong_audience"
  | "scope_not_allowed"
  | "expired"
  | "not_yet_valid"
  | "ttl_too_long";

export type VerifyResult = { ok: true; claims: AdapterTokenClaims } | { ok: false; reason: TokenFailure };

const b64 = (buffer: Buffer) => buffer.toString("base64url");

/** Accepts a PEM string or an existing key object. Throws if the key is not Ed25519. */
export function ed25519PrivateKey(pemOrKey: string | KeyObject): KeyObject {
  const key = typeof pemOrKey === "string" ? createPrivateKey(pemOrKey) : pemOrKey;
  if (key.asymmetricKeyType !== "ed25519") throw new Error("adapter token key must be Ed25519");
  return key;
}

export function ed25519PublicKey(pemOrKey: string | KeyObject): KeyObject {
  const key = typeof pemOrKey === "string" ? createPublicKey(pemOrKey) : pemOrKey;
  if (key.asymmetricKeyType !== "ed25519") throw new Error("adapter token key must be Ed25519");
  return key;
}

export interface MintInput {
  privateKey: string | KeyObject;
  tenant: string;
  adapterId: string;
  scope: readonly AdapterOperation[];
  ttlSeconds?: number;
  now?: number; // seconds since epoch; tests only
}

export function mintAdapterToken(input: MintInput): { token: string; claims: AdapterTokenClaims } {
  const ttl = input.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS;
  if (!isValidTenantSlug(input.tenant)) throw new Error("invalid tenant");
  if (!isValidAdapterId(input.adapterId)) throw new Error("invalid adapter id");
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TOKEN_TTL_SECONDS) throw new Error("invalid token lifetime");
  const scope = [...new Set(input.scope)];
  if (!scope.length || scope.some((op) => !ADAPTER_OPERATIONS.includes(op))) throw new Error("invalid token scope");
  const iat = input.now ?? Math.floor(Date.now() / 1000);
  const claims: AdapterTokenClaims = { v: TOKEN_VERSION, iss: TOKEN_ISSUER, tenant: input.tenant, aud: input.adapterId, scope, jti: randomUUID(), iat, exp: iat + ttl };
  const body = b64(Buffer.from(JSON.stringify(claims), "utf8"));
  const signature = sign(null, Buffer.from(body, "utf8"), ed25519PrivateKey(input.privateKey));
  return { token: `${body}.${b64(signature)}`, claims };
}

export interface VerifyInput {
  token: unknown;
  publicKey: string | KeyObject;
  expectedTenant: string;
  expectedAdapterId: string;
  requiredOperation: AdapterOperation;
  now?: number;
}

function parseClaims(body: string): AdapterTokenClaims | null {
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const { v, iss, tenant, aud, scope, jti, iat, exp } = value;
    if (typeof v !== "string" || typeof iss !== "string" || typeof tenant !== "string" || typeof aud !== "string") return null;
    if (!Array.isArray(scope) || !scope.every((op) => typeof op === "string")) return null;
    if (typeof jti !== "string" || !JTI.test(jti)) return null;
    if (!Number.isInteger(iat) || !Number.isInteger(exp)) return null;
    return { v, iss, tenant, aud, scope, jti, iat, exp } as AdapterTokenClaims;
  } catch {
    return null;
  }
}

/** Checks signature first, then every claim. Never throws on bad tokens; only on a bad key. */
export function verifyAdapterToken(input: VerifyInput): VerifyResult {
  const publicKey = ed25519PublicKey(input.publicKey);
  if (typeof input.token !== "string" || input.token.length > MAX_TOKEN_CHARS) return { ok: false, reason: "malformed" };
  const parts = input.token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [body, signature] = parts;
  const signatureBytes = Buffer.from(signature, "base64url");
  if (signatureBytes.length !== 64) return { ok: false, reason: "malformed" };
  if (!verify(null, Buffer.from(body, "utf8"), publicKey, signatureBytes)) return { ok: false, reason: "bad_signature" };
  const claims = parseClaims(body);
  if (!claims) return { ok: false, reason: "malformed" };
  if (claims.v !== TOKEN_VERSION) return { ok: false, reason: "wrong_version" };
  if (claims.iss !== TOKEN_ISSUER) return { ok: false, reason: "wrong_issuer" };
  if (claims.tenant !== input.expectedTenant) return { ok: false, reason: "wrong_tenant" };
  if (claims.aud !== input.expectedAdapterId) return { ok: false, reason: "wrong_audience" };
  if (!claims.scope.includes(input.requiredOperation)) return { ok: false, reason: "scope_not_allowed" };
  if (claims.exp - claims.iat > MAX_TOKEN_TTL_SECONDS || claims.exp <= claims.iat) return { ok: false, reason: "ttl_too_long" };
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (claims.iat > now + MAX_CLOCK_SKEW_SECONDS) return { ok: false, reason: "not_yet_valid" };
  if (claims.exp <= now) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}

export type ConsumeRpc = (functionName: string, body: Record<string, unknown>) => Promise<{ ok: boolean; status: number; value: unknown }>;

/** Marks the token's jti as used. True only the first time; any failure counts as not usable. */
export async function consumeAdapterToken(rpc: ConsumeRpc, input: { tenantSlug: string; workerToken: string; claims: AdapterTokenClaims }): Promise<boolean> {
  if (!isValidTenantSlug(input.tenantSlug) || input.tenantSlug !== input.claims.tenant) return false;
  if (typeof input.workerToken !== "string" || input.workerToken.length < 24) return false;
  const result = await rpc("client_adapter_consume_token", {
    p_tenant_slug: input.tenantSlug,
    p_worker_token: input.workerToken,
    p_adapter_id: input.claims.aud,
    p_jti: input.claims.jti,
    p_expires_at: new Date(input.claims.exp * 1000).toISOString(),
  });
  return result.ok && result.value === true;
}
