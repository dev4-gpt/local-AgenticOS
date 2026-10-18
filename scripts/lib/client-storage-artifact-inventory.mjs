import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { readClientExportPages } from "./client-export-pages.mjs";

export const CLIENT_STORAGE_ARTIFACT_CROSSWALK = "stable-artifact-listing-v1";
export const CLIENT_STORAGE_ARTIFACT_COLUMNS = "id,tenant_slug,object_key,content_type,byte_size,status,created_at,retention_expires_at";
const DAY_MS = 86_400_000;
const date = (value) => typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function boundedPage(response) {
  if (!response.body) throw new Error("artifact_inventory_response_invalid");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 4 * 1024 * 1024) throw new Error("artifact_inventory_response_invalid");
      chunks.push(next.value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new Error("artifact_inventory_response_invalid");
  } finally { reader.releaseLock(); }
}

function canonicalRows(rows, namespace, completedAt) {
  if (!Array.isArray(rows) || rows.length > 50_000) throw new Error("artifact_inventory_rows_invalid");
  const ids = new Set();
  const keys = new Set();
  return rows.map((row) => {
    const created = date(row?.created_at);
    const expiry = date(row?.retention_expires_at);
    const size = typeof row?.byte_size === "number" ? row.byte_size
      : typeof row?.byte_size === "string" && /^(?:0|[1-9][0-9]*)$/.test(row.byte_size) ? Number(row.byte_size) : NaN;
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row?.id ?? "")
      || row.tenant_slug !== namespace || typeof row.object_key !== "string" || !row.object_key.startsWith(`${namespace}/`)
      || row.object_key.length > 1024 || /[\\\x00-\x1f\x7f]/.test(row.object_key)
      || row.object_key.split("/").some((part) => !part || part === "." || part === "..")
      || ids.has(row.id) || keys.has(row.object_key) || !["ready", "pending", "deleted"].includes(row.status)
      || !Number.isSafeInteger(size) || size < 0 || typeof row.content_type !== "string"
      || !row.content_type || row.content_type.length > 255 || /[\r\n]/.test(row.content_type)
      || !Number.isFinite(created) || created > completedAt || !Number.isFinite(expiry)
      || expiry <= created || expiry > created + 28 * DAY_MS) throw new Error("artifact_inventory_row_invalid");
    ids.add(row.id);
    keys.add(row.object_key);
    return { id: row.id, tenant_slug: row.tenant_slug, object_key: row.object_key, content_type: row.content_type,
      byte_size: size, status: row.status, created_at: new Date(created).toISOString(), retention_expires_at: new Date(expiry).toISOString() };
  }).sort((left, right) => left.id.localeCompare(right.id));
}

export function evaluateClientStorageArtifactInventory(snapshot, expected) {
  const inventory = snapshot?.artifactInventory;
  const before = inventory?.before;
  const after = inventory?.after;
  const times = [date(before?.startedAt), date(before?.completedAt), date(snapshot?.listingStartedAt),
    date(snapshot?.listingCompletedAt), date(after?.startedAt), date(after?.completedAt), date(snapshot?.checkedAt)];
  if (inventory?.schemaVersion !== 1 || inventory.projectRef !== expected.supabaseProjectRef
    || !/^[a-z0-9]{20}$/.test(expected.supabaseProjectRef ?? "") || inventory.namespace !== expected.namespace
    || before?.complete !== true || after?.complete !== true || times.some((value) => !Number.isFinite(value))
    || times.some((value, index) => index > 0 && value < times[index - 1])
    || times[6] - times[0] > DAY_MS) throw new Error("artifact_inventory_identity_or_collection_invalid");
  const first = canonicalRows(before.rows, expected.namespace, times[1]);
  const last = canonicalRows(after.rows, expected.namespace, times[5]);
  const firstHash = hash(first);
  if (firstHash !== hash(last)) throw new Error("artifact_inventory_changed_during_listing");
  return { rows: last, sha256: firstHash, projectRef: inventory.projectRef, startedAt: before.startedAt, checkedAt: after.completedAt };
}

export async function collectClientStorageArtifactSample({ url, token, namespace, projectRef, request = fetch }) {
  if (!/^[a-z0-9]{20}$/.test(projectRef ?? "") || url !== `https://${projectRef}.supabase.co`
    || !/^[a-z][a-z0-9-]{2,40}$/.test(namespace ?? "") || typeof token !== "string" || !token) {
    throw new Error("artifact_inventory_connection_invalid");
  }
  const startedAt = new Date().toISOString();
  let pages = 0;
  const rows = await readClientExportPages({ table: "client_runtime_artifacts",
    filter: new URLSearchParams({ tenant_slug: `eq.${namespace}` }).toString(), columns: CLIENT_STORAGE_ARTIFACT_COLUMNS,
    request: async (pathname) => {
      if (++pages > 101) throw new Error("artifact_inventory_page_limit");
      const response = await request(`${url}/rest/v1/${pathname}`, {
        method: "GET", headers: { apikey: token, Authorization: `Bearer ${token}` },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
      }).catch(() => { throw new Error("artifact_inventory_request_failed"); });
      return { ok: response.ok, status: response.status, json: async () => {
        const page = await boundedPage(response);
        if (!Array.isArray(page) || page.length > 500) throw new Error("artifact_inventory_page_invalid");
        return page;
      } };
    } });
  const completedAt = new Date().toISOString();
  return { startedAt, completedAt, complete: true, rows: canonicalRows(rows, namespace, Date.parse(completedAt)) };
}
