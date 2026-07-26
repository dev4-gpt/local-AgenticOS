import { NextResponse } from "next/server";
import { currentClientUser } from "@/lib/clientAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentClientUser();
  return NextResponse.json({ ok: true, authenticated: Boolean(user), user: user ? { id: user.id, email: user.email ?? null } : null }, { headers: { "cache-control": "no-store" } });
}
