import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { hermesHome } from "@/lib/config";
import { openRouterKey } from "@/lib/providerKeys";

// POST { prompt, shots? } → starts a cinematic generation job, returns { jobId }.
// The Python pipeline runs detached and writes live progress to a job json that
// /api/openmontage/status reads. It prefers a user workspace script when one is
// present, otherwise it uses the bundled local/free renderer.
export async function POST(req: Request) {
  const { prompt, shots, mode } = await req.json().catch(() => ({}));
  if (!prompt || typeof prompt !== "string" || prompt.trim().length < 4) {
    return Response.json({ error: "Describe the video you want (a few words)." }, { status: 400 });
  }
  const isMovie = mode === "movie";
  const n = Math.max(2, Math.min(Number(shots) || (isMovie ? 2 : 6), isMovie ? 4 : 10));
  const jobId = "om-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const ws = path.join(hermesHome(), "profiles", "openmontage", "workspace");
  // Workspace scripts can opt into paid providers; the bundled scripts are
  // offline procedural renderers that only need Python + ffmpeg.
  const workspaceScript = path.join(ws, "scripts", isMovie ? "movie_om.py" : "cinematic_om.py");
  const bundledScript = path.join(process.cwd(), "scripts", "openmontage", isMovie ? "movie_om.py" : "cinematic_om.py");
  const script = existsSync(workspaceScript) ? workspaceScript : bundledScript;
  const countFlag = isMovie ? "--clips" : "--shots";
  const jobsDir = path.join(ws, "jobs");
  const outDir = path.join(process.cwd(), "public", "openmontage", "generated");
  mkdirSync(jobsDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const jobFile = path.join(jobsDir, `${jobId}.json`);
  const outFile = path.join(outDir, `${jobId}.mp4`);
  const env = { ...process.env };
  const orKey = openRouterKey();
  if (orKey) env.OPENROUTER_API_KEY = orKey;

  const child = spawn(
    "python3",
    [script, "--prompt", prompt.trim().slice(0, 600), countFlag, String(n),
      "--out", outFile, "--job", jobFile],
    { detached: true, stdio: "ignore", cwd: ws, env }
  );
  child.unref();

  return Response.json({ jobId, status: "planning" });
}
