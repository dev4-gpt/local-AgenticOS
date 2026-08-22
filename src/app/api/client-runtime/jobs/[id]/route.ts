import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, selectClientRecords } from "@/lib/clientDataPlane";
import { presentClientJobUsage } from "@/lib/clientJobUsage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentClientUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  const rateLimit = await checkClientRuntimeRateLimit("job-status", 120, 900);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });
  const id = (await context.params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "job_id_invalid" }, { status: 400 });
  const result = await selectClientRecords("client_runtime_jobs", { id: `eq.${id}`, tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`, limit: "1" });
  if (!result.ok) return NextResponse.json({ ok: false, error: "job_read_failed" }, { status: 502 });
  const job = result.records[0];
  if (!job) return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  const ledger = await selectClientRecords("client_runtime_budget_ledger", { job_id: `eq.${id}`, tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`, limit: "10" });
  const usage = presentClientJobUsage({ provider: job.provider, inputMetadata: job.input_metadata, outputMetadata: job.output_metadata, ledgerRecords: ledger.ok ? ledger.records : [] });
  return NextResponse.json({ ok: true, job: { ...job, usage } }, { headers: { "cache-control": "no-store" } });
}
