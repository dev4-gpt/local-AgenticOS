import { NextResponse } from "next/server";
import { allowPublicRequest, payloadTooLarge } from "@/lib/publicRequestGuard";

// Server-side lead capture. Inserts into the shared Supabase `signups` table
// using the service-role key, which stays on the server and bypasses RLS — the
// key is never exposed to the browser. Set both env vars to activate; until
// then the route reports `not_configured` and the form falls back gracefully.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: Request) {
  if (!(await allowPublicRequest(req, "lead"))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });
  }

  if (payloadTooLarge(req)) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  if (!name || !email) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  if (!/^\S+@\S+\.\S+$/.test(email) || name.length > 240 || email.length > 320) {
    return NextResponse.json({ ok: false, error: "invalid_fields" }, { status: 400 });
  }

  const row = {
    name,
    email,
    company: body.company ? String(body.company).trim() : null,
    message: body.message ? String(body.message).trim() : null,
    source: "edition-3565",
    meta: { userAgent: req.headers.get("user-agent") ?? null },
  };

  // A wrong/expired SUPABASE_URL (typo, DNS failure, project paused) throws at
  // the network layer rather than returning a bad HTTP status — catch that too
  // so a misconfiguration degrades to a clean JSON error, not a raw 500.
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });

    if (!res.ok) {
      console.error("lead store failed", { status: res.status });
      return NextResponse.json({ ok: false, error: "store_failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("lead store unreachable", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ ok: false, error: "store_unreachable" }, { status: 502 });
  }
}
