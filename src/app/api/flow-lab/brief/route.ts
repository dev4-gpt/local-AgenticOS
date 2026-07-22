import { NextResponse } from "next/server";
import { createFlowBrief, saveFlowBrief, type FlowLabRequest } from "@/lib/flowLab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json() as FlowLabRequest & { save?: boolean };
    const brief = createFlowBrief(body);
    const savedPath = body.save ? await saveFlowBrief(brief) : null;
    return NextResponse.json({ ok: true, brief, savedPath });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not create the Flow Lab brief." }, { status: 400 });
  }
}
