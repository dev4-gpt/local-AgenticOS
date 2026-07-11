import { NextResponse } from "next/server";
import { listWebProjects, saveWebProject } from "@/lib/webStudio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ projects: await listWebProjects() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name : "";
  const business = typeof body.business === "string" ? body.business : "";
  const goal = typeof body.goal === "string" ? body.goal : "";
  const brief = typeof body.brief === "string" ? body.brief : "";
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!name.trim() || !business.trim() || !brief.trim() || !prompt.trim()) {
    return NextResponse.json({ ok: false, error: "Project name, business, brief, and build prompt are required." }, { status: 400 });
  }
  if (brief.length > 24_000 || prompt.length > 28_000) {
    return NextResponse.json({ ok: false, error: "Brief is too long." }, { status: 413 });
  }
  const project = await saveWebProject({ name, business, goal, brief, prompt });
  return NextResponse.json({ ok: true, project });
}
