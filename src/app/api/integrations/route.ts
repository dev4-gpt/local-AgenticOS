import { NextResponse } from "next/server";
import { integrationOverview, saveIntegration } from "@/lib/integrationHub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await integrationOverview(), { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const values = body.values && typeof body.values === "object" ? body.values as Record<string, unknown> : {};
  const result = await saveIntegration(id, values);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
