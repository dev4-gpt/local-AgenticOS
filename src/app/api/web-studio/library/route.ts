import { NextResponse } from "next/server";
import { syncWebPromptLibrary } from "@/lib/webStudio";
import { promptLibraryMarkdown } from "@/lib/webPromptLibrary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ content: promptLibraryMarkdown() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) return NextResponse.json({ ok: false, error: "Prompt library is empty." }, { status: 400 });
  if (content.length > 100_000) return NextResponse.json({ ok: false, error: "Prompt library is too large." }, { status: 413 });
  const result = await syncWebPromptLibrary(content);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
