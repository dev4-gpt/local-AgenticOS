/** Host-side HTTP transport. Token minting remains in the host; no worker credential enters the payload. */
import { createHash } from "node:crypto";
import { validateAdapterManifest, type AdapterOperation } from "./adapterContracts";
import type { CommerceHostDraftDeps, CommerceHostDraftResponse } from "./commerceHostDraft";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fail = (): never => { throw new Error("commerce_draft_reconciliation_required"); };
const requestHash = (method: string, path: string, body: string) => createHash("sha256").update(`${method}\n${path}\n${body}`).digest("hex");
export interface CommerceDraftTransportConfig { baseUrl: string; tenantSlug: string; provider: string; model: string; maxBudgetMicros: number; allowInsecureLoopback?: boolean; timeoutMs?: number }
export interface CommerceDraftTransportDeps {
  /** Mint a new h1 token with exactly this operation, handles and request fingerprint. */
  mintToken: (input: { operation: AdapterOperation; handles?: readonly string[]; requestSha256: string }) => string | Promise<string>;
  fetchImpl?: typeof fetch;
}
async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.body) return fail(); const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 192000) { await reader.cancel(); return fail(); } chunks.push(value); }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail(); return value as Record<string, unknown>;
  } catch { return fail(); } finally { reader.releaseLock(); }
}
export function createCommerceDraftTransport(configuration: CommerceDraftTransportConfig, deps: CommerceDraftTransportDeps) {
  const config = { ...configuration }; let base: URL;
  try { base = new URL(config.baseUrl); } catch { throw new Error("invalid_commerce_transport"); }
  if ((base.protocol !== "https:" && !(config.allowInsecureLoopback === true && base.protocol === "http:" && base.hostname === "127.0.0.1")) || base.username || base.password || base.pathname !== "/" || base.search || base.hash
    || !/^[a-z][a-z0-9-]{2,40}$/.test(config.tenantSlug) || typeof config.provider !== "string" || !config.provider.trim() || config.provider.length > 120 || typeof config.model !== "string" || !config.model.trim() || config.model.length > 180 || !Number.isSafeInteger(config.maxBudgetMicros) || config.maxBudgetMicros < 1) throw new Error("invalid_commerce_transport");
  const timeout = config.timeoutMs ?? 100000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 110000 || typeof deps.mintToken !== "function") throw new Error("invalid_commerce_transport");
  const doFetch = deps.fetchImpl ?? fetch;
  async function call(operation: AdapterOperation, method: string, path: string, body: string, handles?: readonly string[]) {
    try {
      const token = await deps.mintToken({ operation, ...(handles?.length ? { handles: [...handles] } : {}), requestSha256: requestHash(method, path, body) });
      if (typeof token !== "string" || token.length > 4096 || !/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/.test(token)) return fail();
      const response = await doFetch(new URL(path, base).href, { method, headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(method === "POST" ? { "content-type": "application/json" } : {}) }, ...(method === "POST" ? { body } : {}), redirect: "error", signal: AbortSignal.timeout(timeout) });
      if (response.status !== 200) { await response.body?.cancel(); return fail(); }
      const value = await boundedJson(response); if (value.ok !== true) return fail(); return value;
    } catch { return fail(); }
  }
  function result(value: Record<string, unknown>, id: string): CommerceHostDraftResponse {
    const task = value.task as Record<string, unknown> | undefined, r = value.result as Record<string, unknown> | undefined;
    if (task?.id !== id || task.tenant !== config.tenantSlug || task.status !== "succeeded" || !r || Object.keys(r).sort().join("|") !== ["title", "body", "provider", "model", "costMicros", "costStatus"].sort().join("|")
      || typeof r.title !== "string" || !r.title.trim() || r.title.length > 200 || typeof r.body !== "string" || !r.body.trim() || r.body.length > 30000 || r.provider !== config.provider || r.model !== config.model || typeof r.costStatus !== "string" || !r.costStatus.trim() || r.costStatus.length > 100
      || (r.costMicros !== null && (typeof r.costMicros !== "number" || !Number.isSafeInteger(r.costMicros) || r.costMicros < 0 || r.costMicros > config.maxBudgetMicros))) return fail();
    return { title: r.title, body: r.body, provider: r.provider, model: r.model, costMicros: r.costMicros as number | null, costStatus: r.costStatus };
  }
  const runDraft: CommerceHostDraftDeps["runDraft"] = async input => {
    const id = input.taskId;
    if (!UUID.test(id) || input.tenant !== config.tenantSlug || input.provider !== config.provider || input.model !== config.model || input.budgetMaxMicros > config.maxBudgetMicros || !Number.isSafeInteger(input.budgetMaxMicros) || input.budgetMaxMicros < 1) return fail();
    const handles = input.sources.map(s => s.id);
    if (handles.length < 1 || handles.length > 5 || handles.some(id => !UUID.test(id)) || new Set(handles).size !== handles.length) return fail();
    const body = JSON.stringify({ tenantSlug: config.tenantSlug, adapterId: "veloce-commerce", task: "proposal.draft", idempotencyKey: `commerce:${id}:draft`, budgetMaxMicros: input.budgetMaxMicros, sideEffect: "draft", input: { taskId: id, sources: input.sources, instruction: input.instruction, provider: config.provider, model: config.model } });
    if (Buffer.byteLength(body) > 128000) return fail();
    return result(await call("task.run", "POST", "/h1/task.run", body, handles), id);
  };
  return {
    runDraft,
    async readResult(id: string, handles: readonly string[]) {
      if (!UUID.test(id) || !handles.length || handles.length > 5 || handles.some(value => !UUID.test(value))) return fail();
      return result(await call("task.result", "GET", `/h1/task.result?id=${id}`, "", handles), id);
    },
    async readManifest() {
      const value = await call("manifest", "GET", "/h1/manifest", "");
      let manifest; try { manifest = validateAdapterManifest(value.manifest); } catch { return fail(); }
      if (manifest.adapterId !== "veloce-commerce" || manifest.sideEffectCeiling !== "draft" || manifest.deletionGuarantee !== "none") return fail(); return manifest;
    },
  };
}
