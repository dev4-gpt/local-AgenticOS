import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Local, free models available to Ruflo right now - just what's actually
// pulled in Ollama. Paid providers (Anthropic/OpenAI/Google) are deliberately
// left out here; this app's Ruflo integration is currently free-models-only.
export async function GET() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) return NextResponse.json({ ollamaUp: false, models: [] });
    const data = await r.json();
    const models = (data.models ?? []).map((m: { name: string }) => m.name);
    return NextResponse.json({ ollamaUp: true, models }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ollamaUp: false, models: [] });
  }
}
