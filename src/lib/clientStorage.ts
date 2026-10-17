import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { clientStorageRetentionClock } from "./clientStorageRetentionClock.mjs";
import { clientRuntimeAccessToken } from "./clientGcpIdentity";
import { readBoundedResponseBytes } from "./clientNetworkSafety";

export function clientStorageConfig() {
  const bucket = process.env.CLIENT_STORAGE_BUCKET?.trim();
  const namespace = process.env.CLIENT_STORAGE_NAMESPACE?.trim();
  const serviceAccount = process.env.CLIENT_RUNTIME_SERVICE_ACCOUNT?.trim();
  return bucket && namespace ? { bucket, namespace, serviceAccount } : null;
}

export function safeClientFileName(value: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!normalized || normalized === "." || normalized === "..") return null;
  return normalized.slice(0, 180);
}

export function safeClientObjectKey(value: string, namespace: string) {
  return value.startsWith(`${namespace}/`)
    && !value.startsWith("/")
    && !value.includes("\\")
    && !value.split("/").some((part) => part === ".." || part.length === 0);
}

export async function clientGcpAccessToken() {
  return clientRuntimeAccessToken();
}

export async function clientStorageObjectMetadata(bucket: string, objectKey: string, token: string) {
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectKey)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  const data = await response.json().catch(() => null) as { size?: string; contentType?: string } | null;
  const size = Number(data?.size ?? -1);
  return Number.isFinite(size) && size >= 0 && typeof data?.contentType === "string" ? { size, contentType: data.contentType } : null;
}

export async function readClientStorageObject(input: { bucket: string; objectKey: string; token: string; maxBytes: number }) {
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(input.bucket)}/o/${encodeURIComponent(input.objectKey)}?alt=media`, {
    headers: { Authorization: `Bearer ${input.token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!response?.ok || !response.body) return null;
  try {
    return await readBoundedResponseBytes(response, input.maxBytes);
  } catch {
    return null;
  }
}

export async function proxyClientStorageObject(input: { bucket: string; objectKey: string; token: string; maxBytes: number; expectedBytes: number }) {
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(input.bucket)}/o/${encodeURIComponent(input.objectKey)}?alt=media`, {
    headers: { Authorization: `Bearer ${input.token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  }).catch(() => null);
  if (!response?.ok || !response.body) return null;
  const contentLength = response.headers.get("content-length");
  const size = contentLength === null ? null : Number(contentLength);
  if (size !== null && (!Number.isSafeInteger(size) || size < 0 || size > input.maxBytes || size !== input.expectedBytes)) {
    await response.body.cancel().catch(() => undefined);
    return null;
  }
  let streamedBytes = 0;
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      streamedBytes += chunk.byteLength;
      if (streamedBytes > input.maxBytes) {
        controller.error(new Error("storage_object_too_large"));
        return;
      }
      controller.enqueue(chunk);
    },
    flush(controller) {
      if (streamedBytes !== input.expectedBytes) controller.error(new Error("storage_object_size_mismatch"));
    },
  }));
  return {
    body,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    contentLength: size === null ? null : String(size),
  };
}

export async function deleteClientStorageObject(bucket: string, objectKey: string, token: string) {
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectKey)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  return response?.status === 204 || response?.status === 404;
}

export async function uploadClientStorageObject(input: {
  bucket: string;
  objectKey: string;
  contentType: string;
  bytes: Buffer;
  token: string;
  retentionExpiresAt: string;
}) {
  const clock = clientStorageRetentionClock(input.retentionExpiresAt, process.env.CLIENT_RETENTION_DAYS);
  if (!clock) return false;
  const md5 = createHash("md5").update(input.bytes).digest("base64");
  // XML PUT sets the bytes and original-deadline metadata in one create-only write.
  const response = await fetch(`https://storage.googleapis.com/${encodeURIComponent(input.bucket)}/${input.objectKey.split("/").map(encodeURIComponent).join("/")}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": input.contentType,
      "Content-MD5": md5,
      "Cache-Control": "private, no-store", "x-goog-if-generation-match": "0",
      "x-goog-custom-time": clock.customTime,
      "x-goog-meta-agentos-retention-expires-at": clock.retentionExpiresAt,
      "x-goog-meta-agentos-retention-clock": clock.policy },
    body: new Uint8Array(input.bytes) as unknown as BodyInit,
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  }).catch(() => null);
  if (response?.ok) return true;
  if (response?.status !== 412) return false;
  // Reconcile an unknown previous upload without replacing its bytes or clock.
  const existing = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(input.bucket)}/o/${encodeURIComponent(input.objectKey)}?fields=size,contentType,md5Hash,customTime,metadata`, {
    headers: { Authorization: `Bearer ${input.token}` }, cache: "no-store", signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!existing?.ok) return false;
  const metadata = await existing.json().catch(() => null) as {
    size?: string; contentType?: string; md5Hash?: string; customTime?: string; metadata?: Record<string, string>;
  } | null;
  return metadata?.size === String(input.bytes.byteLength) && metadata.contentType === input.contentType
    && metadata.md5Hash === md5 && Date.parse(metadata.customTime ?? "") === Date.parse(clock.customTime)
    && metadata.metadata?.["agentos-retention-clock"] === clock.policy
    && Date.parse(metadata.metadata?.["agentos-retention-expires-at"] ?? "") === Date.parse(clock.retentionExpiresAt);
}
