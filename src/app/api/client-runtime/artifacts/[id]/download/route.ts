import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { consumeClientRuntimeRateLimit, selectClientRecords } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METADATA_ROOT = "http://metadata.google.internal/computeMetadata/v1";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentClientUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!clientCapabilityEnabled("artifacts")) return NextResponse.json({ ok: false, error: "capability_not_enabled" }, { status: 403 });
  if (!(await consumeClientRuntimeRateLimit("artifact-downloads", 40, 900))) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "invalid_artifact" }, { status: 400 });
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  const namespace = process.env.CLIENT_STORAGE_NAMESPACE?.trim();
  const bucket = process.env.CLIENT_STORAGE_BUCKET?.trim();
  if (!tenantSlug || !namespace || !bucket) return NextResponse.json({ ok: false, error: "storage_not_configured" }, { status: 503 });

  const result = await selectClientRecords("client_runtime_artifacts", {
    id: `eq.${id}`,
    tenant_slug: `eq.${tenantSlug}`,
    limit: "1",
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: "artifact_lookup_failed" }, { status: 502 });
  const artifact = result.records[0];
  const objectKey = typeof artifact?.object_key === "string" ? artifact.object_key : "";
  if (!artifact || artifact.status !== "ready" || !safeObjectKey(objectKey, namespace)) return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 });

  const serviceAccount = process.env.CLIENT_RUNTIME_SERVICE_ACCOUNT?.trim() || await metadataText("instance/service-accounts/default/email");
  const token = await metadataText("instance/service-accounts/default/token").then((value) => value ? JSON.parse(value).access_token : null).catch(() => null);
  if (!serviceAccount || !token) return NextResponse.json({ ok: false, error: "signing_identity_unavailable" }, { status: 503 });

  const url = await signedStorageUrl({ bucket, objectKey, serviceAccount, token });
  if (!url) return NextResponse.json({ ok: false, error: "signed_download_unavailable" }, { status: 503 });
  return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "private, no-store" } });
}

function safeObjectKey(value: string, namespace: string) {
  return value.startsWith(`${namespace}/`)
    && !value.startsWith("/")
    && !value.includes("\\")
    && !value.split("/").some((part) => part === ".." || part.length === 0);
}

async function metadataText(path: string) {
  const response = await fetch(`${METADATA_ROOT}/${path}`, { headers: { "Metadata-Flavor": "Google" }, cache: "no-store" }).catch(() => null);
  return response?.ok ? response.text() : null;
}

async function signedStorageUrl(input: { bucket: string; objectKey: string; serviceAccount: string; token: string }) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const scope = `${date}/auto/storage/goog4_request`;
  const encodedObject = input.objectKey.split("/").map(encodeURIComponent).join("/");
  const canonicalUri = `/${input.bucket}/${encodedObject}`;
  const params = new URLSearchParams({
    "X-Goog-Algorithm": "GOOG4-RSA-SHA256",
    "X-Goog-Credential": `${input.serviceAccount}/${scope}`,
    "X-Goog-Date": timestamp,
    "X-Goog-Expires": "900",
    "X-Goog-SignedHeaders": "host",
  });
  const canonicalQuery = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  const canonicalRequest = ["GET", canonicalUri, canonicalQuery, "host:storage.googleapis.com", "", "host", "UNSIGNED-PAYLOAD"].join("\n");
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
