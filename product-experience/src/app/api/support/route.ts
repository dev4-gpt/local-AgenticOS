import { NextResponse } from "next/server";
import { allowPublicRequest, payloadTooLarge, readPublicJsonBody } from "@/lib/publicRequestGuard";
import { notifyLead } from "@/lib/leadNotification";
import { cleanPublicText, publicEmail, requestId, sendSupportAcknowledgement, supabaseServiceInsert } from "@/lib/publicLaunch";

export const runtime = "nodejs";

const secretLikePattern = /(sk-[A-Za-z0-9_-]{20,}|api[_ -]?key\s*[:=]|secret\s*[:=]|password\s*[:=]|token\s*[:=]|bearer\s+[A-Za-z0-9._-]{20,})/i;
const managedProviderKeys = new Set([
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY", "MOONSHOT_API_KEY",
  "GLM_API_KEY", "XAI_API_KEY", "SAKANA_API_KEY", "GROQ_API_KEY", "ELEVENLABS_API_KEY",
  "ELEVENLABS_MUSIC_API_KEY", "HEYGEN_API_KEY", "SUNO_API_KEY", "FIRECRAWL_API_KEY",
  "BRAVE_API_KEY", "HUNTER_API_KEY",
]);

export async function POST(request: Request) {
  if (!(await allowPublicRequest(request, "support-request"))) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  if (payloadTooLarge(request)) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  const parsed = await readPublicJsonBody(request);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error === "too_large" ? "payload_too_large" : "invalid_fields" }, { status: parsed.error === "too_large" ? 413 : 400 });
  const body = parsed.value as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false, error: "invalid_fields" }, { status: 400 });
  if (["email", "subject", "message", "requestId", "requestType", "providerKey"].some((field) => body[field] != null && typeof body[field] !== "string")) {
    return NextResponse.json({ ok: false, error: "invalid_fields" }, { status: 400 });
  }
  const exceeds = (field: string, max: number) => typeof body[field] === "string" && (body[field] as string).trim().length > max;
  if (exceeds("email", 320) || exceeds("subject", 240) || exceeds("message", 8_000) || exceeds("requestId", 180)) {
    return NextResponse.json({ ok: false, error: "field_too_large" }, { status: 413 });
  }
  if (body.requestType != null && body.requestType !== "general" && body.requestType !== "managed_provider_access") {
    return NextResponse.json({ ok: false, error: "invalid_request_type" }, { status: 400 });
  }
  const email = publicEmail(body.email);
  const requestType = body.requestType === "managed_provider_access" ? "managed_provider_access" : "general";
  const providerKey = typeof body.providerKey === "string" ? body.providerKey.trim().toUpperCase() : null;
  const requestedBudgetInput = body.requestedBudgetUsd === undefined || body.requestedBudgetUsd === null
    ? body.requestedBudgetMicros
    : Number(body.requestedBudgetUsd) * 1_000_000;
  const requestedBudget = requestedBudgetInput === undefined || requestedBudgetInput === null
    ? null
    : Number(requestedBudgetInput);
  if (requestType === "managed_provider_access" && (!providerKey || !managedProviderKeys.has(providerKey))) {
    return NextResponse.json({ ok: false, error: "provider_not_available_for_managed_request" }, { status: 400 });
  }
  if (requestedBudget !== null && (!Number.isSafeInteger(requestedBudget) || requestedBudget < 0 || requestedBudget > 100_000_000_000)) {
    return NextResponse.json({ ok: false, error: "invalid_requested_budget" }, { status: 400 });
  }
  const subject = cleanPublicText(body.subject, 240) || (requestType === "managed_provider_access" ? `Managed provider access: ${providerKey}` : "Veloce support request");
  const message = cleanPublicText(body.message, 8_000);
  const reference = cleanPublicText(body.requestId, 180);
  if (!email || !subject || !message) return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  if (secretLikePattern.test(`${subject}\n${message}\n${reference}`)) return NextResponse.json({ ok: false, error: "secret_like_content" }, { status: 400 });
  const id = requestId();
  const result = await supabaseServiceInsert("client_support_requests", {
    id,
    email,
    subject,
    message,
    request_type: requestType,
    provider_key: requestType === "managed_provider_access" ? providerKey : null,
    requested_budget_micros: requestedBudget,
    request_id: reference || null,
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: "store_failed" }, { status: 502 });
  const teamNotification = await notifyLead({
    kind: "support request",
    name: requestType === "managed_provider_access" ? `Managed provider access · ${providerKey}` : "Veloce support",
    email,
    source: `support:${requestType}`,
    details: [
      `Request ID: ${id}`,
      ...(requestType === "managed_provider_access" ? [`Provider: ${providerKey}`, `Requested budget micros: ${requestedBudget ?? "not specified"}`] : []),
      `Message: ${message}`,
    ],
  });
  const acknowledgement = await sendSupportAcknowledgement(email, id);
  return NextResponse.json({ ok: true, requestId: id, status: "open", requestType, providerKey, next: requestType === "managed_provider_access" ? "team_review" : "support_review", teamNotification, acknowledgement });
}
