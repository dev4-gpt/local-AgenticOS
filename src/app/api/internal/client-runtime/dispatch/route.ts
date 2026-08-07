import { NextResponse } from "next/server";
import { executeClientWorkspaceJob } from "@/lib/clientCloudRunJobs";
import { validClientTaskIdentity } from "@/lib/clientTaskAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.CLIENT_RUNTIME_WORKER_ENABLED !== "1") return NextResponse.json({ ok: false, error: "worker_disabled" }, { status: 404 });
  if (!(await validClientTaskIdentity(request))) return NextResponse.json({ ok: false, error: "worker_unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const tenantSlug = typeof body.tenantSlug === "string" ? body.tenantSlug : "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || tenantSlug !== process.env.CLIENT_SLUG?.trim()) return NextResponse.json({ ok: false, error: "worker_payload_invalid" }, { status: 400 });
  const dispatched = await executeClientWorkspaceJob({ jobId, tenantSlug });
  return NextResponse.json({ ok: dispatched.ok, ...(dispatched.ok ? { status: "started" } : { error: dispatched.error }) }, { status: dispatched.ok ? 202 : dispatched.status });
}
