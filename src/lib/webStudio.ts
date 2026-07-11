import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();
export const WEB_PROJECT_ROOT = process.env.AGENTIC_OS_WEB_PROJECTS
  ?? path.join(HOME, "Documents", "Codex", "Projects", "Websites");

export interface WebProject {
  id: string;
  name: string;
  path: string;
  business: string;
  goal: string;
  createdAt: number;
}

export function webProjectId(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 56) || "website";
}

async function uniqueId(base: string): Promise<string> {
  await mkdir(WEB_PROJECT_ROOT, { recursive: true });
  let id = base;
  let n = 2;
  while (existsSync(path.join(WEB_PROJECT_ROOT, id))) id = `${base}-${n++}`;
  return id;
}

export async function saveWebProject(input: {
  name: string; business: string; goal: string; brief: string; prompt: string;
}): Promise<WebProject> {
  const id = await uniqueId(webProjectId(input.name || input.business));
  const dir = path.join(WEB_PROJECT_ROOT, id);
  const project: WebProject = {
    id,
    name: input.name.trim().slice(0, 100) || "Untitled website",
    path: dir,
    business: input.business.trim().slice(0, 140),
    goal: input.goal.trim().slice(0, 140),
    createdAt: Date.now(),
  };
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "project.json"), JSON.stringify(project, null, 2), "utf8");
  await writeFile(path.join(dir, "site-brief.md"), input.brief, "utf8");
  await writeFile(path.join(dir, "CLAUDE.md"), input.prompt, "utf8");
  return project;
}

export async function listWebProjects(): Promise<WebProject[]> {
  if (!existsSync(WEB_PROJECT_ROOT)) return [];
  const names = await readdir(WEB_PROJECT_ROOT, { withFileTypes: true }).catch(() => []);
  const projects: WebProject[] = [];
  for (const item of names) {
    if (!item.isDirectory() || !/^[a-z0-9-]+$/.test(item.name)) continue;
    try {
      const raw = await readFile(path.join(WEB_PROJECT_ROOT, item.name, "project.json"), "utf8");
      const p = JSON.parse(raw) as WebProject;
      if (p && p.id === item.name && typeof p.name === "string") projects.push(p);
    } catch { /* Skip ordinary folders that are not Web Studio projects. */ }
  }
  return projects.sort((a, b) => b.createdAt - a.createdAt);
}
