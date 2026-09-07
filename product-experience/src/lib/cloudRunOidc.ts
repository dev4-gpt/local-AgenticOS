/**
 * Obtains a short-lived Google ID token for a Cloud Run service from a Vercel
 * Function. No Google service-account key is stored in Vercel: the incoming
 * Vercel OIDC assertion is exchanged through a tightly scoped Workload
 * Identity Federation provider instead.
 */

type Result = { ok: true; token: string } | { ok: false; error: string };

const GOOGLE_CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function config() {
  const projectNumber = process.env.GCP_PROJECT_NUMBER?.trim() || "";
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID?.trim() || "";
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID?.trim() || "";
  const serviceAccount = process.env.GCP_CONTROL_PLANE_INVOKER_SERVICE_ACCOUNT?.trim() || "";
  if (!/^\d{6,20}$/.test(projectNumber)) return null;
  if (!/^[a-z][a-z0-9-]{3,62}$/.test(poolId)) return null;
  if (!/^[a-z][a-z0-9-]{3,62}$/.test(providerId)) return null;
  if (!/^[a-z][a-z0-9-]{4,29}@[a-z][a-z0-9-]{4,62}\.iam\.gserviceaccount\.com$/.test(serviceAccount)) return null;
  return { projectNumber, poolId, providerId, serviceAccount };
}

export function controlPlaneOidcConfigured() {
  return Boolean(config());
}

export async function cloudRunIdTokenFromVercel(request: Request, target: string): Promise<Result> {
  const settings = config();
  // In a live Function, Vercel provides the invocation token on the Request.
  // Prefer it over the build-time environment token, which can otherwise be
  // inlined into a bundle and become stale. The environment value is only a
  // local/prebuilt fallback.
  const subjectToken = request.headers.get("x-vercel-oidc-token")?.trim()
    || process.env.VERCEL_OIDC_TOKEN?.trim()
    || "";
  let audience: string;
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".run.app")) return { ok: false, error: "control_plane_target_invalid" };
    audience = parsed.origin;
  } catch {
    return { ok: false, error: "control_plane_target_invalid" };
  }
  if (!settings) return { ok: false, error: "gcp_workload_identity_not_configured" };
  if (!subjectToken) return { ok: false, error: "vercel_oidc_token_missing" };

  const federationAudience = `//iam.googleapis.com/projects/${settings.projectNumber}/locations/global/workloadIdentityPools/${settings.poolId}/providers/${settings.providerId}`;
  const exchanged = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      audience: federationAudience,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      subject_token: subjectToken,
      scope: GOOGLE_CLOUD_SCOPE,
    }),
    cache: "no-store",
  }).catch(() => null);
  const exchangeBody = await exchanged?.json().catch(() => null) as { access_token?: unknown } | null;
  if (!exchanged?.ok || typeof exchangeBody?.access_token !== "string") return { ok: false, error: "gcp_token_exchange_failed" };

  const accountPath = encodeURIComponent(settings.serviceAccount);
  // The federated principal has the narrowly scoped Workload Identity User
  // permission on this service account. Mint the Cloud Run ID token directly
  // with that credential rather than creating a second service-account access
  // token, which would require an unnecessary self-impersonation grant.
  const minted = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${accountPath}:generateIdToken`, {
    method: "POST",
    headers: { authorization: `Bearer ${exchangeBody.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ audience, includeEmail: true }),
    cache: "no-store",
  }).catch(() => null);
  const mintedBody = await minted?.json().catch(() => null) as { token?: unknown } | null;
  return minted?.ok && typeof mintedBody?.token === "string"
    ? { ok: true, token: mintedBody.token }
    : { ok: false, error: "gcp_cloud_run_token_mint_failed" };
}
