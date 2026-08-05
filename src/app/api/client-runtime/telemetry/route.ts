import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit } from "@/lib/clientDataPlane";
import { captureClientProductEvent } from "@/lib/clientRuntimeObservability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT = /^client_runtime_[a-z0-9_]{1,72}$/;
const SAFE_KEYS = new Set(["provider", "route", "capability", "status", "result", "source", "messageCount"]);

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return error("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("telemetry-write", 120, 900);
  if (!limit.ok) return error("runtime_limit_unavailable", 503);
  if (!limit.allowed) return error("runtime_rate_limited", 429);

  const body = await request.json().catch(() => ({}));
  const event = typeof body.event === "string" ? body.event.trim() : "";
  if (!EVENT.test(event)) return error("event_invalid", 400);
  const properties = body.properties && typeof body.properties === "object" && !Array.isArray(body.properties)
    ? body.properties as Record<string, unknown>
    : {};
  const safeProperties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!SAFE_KEYS.has(key)) continue;
    if (typeof value === "string" && /^[a-z0-9_.:-]{1,96}$/i.test(value.trim())) safeProperties[key] = value.trim();
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 999) safeProperties[key] = value;
  }
  const tenant = process.env.CLIENT_SLUG?.trim() || "client";
  const distinctId = createHash("sha256").update(`${tenant}:${user.id}`).digest("hex");
  await captureClientProductEvent({ event, distinctId, properties: { ...safeProperties, tenant } });
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

function error(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "no-store" } });
}
