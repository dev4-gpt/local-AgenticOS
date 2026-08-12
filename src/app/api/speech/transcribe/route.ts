import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { clientAuthEnforced, clientCapabilityEnabled, clientProviderCallsEnabled, clientProviderEnabled } from "@/lib/clientRuntimePolicy";
import { GROQ_STT_MAX_BYTES, groqSpeechConfigured, transcribeWithGroq } from "@/lib/groqSpeech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "audio/webm", "audio/webm;codecs=opus", "audio/ogg", "audio/ogg;codecs=opus",
  "audio/mp4", "audio/m4a", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/flac",
]);

export async function POST(request: Request) {
  if (clientAuthEnforced()) {
    const user = await currentClientUser();
    if (!user || !(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    if (!(clientCapabilityEnabled("voice") || clientCapabilityEnabled("media") || clientCapabilityEnabled("text-agents"))) return NextResponse.json({ ok: false, error: "capability_not_enabled" }, { status: 403 });
    if (!clientProviderCallsEnabled() || !clientProviderEnabled("GROQ_API_KEY")) return NextResponse.json({ ok: false, error: "speech_provider_not_approved" }, { status: 403 });
  }
  if (!groqSpeechConfigured()) return NextResponse.json({ ok: false, error: "speech_provider_not_configured" }, { status: 503 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ ok: false, error: "expected_multipart_audio" }, { status: 400 }); }
  const file = form.get("audio");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "missing_audio" }, { status: 400 });
  if (file.size < 1) return NextResponse.json({ ok: false, error: "empty_audio" }, { status: 400 });
  if (file.size > GROQ_STT_MAX_BYTES) return NextResponse.json({ ok: false, error: "audio_too_large" }, { status: 413 });
  const contentType = (file.type || "audio/webm").toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) return NextResponse.json({ ok: false, error: "audio_type_not_supported" }, { status: 415 });

  try {
    const result = await transcribeWithGroq({
      audio: Buffer.from(await file.arrayBuffer()),
      filename: file.name || "recording.webm",
      contentType,
      language: typeof form.get("language") === "string" ? String(form.get("language")) : undefined,
      prompt: typeof form.get("prompt") === "string" ? String(form.get("prompt")) : undefined,
    });
    return NextResponse.json({ ok: true, provider: "groq", model: result.model, text: result.text, requestId: result.requestId }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "speech_transcription_failed";
    const status = message === "groq_not_configured" ? 503 : message.includes("size_invalid") ? 413 : 502;
    return NextResponse.json({ ok: false, error: message.split(":")[0] }, { status });
  }
}
