import { NextResponse } from "next/server";
import { captureReferenceFlow, type FlowCaptureRequest } from "@/lib/flowCapture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as FlowCaptureRequest;
    const result = await captureReferenceFlow(body);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Flow Capture could not analyze this reference." }, { status: 400 });
  }
}
