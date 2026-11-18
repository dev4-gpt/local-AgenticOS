import { createHash } from "node:crypto";

export const MAX_NOTEBOOK_REVIEW_BYTES = 200_000;

export function notebookArtifactReviewRequired(job: Record<string, unknown>) {
  const input = job.input_metadata as Record<string, unknown> | null;
  return job.capability === "workspace-execution" && input?.surface === "notebook";
}

export function artifactJobReleased(job: Record<string, unknown>, artifactId: string) {
  const output = job.output_metadata;
  return job.status === "succeeded" && job.error_code == null
    && !!output && typeof output === "object" && !Array.isArray(output)
    && (output as Record<string, unknown>).failureDisposition !== "blocked"
    && (!notebookArtifactReviewRequired(job) || notebookArtifactReleased(job, artifactId));
}

export function notebookArtifactReleased(job: Record<string, unknown>, artifactId: string) {
  const output = job.output_metadata as Record<string, unknown> | null;
  const audit = output?.citationAudit as Record<string, unknown> | null;
  return notebookArtifactReviewRequired(job) && job.status === "succeeded"
    && job.error_code == null && output?.artifactId === artifactId
    && output.failureDisposition !== "blocked" && audit?.ok === true;
}

export function artifactReviewApproved(artifact: Record<string, unknown>, userId: string) {
  return artifact.review_decision === "approved" && artifact.reviewed_by === userId
    && typeof artifact.reviewed_at === "string" && Number.isFinite(Date.parse(artifact.reviewed_at))
    && typeof artifact.review_sha256 === "string" && /^[a-f0-9]{64}$/.test(artifact.review_sha256);
}

export function artifactContentSha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

// Buffer only bounded Notebook text; no bytes escape until integrity is checked.
export async function readArtifactReviewBytes(body: ReadableStream<Uint8Array>, expectedBytes: number) {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > MAX_NOTEBOOK_REVIEW_BYTES) {
    await body.cancel().catch(() => undefined);
    return null;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > expectedBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(chunk.value);
    }
    return size === expectedBytes ? Buffer.concat(chunks) : null;
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }
}
