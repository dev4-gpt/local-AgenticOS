import { NextResponse } from "next/server";
import { answerFromClassroom, beginClassroomLogin, collectClassroom, readRun, saveClassroomLogin } from "@/lib/classroomResearch";
import { isLocalOnlyRequest } from "@/lib/localOnlyRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isLocalOnlyRequest(request)) return NextResponse.json({ error: "local only" }, { status: 403 });
  try {
    const id = new URL(request.url).searchParams.get("run");
    if (!id) return NextResponse.json({ error: "run is required" }, { status: 400 });
    return NextResponse.json({ run: await readRun(id) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read research run." }, { status: 400 }); }
}

export async function POST(request: Request) {
  if (!isLocalOnlyRequest(request)) return NextResponse.json({ error: "local only" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;
    if (action === "begin-login") return NextResponse.json(await beginClassroomLogin(String(body.startUrl ?? "")));
    if (action === "save-login") return NextResponse.json(await saveClassroomLogin(String(body.loginId ?? "")));
    if (action === "collect") return NextResponse.json({ run: await collectClassroom({ startUrl: String(body.startUrl ?? ""), scopePrefix: typeof body.scopePrefix === "string" ? body.scopePrefix : undefined, maxPages: Number(body.maxPages ?? 25) }) });
    if (action === "answer") {
      const question = String(body.question ?? "").trim();
      if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });
      return NextResponse.json(await answerFromClassroom(await readRun(String(body.runId ?? "")), question));
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Classroom research failed." }, { status: 400 }); }
}
