import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, selectClientRecords } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { clientRetentionSecondsRemaining } from "@/lib/clientRetention";
import { clientGcpAccessToken, clientStorageConfig, proxyClientStorageObject, safeClientObjectKey } from "@/lib/clientStorage";
import { artifactContentSha256, MAX_NOTEBOOK_REVIEW_BYTES, notebookArtifactReleased, notebookArtifactReviewRequired, readArtifactReviewBytes } from "@/lib/clientArtifactReview";
import { readBoundedJsonObject } from "@/lib/clientNetworkSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const error = (code: string, status: number) => NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "private, no-store" } });
type Context = { params: Promise<{ id: string }> };

async function loadReview(context: Context) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return { response: error("not_authenticated", 401) };
  if (!clientCapabilityEnabled("artifacts")) return { response: error("capability_not_enabled", 403) };
  const rate = await checkClientRuntimeRateLimit("artifact-reviews", 40, 900);
  if (!rate.ok) return { response: error("runtime_limit_unavailable", 503) };
  if (!rate.allowed) return { response: error("runtime_rate_limited", 429) };
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { response: error("invalid_artifact", 400) };
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  const config = clientStorageConfig();
  if (!tenantSlug || !config) return { response: error("storage_not_configured", 503) };
  const result = await selectClientRecords("client_runtime_artifacts", { id: `eq.${id}`, tenant_slug: `eq.${tenantSlug}`, limit: "1" });
  if (!result.ok) return { response: error("artifact_lookup_failed", 502) };
  const artifact = result.records[0];
  if (!artifact || artifact.id !== id || artifact.tenant_slug !== tenantSlug || artifact.status !== "ready"
    || !clientRetentionSecondsRemaining(artifact) || typeof artifact.job_id !== "string"
    || typeof artifact.object_key !== "string" || !safeClientObjectKey(artifact.object_key, config.namespace)) return { response: error("artifact_not_found", 404) };
  const jobs = await selectClientRecords("client_runtime_jobs", { id: `eq.${artifact.job_id}`, tenant_slug: `eq.${tenantSlug}`, requested_by: `eq.${user.id}`, limit: "1" });
  const job = jobs.records[0];
  if (!jobs.ok || !job || job.id !== artifact.job_id || job.tenant_slug !== tenantSlug || job.requested_by !== user.id) return { response: error("artifact_not_found", 404) };
  if (!notebookArtifactReviewRequired(job)) return { response: error("artifact_review_not_supported", 409) };
  if (!notebookArtifactReleased(job, id)) return { response: error("artifact_job_not_released", 409) };
  const size = artifact.byte_size;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 1 || size > MAX_NOTEBOOK_REVIEW_BYTES
    || typeof artifact.content_type !== "string" || !/^text\/(?:markdown|plain)(?:;|$)/i.test(artifact.content_type)) return { response: error("artifact_review_not_supported", 409) };
  const token = await clientGcpAccessToken();
  if (!token) return { response: error("storage_identity_unavailable", 503) };
  const object = await proxyClientStorageObject({ bucket: config.bucket, objectKey: artifact.object_key, token, maxBytes: MAX_NOTEBOOK_REVIEW_BYTES, expectedBytes: size });
  const bytes = object?.body ? await readArtifactReviewBytes(object.body, size) : null;
  if (!bytes) return { response: error("artifact_review_unavailable", 502) };
  if (!clientRetentionSecondsRemaining(artifact)) return { response: error("artifact_not_found", 404) };
  const latestJobs = await selectClientRecords("client_runtime_jobs", { id: `eq.${artifact.job_id}`, tenant_slug: `eq.${tenantSlug}`, requested_by: `eq.${user.id}`, limit: "1" });
  const latestJob = latestJobs.records[0];
  if (!latestJobs.ok || !latestJob || latestJob.id !== artifact.job_id || latestJob.tenant_slug !== tenantSlug
    || latestJob.requested_by !== user.id || !notebookArtifactReleased(latestJob, id)) return { response: error("artifact_job_not_released", 409) };
  return { artifact, bytes, sha256: artifactContentSha256(bytes), tenantSlug, user };
}

export async function GET(_request: Request, context: Context) {
  const review = await loadReview(context);
  if (review.response) return review.response;
  let content: string;
  try { content = new TextDecoder("utf-8", { fatal: true }).decode(review.bytes); }
  catch { return error("artifact_review_not_supported", 409); }
  return NextResponse.json({ ok: true, content, sha256: review.sha256, decision: review.artifact.review_sha256 === review.sha256 ? review.artifact.review_decision ?? null : null }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request, context: Context) {
  const parsed = await readBoundedJsonObject(request, 1024);
  if (!parsed.ok) return error("artifact_review_input_invalid", parsed.reason === "too_large" ? 413 : 400);
  const body = parsed.value;
  if ((body.decision !== "approved" && body.decision !== "rejected") || typeof body.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(body.sha256)) return error("artifact_review_input_invalid", 400);
  const review = await loadReview(context);
  if (review.response) return review.response;
  if (review.sha256 !== body.sha256) return error("artifact_review_content_changed", 409);
  const saved = await clientRpc("review_client_notebook_artifact", {
    p_tenant_slug: review.tenantSlug, p_artifact_id: review.artifact.id,
    p_object_key: review.artifact.object_key, p_byte_size: review.artifact.byte_size,
    p_content_type: review.artifact.content_type, p_sha256: review.sha256, p_decision: body.decision,
  });
  if (!saved.ok || saved.value !== true) return error("artifact_review_not_saved", 409);
  return NextResponse.json({ ok: true, decision: body.decision, sha256: review.sha256 }, { headers: { "cache-control": "private, no-store" } });
}
