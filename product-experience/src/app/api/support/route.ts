import { NextResponse } from "next/server";
import { allowPublicRequest, payloadTooLarge } from "@/lib/publicRequestGuard";
import { cleanPublicText, publicEmail, requestId, sendSupportAcknowledgement, supabaseServiceInsert } from "@/lib/publicLaunch";

export const runtime = "nodejs";

const secretLikePattern = /(sk-[A-Za-z0-9_-]{20,}|api[_ -]?key\s*[:=]|secret\s*[:=]|password\s*[:=]|token\s*[:=]|bearer\s+[A-Za-z0-9._-]{20,})/i;

export async function POST(request: Request) {
  if (!(await allowPublicRequest(request, "support-request"))) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  if (payloadTooLarge(request)) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const email = publicEmail(body.email);
  const subject = cleanPublicText(body.subject, 240);
  const message = cleanPublicText(body.message, 8_000);
  if (!email || !subject || !message) return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  if (secretLikePattern.test(`${subject}\n${message}`)) return NextResponse.json({ ok: false, error: "secret_like_content" }, { status: 400 });
  const id = requestId();
  const result = await supabaseServiceInsert("client_support_requests", { email, subject, message, request_id: cleanPublicText(body.requestId, 180) || id });
  if (!result.ok) return NextResponse.json({ ok: false, error: "store_failed" }, { status: 502 });
  const acknowledgement = await sendSupportAcknowledgement(email, id);
  return NextResponse.json({ ok: true, requestId: id, status: "open", acknowledgement });
}
