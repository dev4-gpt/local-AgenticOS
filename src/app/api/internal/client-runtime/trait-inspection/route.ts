import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { selectClientRecords } from "@/lib/clientDataPlane";
import { validateTraitBundle } from "@/lib/capabilityTraits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Local operator inspection only. The client edition deliberately has no route
 * for resolving or choosing traits; it receives the policy outcome through the
 * normal job lifecycle.
 */
export async function GET(request: Request) {
  if (process.env.VELOCE_CLIENT_EDITION === "1") return NextResponse.json({ ok: false, error: "operator_route_unavailable" }, { status: 404 });
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  const jobId = new URL(request.url).searchParams.get("jobId")?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return NextResponse.json({ ok: false, error: "job_id_invalid" }, { status: 400 });
  const result = await selectClientRecords("client_runtime_jobs", {
    id: `eq.${jobId}`,
    tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`,
    limit: "1",
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: "trait_inspection_read_failed" }, { status: 502 });
  const job = result.records[0];
  if (!job) return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  const input = asRecord(job.input_metadata);
  const output = asRecord(job.output_metadata);
  const traitSnapshot = input.__veloceTraits;
  if (!traitSnapshot || typeof traitSnapshot !== "object" || Array.isArray(traitSnapshot)) return NextResponse.json({ ok: false, error: "trait_snapshot_missing" }, { status: 409 });
  const validation = validateTraitBundle(traitSnapshot as Parameters<typeof validateTraitBundle>[0]);
  if (validation.length) return NextResponse.json({ ok: false, error: "trait_snapshot_invalid", details: validation }, { status: 409 });
  return NextResponse.json({
    ok: true,
    jobId,
    capability: job.capability,
    status: job.status,
    traits: traitSnapshot,
    evidence: output.traitEvidence ?? [],
    errorCode: job.error_code ?? null,
  }, { headers: { "cache-control": "no-store" } });
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
