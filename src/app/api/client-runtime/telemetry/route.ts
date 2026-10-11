import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, recordClientAudit } from "@/lib/clientDataPlane";
import { readBoundedResponseBytes } from "@/lib/clientNetworkSafety";
import { captureClientProductEvent, CLIENT_PRODUCT_EVENTS } from "@/lib/clientRuntimeObservability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS = new Set([
  "anthropic", "openai", "codex", "openrouter", "openclaw", "hermes", "freeclaude", "fusion",
  "gemini", "antigravity", "moonshot", "kimi", "glm", "glm-code", "xai", "grok", "sakana",
]);
const MAX_TELEMETRY_BODY_BYTES = 16 * 1024;

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return error("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("telemetry-write", 120, 900);
  if (!limit.ok) return error("runtime_limit_unavailable", 503);
  if (!limit.allowed) return error("runtime_rate_limited", 429);

  let bodyBytes: Buffer | null;
  try {
    bodyBytes = await readBoundedResponseBytes(new Response(request.body, { headers: request.headers }), MAX_TELEMETRY_BODY_BYTES);
  } catch {
    return error("request_invalid", 400);
  }
  if (!bodyBytes) return error("request_body_too_large", 413);
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(bodyBytes.toString("utf8"));
  } catch {
    return error("request_invalid", 400);
  }
  const body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
    ? parsedBody as Record<string, unknown>
    : {};
  const event = typeof body.event === "string" ? body.event.trim() : "";
  if (!CLIENT_PRODUCT_EVENTS.has(event)) return error("event_invalid", 400);
  const properties = body.properties && typeof body.properties === "object" && !Array.isArray(body.properties)
    ? body.properties as Record<string, unknown>
    : {};
  const safeProperties: Record<string, unknown> = {};
  if (typeof properties.provider === "string" && PROVIDERS.has(properties.provider)) safeProperties.provider = properties.provider;
  if (typeof properties.messageCount === "number" && Number.isSafeInteger(properties.messageCount)
    && properties.messageCount >= 0 && properties.messageCount <= 999) safeProperties.messageCount = properties.messageCount;
  if (event === "client_runtime_provider_workspace_opened") safeProperties.result = "ready";
  if (event.endsWith("_failed")) safeProperties.result = "failed";
  const tenant = process.env.CLIENT_SLUG?.trim() || "client";
  const distinctId = createHash("sha256").update(`${tenant}:${user.id}`).digest("hex");
  const tenantId = createHash("sha256").update(tenant).digest("hex").slice(0, 24);
  await captureClientProductEvent({ event, distinctId, properties: { ...safeProperties, tenant: `tenant:${tenantId}` } });
  await recordClientAudit(event, { ...safeProperties, source: "client-telemetry" });
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

function error(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "no-store" } });
}
