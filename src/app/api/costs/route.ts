import { NextResponse } from "next/server";
import { readCostLedger, saveCostLedger } from "@/lib/costLedger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readCostLedger());
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { entries?: unknown };
    return NextResponse.json(await saveCostLedger(body.entries));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save costs." }, { status: 400 });
  }
}
