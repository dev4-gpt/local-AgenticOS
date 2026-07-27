import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

const METADATA_ROOT = "http://metadata.google.internal/computeMetadata/v1";

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
  const response = await fetch(`${METADATA_ROOT}/instance/service-accounts/default/token`, {
    headers: { "Metadata-Flavor": "Google" },
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  const data = await response.json().catch(() => null) as { access_token?: unknown } | null;
  return typeof data?.access_token === "string" ? data.access_token : null;
}

export async function clientServiceAccountEmail(serviceAccount?: string | null) {
  return serviceAccount || await metadataText("instance/service-accounts/default/email");
}

export async function signedClientStorageUrl(input: {
  method: "GET" | "PUT";
  bucket: string;
  objectKey: string;
  serviceAccount: string;
  token: string;
  contentType?: string;
}) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const scope = `${date}/auto/storage/goog4_request`;
  const encodedObject = input.objectKey.split("/").map(encodeURIComponent).join("/");
  const canonicalUri = `/${input.bucket}/${encodedObject}`;
  const signedHeaders = input.contentType ? "content-type;host" : "host";
  const headers = input.contentType ? `content-type:${input.contentType}\nhost:storage.googleapis.com` : "host:storage.googleapis.com";
  const params = new URLSearchParams({
    "X-Goog-Algorithm": "GOOG4-RSA-SHA256",
    "X-Goog-Credential": `${input.serviceAccount}/${scope}`,
    "X-Goog-Date": timestamp,
    "X-Goog-Expires": "900",
    "X-Goog-SignedHeaders": signedHeaders,
  });
  const canonicalQuery = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  const canonicalRequest = [input.method, canonicalUri, canonicalQuery, `${headers}\n`, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["GOOG4-RSA-SHA256", timestamp, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
  const signResponse = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(input.serviceAccount)}:signBlob`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ payload: Buffer.from(stringToSign).toString("base64") }),
    cache: "no-store",
  }).catch(() => null);
  if (!signResponse?.ok) return null;
  const signed = await signResponse.json().catch(() => null) as { signedBlob?: string } | null;
  if (!signed?.signedBlob) return null;
  params.set("X-Goog-Signature", Buffer.from(signed.signedBlob, "base64").toString("hex"));
  return `https://storage.googleapis.com${canonicalUri}?${params.toString()}`;
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

async function metadataText(path: string) {
  const response = await fetch(`${METADATA_ROOT}/${path}`, { headers: { "Metadata-Flavor": "Google" }, cache: "no-store" }).catch(() => null);
  return response?.ok ? response.text() : null;
}
