import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function safeRelative(value) {
  return typeof value === "string" && !/[\\\x00-\x1f\x7f*?#\[\]]/.test(value)
    && !value.split("/").some((part) => !part || part === "." || part === "..");
}

async function inventory(directory, namespace) {
  if (!/^[a-z][a-z0-9-]{2,40}$/.test(namespace)) throw new Error("Invalid backup namespace");
  const base = path.resolve(directory);
  if (!(await lstat(base)).isDirectory()) throw new Error("Object backup must be a real directory");
  const top = await readdir(base);
  const layout = top.includes(namespace) ? "nested" : "flat";
  if (layout === "nested" && top.length !== 1) throw new Error("Ambiguous object backup layout");
  const root = layout === "nested" ? path.join(base, namespace) : base;
  if (!(await lstat(root)).isDirectory()) throw new Error("Object backup namespace must be a real directory");
  const files = [];
  async function visit(relative = "", depth = 0) {
    if (depth > 64) throw new Error("Object backup directory depth exceeds the verification limit");
    for (const name of (await readdir(path.join(root, relative))).sort()) {
      const item = relative ? `${relative}/${name}` : name;
      if (!safeRelative(item)) throw new Error("Unsafe object backup path");
      const source = path.join(root, item);
      const before = await lstat(source);
      if (before.isDirectory()) { await visit(item, depth + 1); continue; }
      if (!before.isFile()) throw new Error("Object backup contains a symlink or special file");
      if (files.length >= 100000) throw new Error("Object backup file count exceeds the verification limit");
      const hash = createHash("sha256");
      const md5 = createHash("md5");
      for await (const bytes of createReadStream(source, { flags: constants.O_RDONLY | constants.O_NOFOLLOW })) {
        hash.update(bytes);
        md5.update(bytes);
      }
      const after = await lstat(source);
      if (!after.isFile() || ["dev", "ino", "size", "mtimeMs", "ctimeMs"].some((key) => before[key] !== after[key])) {
        throw new Error("Object backup changed during verification");
      }
      files.push({ path: item, byteSize: before.size, sha256: hash.digest("hex"), md5: md5.digest("base64") });
    }
  }
  await visit();
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { root, layout, files };
}

function validateArtifacts(files, namespace, artifacts) {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const seen = new Set();
  for (const artifact of artifacts) {
    const key = artifact.object_key;
    if (artifact.tenant_slug !== namespace || typeof key !== "string" || !key.startsWith(`${namespace}/`)
      || !safeRelative(key) || seen.has(key)) throw new Error("Invalid or duplicate artifact backup reference");
    seen.add(key);
    const status = artifact.status ?? "ready";
    if (!["ready", "pending", "deleted"].includes(status)) throw new Error("Unrecognized artifact backup status");
    const file = byPath.get(key.slice(namespace.length + 1));
    if (status === "deleted" && file) throw new Error("Refusing to restore deleted artifact bytes");
    if (status === "ready" && !file) throw new Error("Object backup is missing a ready artifact");
    const size = typeof artifact.byte_size === "number" ? artifact.byte_size
      : typeof artifact.byte_size === "string" && /^\d+$/.test(artifact.byte_size) ? Number(artifact.byte_size) : NaN;
    if (!Number.isSafeInteger(size) || size < 0 || (file && file.byteSize !== size)) {
      throw new Error("Object backup artifact size mismatch");
    }
  }
}

export async function writeClientObjectBackupManifest(directory, namespace, snapshotBytes, artifacts = []) {
  const current = await inventory(directory, namespace);
  validateArtifacts(current.files, namespace, artifacts);
  const manifest = { schemaVersion: 1, namespace,
    snapshotSha256: createHash("sha256").update(snapshotBytes).digest("hex"),
    layout: current.layout, files: current.files };
  await writeFile(`${path.resolve(directory)}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return manifest;
}

export async function verifyClientObjectBackup(directory, namespace, snapshotBytes, artifacts = []) {
  const manifestPath = `${path.resolve(directory)}.manifest.json`;
  const stat = await lstat(manifestPath).catch(() => null);
  if (!stat?.isFile() || stat.size > 64 * 1024 * 1024) throw new Error("Object backup requires its matching integrity manifest; create a fresh verified export");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest?.schemaVersion !== 1 || manifest.namespace !== namespace
    || manifest.snapshotSha256 !== createHash("sha256").update(snapshotBytes).digest("hex") || !Array.isArray(manifest.files)) {
    throw new Error("Object backup integrity manifest does not match the snapshot");
  }
  const current = await inventory(directory, namespace);
  if (manifest.layout !== current.layout || manifest.files.length !== current.files.length
    || manifest.files.some((file, index) => !file || ["path", "byteSize", "sha256", "md5"].some((key) => file[key] !== current.files[index][key]))) {
    throw new Error("Object backup integrity verification failed");
  }
  validateArtifacts(current.files, namespace, artifacts);
  return current.files.map((file) => ({ ...file, source: path.join(current.root, file.path), objectKey: `${namespace}/${file.path}` }));
}
