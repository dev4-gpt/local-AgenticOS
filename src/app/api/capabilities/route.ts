import { NextResponse } from "next/server";
import { CAPABILITIES } from "@/lib/capabilities";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, capabilities: CAPABILITIES });
}
