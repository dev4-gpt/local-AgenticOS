type SourceFile = Pick<File, "name" | "size" | "arrayBuffer">;

type Batch<T extends SourceFile> = { file: T; sha256: string | null };

const MAX_FILE_BYTES = 1_000_000;
const MAX_BATCHES = 100;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function count(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function fileName(value: string) {
  return value.split(/[\\/]/).pop() || "";
}

function canonicalHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

async function readJson(file: SourceFile): Promise<{ value: Record<string, unknown>; bytes: ArrayBuffer }> {
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size) throw new Error("source_batch_size_changed");
  try {
    const value = record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    if (value) return { value, bytes };
  } catch { /* Return one stable error for malformed input. */ }
  throw new Error("source_batch_json_invalid");
}

async function sha256(bytes: ArrayBuffer) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function selectClientSourceBatches<T extends SourceFile>(files: T[]): Promise<{ batches: Batch<T>[]; sourceCount: number | null; linkCount: number | null; skippedCount: number | null }> {
  if (!files.length || files.length > MAX_BATCHES + 1 || files.some((file) => !file.name.toLowerCase().endsWith(".json") || file.size < 1 || file.size > MAX_FILE_BYTES)) throw new Error("source_batch_files_invalid");
  if (new Set(files.map((file) => file.name)).size !== files.length) throw new Error("source_batch_files_duplicate");
  const manifests = files.filter((file) => file.name.toLowerCase().endsWith(".manifest.json"));
  const parts = files.filter((file) => !file.name.toLowerCase().endsWith(".manifest.json"));
  if (manifests.length > 1 || !parts.length) throw new Error("source_batch_manifest_invalid");
  if (!manifests.length) {
    if (parts.length !== 1 || /\.part-\d+\.json$/i.test(parts[0].name)) throw new Error("source_batch_manifest_required");
    return { batches: [{ file: parts[0], sha256: null }], sourceCount: null, linkCount: null, skippedCount: null };
  }

  const manifest = (await readJson(manifests[0])).value;
  const entries = manifest.batches;
  if (manifest.version !== 1 || typeof manifest.startUrl !== "string" || !Array.isArray(entries) || !entries.length || entries.length !== parts.length || entries.length > MAX_BATCHES) throw new Error("source_batch_manifest_invalid");
  const sourceCount = count(manifest.sources);
  const linkCount = count(manifest.links);
  const skippedCount = count(manifest.skipped);
  const startUrl = canonicalHttpUrl(manifest.startUrl);
  if (sourceCount === null || linkCount === null || skippedCount === null || !startUrl) throw new Error("source_batch_manifest_invalid");
  const byName = new Map(parts.map((file) => [file.name, file]));
  const batches: Batch<T>[] = [];
  const importKeys = new Set<string>();
  let sources = 0;
  let links = 0;
  let skipped = 0;
  for (const [index, rawEntry] of entries.entries()) {
    const entry = record(rawEntry);
    const name = typeof entry?.file === "string" ? fileName(entry.file) : "";
    const file = byName.get(name);
    const expectedHash = entry?.sha256;
    const expectedSources = count(entry?.sources);
    const expectedLinks = count(entry?.links);
    if (!file || !name.endsWith(`.part-${String(index + 1).padStart(3, "0")}.json`) || typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash) || expectedSources === null || expectedLinks === null) throw new Error("source_batch_manifest_invalid");
    const { value, bytes } = await readJson(file);
    if (await sha256(bytes) !== expectedHash || value.startUrl !== manifest.startUrl || !Array.isArray(value.sources) || !Array.isArray(value.skipped)) throw new Error("source_batch_manifest_mismatch");
    for (const rawSource of value.sources) {
      const source = record(rawSource);
      const url = canonicalHttpUrl(source?.url);
      if (!source || !url) throw new Error("source_batch_manifest_mismatch");
      const tab = typeof source.tab === "string" ? source.tab.trim() : "";
      const key = JSON.stringify([startUrl, url, tab]);
      if (importKeys.has(key)) throw new Error("source_batch_duplicate_source");
      importKeys.add(key);
    }
    const actualLinks = value.sources.reduce<number | null>((total, source) => {
      const item = record(source);
      return total !== null && item && Array.isArray(item.links) ? total + item.links.length : null;
    }, 0);
    if (value.sources.length !== expectedSources || actualLinks !== expectedLinks) throw new Error("source_batch_manifest_mismatch");
    sources += value.sources.length;
    links += actualLinks;
    skipped += value.skipped.length;
    batches.push({ file, sha256: expectedHash });
    byName.delete(name);
  }
  if (byName.size || sources !== sourceCount || links !== linkCount || skipped !== skippedCount) throw new Error("source_batch_manifest_mismatch");
  return { batches, sourceCount, linkCount, skippedCount };
}
