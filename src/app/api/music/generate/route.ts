import { NextResponse } from "next/server";
import { generateMusic, type SunoModel } from "@/lib/suno";
import { storeGeneratedAudio } from "@/lib/musicStudio";
import { readHermesEnv } from "@/lib/hermesPhone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODELS = new Set<SunoModel>(["V5", "V4_5PLUS", "V4_5", "V4", "V3_5"]);

// POST /api/music/generate
//   { description, title?, instrumental?, model? }  →  { ok, taskId }
// Kicks off a Suno generation. The UI then polls /api/music/status?taskId=.
export async function POST(req: Request) {
  let payload: { description?: string; title?: string; instrumental?: boolean; model?: string; provider?: string };
  try { payload = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const description = (payload.description ?? "").trim();
  if (!description) return NextResponse.json({ error: "Describe the style you want first." }, { status: 400 });
  if (description.length > 3000) return NextResponse.json({ error: "Description too long (3000 char max)." }, { status: 413 });

  const model = (typeof payload.model === "string" && MODELS.has(payload.model as SunoModel))
    ? (payload.model as SunoModel) : "V4_5";

  if (payload.provider === "elevenlabs") {
    const key = readHermesEnv().ELEVENLABS_MUSIC_API_KEY?.trim() || process.env.ELEVENLABS_MUSIC_API_KEY?.trim();
    if (!key) return NextResponse.json({ error: "Eleven Music isn't connected. Add ELEVENLABS_MUSIC_API_KEY to your Hermes profile." }, { status: 400 });
    try {
      const r = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ prompt: description.slice(0, 4100), music_length_ms: 30_000 }),
      });
      if (!r.ok) return NextResponse.json({ error: `Eleven Music → HTTP ${r.status}: ${(await r.text()).slice(0, 180)}` }, { status: 502 });
      const track = await storeGeneratedAudio(Buffer.from(await r.arrayBuffer()), {
        taskId: `eleven-${Date.now()}`, prompt: description,
        title: typeof payload.title === "string" ? payload.title : undefined,
        model: "Eleven Music", instrumental: payload.instrumental !== false,
      });
      return NextResponse.json({ ok: true, provider: "elevenlabs", status: "done", tracks: [track] });
    } catch (e) {
      return NextResponse.json({ error: `Eleven Music failed: ${String(e instanceof Error ? e.message : e)}` }, { status: 502 });
    }
  }

  try {
    const { taskId } = await generateMusic({
      description,
      title: typeof payload.title === "string" ? payload.title : undefined,
      instrumental: payload.instrumental !== false,
      model,
    });
    return NextResponse.json({ ok: true, taskId, model });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    const notConfigured = /not configured/.test(msg);
    return NextResponse.json(
      { error: notConfigured ? "Suno isn't connected. Add your key to ~/.agentic-os/suno.env" : msg },
      { status: notConfigured ? 400 : 502 },
    );
  }
}
