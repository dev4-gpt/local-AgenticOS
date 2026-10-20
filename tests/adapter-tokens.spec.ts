import { expect, test } from "@playwright/test";
import { generateKeyPairSync, sign } from "node:crypto";
import { loadReviewModule } from "./helpers/load-review-module";

// Keys are generated inside each run; no real key or credential is used.
const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const tokens = loadReviewModule("src/lib/adapterTokens.ts", { "./adapterContracts": contracts });
const pair = () => generateKeyPairSync("ed25519");
const NOW = 1_800_000_000;

function mint(privateKey: unknown, extra: Record<string, unknown> = {}) {
  return tokens.mintAdapterToken({ privateKey, tenant: "tenant-a", adapterId: "forge", scope: ["task.run", "health"], now: NOW, ...extra });
}
const verify = (token: unknown, publicKey: unknown, extra: Record<string, unknown> = {}) =>
  tokens.verifyAdapterToken({ token, publicKey, expectedTenant: "tenant-a", expectedAdapterId: "forge", requiredOperation: "task.run", now: NOW + 10, ...extra });

test("a minted token verifies for the right tenant, adapter and operation", () => {
  const { privateKey, publicKey } = pair();
  const { token, claims } = mint(privateKey);
  const result = verify(token, publicKey);
  expect(result.ok).toBe(true);
  expect(result.claims).toEqual(claims);
  expect(claims.exp - claims.iat).toBe(60);
  expect(claims.scope).toEqual(["task.run", "health"]);
});

test("a token signed by another key, or edited after signing, is refused", () => {
  const a = pair();
  const b = pair();
  const { token } = mint(a.privateKey);
  expect(verify(token, b.publicKey)).toEqual({ ok: false, reason: "bad_signature" });
  const [body, sig] = token.split(".");
  const forged = { ...JSON.parse(Buffer.from(body, "base64url").toString()), aud: "other-adapter" };
  const forgedBody = Buffer.from(JSON.stringify(forged)).toString("base64url");
  expect(verify(`${forgedBody}.${sig}`, a.publicKey)).toEqual({ ok: false, reason: "bad_signature" });
});

test("tenant, adapter and operation must all match", () => {
  const { privateKey, publicKey } = pair();
  const { token } = mint(privateKey);
  expect(verify(token, publicKey, { expectedTenant: "tenant-b" })).toEqual({ ok: false, reason: "wrong_tenant" });
  expect(verify(token, publicKey, { expectedAdapterId: "knowledge" })).toEqual({ ok: false, reason: "wrong_audience" });
  expect(verify(token, publicKey, { requiredOperation: "memory.propose" })).toEqual({ ok: false, reason: "scope_not_allowed" });
});

test("expired, not-yet-valid and over-long tokens are refused; small clock skew is allowed", () => {
  const { privateKey, publicKey } = pair();
  const { token } = mint(privateKey, { ttlSeconds: 60 });
  expect(verify(token, publicKey, { now: NOW + 60 })).toEqual({ ok: false, reason: "expired" });
  expect(verify(token, publicKey, { now: NOW - 20 }).ok).toBe(true);
  expect(verify(token, publicKey, { now: NOW - 31 })).toEqual({ ok: false, reason: "not_yet_valid" });
  // A correctly signed token that claims a longer life than the host allows.
  const claims = { v: "h1", iss: "veloce-host", tenant: "tenant-a", aud: "forge", scope: ["task.run"], jti: "00000000-0000-4000-8000-000000000001", iat: NOW, exp: NOW + 3600 };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const long = `${body}.${sign(null, Buffer.from(body), privateKey).toString("base64url")}`;
  expect(verify(long, publicKey)).toEqual({ ok: false, reason: "ttl_too_long" });
});

test("wrong version or issuer is refused even with a valid signature", () => {
  const { privateKey, publicKey } = pair();
  const base = { v: "h1", iss: "veloce-host", tenant: "tenant-a", aud: "forge", scope: ["task.run"], jti: "00000000-0000-4000-8000-000000000001", iat: NOW, exp: NOW + 60 };
  const signed = (claims: object) => {
    const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
    return `${body}.${sign(null, Buffer.from(body), privateKey).toString("base64url")}`;
  };
  expect(verify(signed({ ...base, v: "h2" }), publicKey)).toEqual({ ok: false, reason: "wrong_version" });
  expect(verify(signed({ ...base, iss: "someone-else" }), publicKey)).toEqual({ ok: false, reason: "wrong_issuer" });
  expect(verify(signed({ ...base, jti: "not-a-uuid" }), publicKey)).toEqual({ ok: false, reason: "malformed" });
  expect(verify(signed({ ...base, exp: "soon" }), publicKey)).toEqual({ ok: false, reason: "malformed" });
});

test("garbage input never throws and is reported as malformed", () => {
  const { publicKey } = pair();
  for (const bad of [undefined, null, 42, "", "a", "a.b", "a.b.c", ".", "x".repeat(5000)]) {
    const result = verify(bad, publicKey);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("malformed");
  }
  // Right shape but not a real signature: refused as a bad signature, not an error.
  expect(verify(`${"a".repeat(10)}.${"b".repeat(86)}`, publicKey)).toEqual({ ok: false, reason: "bad_signature" });
});

test("minting refuses bad tenants, adapters, scopes and lifetimes, and non-Ed25519 keys", () => {
  const { privateKey } = pair();
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
  expect(() => mint(privateKey, { tenant: "BAD TENANT" })).toThrow();
  expect(() => mint(privateKey, { adapterId: "x" })).toThrow();
  expect(() => mint(privateKey, { scope: [] })).toThrow();
  expect(() => mint(privateKey, { scope: ["delete-everything"] })).toThrow();
  expect(() => mint(privateKey, { ttlSeconds: 0 })).toThrow();
  expect(() => mint(privateKey, { ttlSeconds: 301 })).toThrow();
  expect(() => mint(privateKey, { ttlSeconds: 1.5 })).toThrow();
  expect(() => mint(rsa.privateKey)).toThrow(/Ed25519/);
  expect(() => verify("a.b", rsa.publicKey)).toThrow(/Ed25519/);
});

test("every minted token has its own id, and PEM keys work", () => {
  const { privateKey, publicKey } = pair();
  const pemPrivate = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  const pemPublic = publicKey.export({ type: "spki", format: "pem" }) as string;
  const first = mint(pemPrivate);
  const second = mint(pemPrivate);
  expect(first.claims.jti).not.toBe(second.claims.jti);
  expect(verify(first.token, pemPublic).ok).toBe(true);
});

test("consumeAdapterToken only calls the database for matching tenants and returns true only on an exact true", async () => {
  const { privateKey } = pair();
  const { claims } = mint(privateKey);
  const calls: Record<string, unknown>[] = [];
  const rpc = (value: unknown) => async (_n: string, body: Record<string, unknown>) => { calls.push(body); return { ok: true, status: 200, value }; };
  const worker = "w".repeat(30);
  expect(await tokens.consumeAdapterToken(rpc(true), { tenantSlug: "tenant-a", workerToken: worker, claims })).toBe(true);
  expect(calls[0]).toMatchObject({ p_tenant_slug: "tenant-a", p_adapter_id: "forge", p_jti: claims.jti });
  expect(await tokens.consumeAdapterToken(rpc(false), { tenantSlug: "tenant-a", workerToken: worker, claims })).toBe(false);
  expect(await tokens.consumeAdapterToken(rpc("true"), { tenantSlug: "tenant-a", workerToken: worker, claims })).toBe(false);
  const before = calls.length;
  expect(await tokens.consumeAdapterToken(rpc(true), { tenantSlug: "tenant-b", workerToken: worker, claims })).toBe(false);
  expect(await tokens.consumeAdapterToken(rpc(true), { tenantSlug: "tenant-a", workerToken: "short", claims })).toBe(false);
  expect(calls.length).toBe(before);
});

// Item 7: scoped handles. A token can name the memory items an adapter may read; a request for any other id is refused.
const H1 = "00000000-0000-4000-8000-000000000001";
const H2 = "00000000-0000-4000-8000-000000000002";
const H3 = "00000000-0000-4000-8000-000000000003";

test("a token with handles verifies only for the items it names", () => {
  const { privateKey, publicKey } = pair();
  const { token, claims } = mint(privateKey, { handles: [H1, H2, H1] });
  expect(claims.handles).toEqual([H1, H2]); // duplicates collapse
  expect(verify(token, publicKey, { requestedItemIds: [H1] }).ok).toBe(true);
  expect(verify(token, publicKey, { requestedItemIds: [H2, H1] }).ok).toBe(true);
  expect(verify(token, publicKey, { requestedItemIds: [H1, H3] })).toEqual({ ok: false, reason: "handle_not_allowed" });
  expect(verify(token, publicKey, { requestedItemIds: [] })).toEqual({ ok: false, reason: "handle_not_allowed" });
  expect(verify(token, publicKey).ok).toBe(true); // not asking for items is a different check
});

test("a token without handles cannot be used to read any item", () => {
  const { privateKey, publicKey } = pair();
  const { token, claims } = mint(privateKey);
  expect(claims.handles).toBeUndefined();
  expect(verify(token, publicKey, { requestedItemIds: [H1] })).toEqual({ ok: false, reason: "handle_not_allowed" });
});

test("handles are limited to 20 valid ids and cannot be edited after signing", () => {
  const { privateKey, publicKey } = pair();
  const ids = Array.from({ length: 20 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
  expect(mint(privateKey, { handles: ids }).claims.handles).toHaveLength(20);
  expect(() => mint(privateKey, { handles: [...ids, H3.replace("3", "f")] })).toThrow("invalid token handles");
  expect(() => mint(privateKey, { handles: [] })).toThrow("invalid token handles");
  expect(() => mint(privateKey, { handles: ["not-a-uuid"] })).toThrow("invalid token handles");
  const { token } = mint(privateKey, { handles: [H1] });
  const [body, sig] = token.split(".");
  const widened = { ...JSON.parse(Buffer.from(body, "base64url").toString()), handles: [H1, H3] };
  expect(verify(`${Buffer.from(JSON.stringify(widened)).toString("base64url")}.${sig}`, publicKey, { requestedItemIds: [H3] })).toEqual({ ok: false, reason: "bad_signature" });
});

test("a correctly signed token with malformed handles is refused as malformed", () => {
  const { privateKey, publicKey } = pair();
  const { claims } = mint(privateKey, { handles: [H1] });
  for (const handles of [[], "x", [1], ["nope"], Array.from({ length: 21 }, () => H1)]) {
    const body = Buffer.from(JSON.stringify({ ...claims, handles })).toString("base64url");
    const sig = sign(null, Buffer.from(body, "utf8"), privateKey).toString("base64url");
    expect(verify(`${body}.${sig}`, publicKey, { requestedItemIds: [H1] })).toEqual({ ok: false, reason: "malformed" });
  }
});

// Added by the Phase 1 mutation sweep (item 16): a correctly signed token with a wrongly shaped scope.
test("a signed token whose scope is not a list of operation names is refused as malformed", () => {
  const { privateKey, publicKey } = pair();
  const { claims } = mint(privateKey);
  for (const scope of ["task.run", [1, 2], { 0: "task.run" }, null]) {
    const body = Buffer.from(JSON.stringify({ ...claims, scope })).toString("base64url");
    const sig = sign(null, Buffer.from(body, "utf8"), privateKey).toString("base64url");
    expect(verify(`${body}.${sig}`, publicKey), JSON.stringify(scope)).toEqual({ ok: false, reason: "malformed" });
  }
  // Non-object payloads and non-string identity fields never verify either.
  for (const payload of [[], "x", 5, { ...claims, aud: 7 }, { ...claims, tenant: null }]) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = sign(null, Buffer.from(body, "utf8"), privateKey).toString("base64url");
    expect(verify(`${body}.${sig}`, publicKey).ok, JSON.stringify(payload)).toBe(false);
  }
});
