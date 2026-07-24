import { NextResponse } from "next/server";
import { readResults } from "@/lib/rufloExec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const swarmId = new URL(req.url).searchParams.get("swarmId");
  if (!swarmId) return NextResponse.json({ error: "missing swarmId" }, { status: 400 });
  const results = await readResults(swarmId);
  return NextResponse.json(results ?? { swarmId, tasks: [] }, { headers: { "cache-control": "no-store" } });
}
