import { NextResponse } from "next/server";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { createHermesContentFactoryPlan, type HermesContentFactoryType } from "@/lib/hermesContentFactory";
import { isAllowedV96ResearchUrl } from "@/lib/v96Contracts";
import { localHermesFactoryCanPublish, readLocalHermesFactoryRun, runLocalHermesContentFactory, saveLocalHermesFactoryRun } from "@/lib/hermesContentFactoryLocal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: string, status: number) { return NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } }); }

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return fail("content_factory_input_invalid", 400);
  const run = await readLocalHermesFactoryRun(id);
  return run ? NextResponse.json({ ok: true, run }) : fail("content_factory_not_found", 404);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const brief = typeof body.brief === "string" ? body.brief : "";
  const sourceUrls = Array.isArray(body.sourceUrls) ? body.sourceUrls.filter((value): value is string => typeof value === "string").slice(0, 8) : [];
  if (containsClientSecretLike(brief)) return fail("content_factory_input_invalid", 400);
  if (sourceUrls.length < 1 || sourceUrls.some((url) => !isAllowedV96ResearchUrl(url))) return fail("content_factory_sources_invalid", 400);
  try {
    const plan = createHermesContentFactoryPlan({
      tenantSlug: typeof body.tenantSlug === "string" ? body.tenantSlug : "local",
      brief,
      contentType: typeof body.contentType === "string" ? body.contentType as HermesContentFactoryType : undefined,
      workflowId: typeof body.workflowId === "string" ? body.workflowId : undefined,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    });
    const existing = await readLocalHermesFactoryRun(plan.workflowId);
    if (existing) return NextResponse.json({ ok: true, run: existing, replayed: true });
    if (body.run === true) return NextResponse.json({ ok: true, run: await runLocalHermesContentFactory(plan, sourceUrls), replayed: false }, { status: 202 });
    const run = await saveLocalHermesFactoryRun({ plan, status: "queued", sourceUrls, citations: [], qualityReport: null, approval: null, outlinePath: null, draftPath: null, kanbanTaskId: null, errorCode: null, updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, run, replayed: false }, { status: 202 });
  } catch (error) { return fail(error instanceof Error ? error.message : "content_factory_input_invalid", 400); }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  const run = await readLocalHermesFactoryRun(id);
  if (!run) return fail("content_factory_not_found", 404);
  if (body.action === "approve" && run.status === "awaiting_approval") {
    const approval = { id: `approval-${run.plan.workflowId}`, workflowId: run.plan.workflowId, tenantSlug: run.plan.tenantSlug, approvedBy: typeof body.approvedBy === "string" ? body.approvedBy : "local-operator", approvedAt: new Date().toISOString() };
    const updated = { ...run, approval, status: "approved" as const, updatedAt: new Date().toISOString() };
    return NextResponse.json({ ok: true, run: await saveLocalHermesFactoryRun(updated) });
  }
  if (body.action === "publish") {
    if (!localHermesFactoryCanPublish(run)) return fail("approval_required", 409);
    return NextResponse.json({ ok: true, run: await saveLocalHermesFactoryRun({ ...run, status: "published", updatedAt: new Date().toISOString() }) });
  }
  return fail("content_factory_action_invalid", 400);
}
