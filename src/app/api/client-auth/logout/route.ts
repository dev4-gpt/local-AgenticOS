import { NextResponse } from "next/server";
import { authCookieNames } from "@/lib/clientAuth";

export const runtime = "nodejs";

export async function POST() {
  const result = NextResponse.json({ ok: true });
  const names = authCookieNames();
  result.cookies.set(names.access, "", { httpOnly: true, expires: new Date(0), path: "/" });
  result.cookies.set(names.refresh, "", { httpOnly: true, expires: new Date(0), path: "/" });
  return result;
}
