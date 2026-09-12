import { runEccAdapter, eccHash } from "@/lib/eccAdapter";
import { parseEccLesson } from "@/lib/eccLearning";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { workerRpc } from "@/lib/clientDataPlane";

export async function executeEccJob(tenantSlug: string, jobId: string, workerToken: string, input: Record<string, unknown>) {
  const enabled = clientCapabilityEnabled("ecc-workflows") && clientCapabilityEnabled("artifacts");
  if (!enabled) return { ok: false as const, error: "ecc_capability_not_enabled" };
  const admission = await workerRpc("admit_client_ecc_job", { p_tenant_slug: tenantSlug, p_job_id: jobId, p_worker_token: workerToken });
  if (!admission.ok || typeof admission.value !== "string") return { ok: false as const, error: "ecc_job_not_authorized" };
  const snapshots = input.reviewedLessons;
  if (!Array.isArray(snapshots) || snapshots.length > 10 || Buffer.byteLength(JSON.stringify(snapshots), "utf8") > 16000) return { ok: false as const, error: "ecc_lesson_snapshot_invalid" };
  const lessons = snapshots.map(item => ({ id: item?.id, contentHash: item?.contentHash, content: parseEccLesson(item?.content) }));
  if (lessons.some(item => !item.content)) return { ok: false as const, error: "ecc_lesson_snapshot_invalid" };
  const authorization = await workerRpc("client_ecc_job_lessons_allowed", { p_tenant_slug: tenantSlug, p_job_id: jobId, p_worker_token: workerToken, p_requested: snapshots });
  if (!authorization.ok || authorization.value !== true) return { ok: false as const, error: "ecc_lesson_not_active" };
  const result = runEccAdapter(input.eccInput, { tenantSlug, enabled, role: admission.value });
  if (!result.ok) return result;
  const lessonBytes = Buffer.byteLength(JSON.stringify(lessons), "utf8");
  const utf8Bytes = result.artifact.context.utf8Bytes + (lessons.length ? lessonBytes : 0);
  const overBudget = utf8Bytes > result.artifact.context.budgetBytes;
  const artifact = { ...result.artifact,
    context: { ...result.artifact.context, utf8Bytes, overBudget },
    reviewedLessons: lessons.map(item => ({ id: item.id, contentHash: item.contentHash, summary: item.content!.summary })),
    checklist: [...result.artifact.checklist, ...lessons.map(item => ({ id: `lesson-${item.id}`, action: item.content!.action, status: "awaiting-review" as const, evidenceReferences: item.content!.evidenceReferences }))],
    findings: [...result.artifact.findings, ...(overBudget && !result.artifact.context.overBudget ? [{ code: "context_budget_exceeded", detail: "Reviewed lessons exceed the selected context budget." }] : [])],
  };
  const artifactHash = eccHash(JSON.stringify(artifact));
  const evaluation = { ...result.evaluation, artifactHash, reviewedLessonCount: lessons.length, checks: result.evaluation.checks.map(check => check.id === "context-budget" ? { ...check, status: overBudget ? "failed" : "passed" } : check) };
  return { ok: true as const, artifact, artifactHash, evaluation };
}
