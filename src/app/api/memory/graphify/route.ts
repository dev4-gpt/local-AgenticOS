import { NextResponse } from "next/server";
import { graphifyReport, graphifyStatus, queryGraphify, stageGraphifyCorpus, startGraphifyBuild } from "@/lib/graphify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("file") === "report") {
    try { return new Response(await graphifyReport(), { headers: { "content-type": "text/markdown; charset=utf-8" } }); }
    catch { return NextResponse.json({ error: "Graphify report is not available yet." }, { status: 404 }); }
  }
  return NextResponse.json(await graphifyStatus(), { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "stage") {
      await stageGraphifyCorpus();
      return NextResponse.json({ ok: true, status: await graphifyStatus() });
    }
    if (body.action === "build") {
      const build = startGraphifyBuild();
      return NextResponse.json({ ok: true, accepted: true, build, status: await graphifyStatus() }, { status: 202 });
    }
    if (body.action === "query" && typeof body.question === "string" && body.question.trim()) {
      return NextResponse.json({ ok: true, answer: await queryGraphify(body.question.trim().slice(0, 500)) });
    }
    return NextResponse.json({ ok: false, error: "Use action stage, build, or query with a question." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
