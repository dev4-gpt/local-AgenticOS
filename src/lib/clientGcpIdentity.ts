import { spawnSync } from "node:child_process";

const METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

export async function clientRuntimeAccessToken() {
  const response = await fetch(METADATA_TOKEN_URL, {
    headers: { "Metadata-Flavor": "Google" },
    cache: "no-store",
    signal: AbortSignal.timeout(2_000),
  }).catch(() => null);
  const data = response?.ok
    ? await response.json().catch(() => null) as { access_token?: unknown } | null
    : null;
  if (typeof data?.access_token === "string" && data.access_token.trim()) return data.access_token;

  // Only an explicitly opted-in development client may use the operator's CLI identity.
  if (
    process.env.VELOCE_CLIENT_EDITION !== "1"
    || process.env.NODE_ENV !== "development"
    || process.env.CLIENT_RUNTIME_LOCAL_GCLOUD_AUTH !== "1"
  ) return null;
  const result = spawnSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 10_000,
  });
  if (result.error || result.status !== 0) return null;
  const token = result.stdout.trim();
  return token && /^[A-Za-z0-9._-]{20,}$/.test(token) ? token : null;
}
