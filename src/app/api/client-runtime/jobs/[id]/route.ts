import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { consumeClientRuntimeRateLimit, selectClientRecords } from "@/lib/clientDataPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentClientUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!(await consumeClientRuntimeRateLimit("job-status", 120, 900))) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429 });
  const id = (await context.params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "job_id_invalid" }, { status: 400 });
  const result = await selectClientRecords("client_runtime_jobs", { id: `eq.${id}`, tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`, limit: "1" });
  if (!result.ok) return NextResponse.json({ ok: false, error: "job_read_failed" }, { status: 502 });
  const job = result.records[0];
  if (!job) return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, job }, { headers: { "cache-control": "no-store" } });
}
