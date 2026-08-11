import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runHermesQuery } from "@/lib/hermesCli";
import { run } from "@/lib/runner";
import {
  canPublishHermesContentFactoryPlan,
  hermesContentFactoryPrompt,
  type HermesContentFactoryApproval,
  type HermesContentFactoryCitation,
  type HermesContentFactoryPlan,
  type HermesContentFactoryQualityReport,
} from "@/lib/hermesContentFactory";

const ROOT = path.join(os.homedir(), ".agentic-os", "hermes-content-factory");

export type LocalHermesContentFactoryRun = {
  plan: HermesContentFactoryPlan;
  status: "queued" | "running" | "awaiting_approval" | "approved" | "published" | "failed";
  sourceUrls: string[];
  citations: HermesContentFactoryCitation[];
  qualityReport: HermesContentFactoryQualityReport | null;
  approval: HermesContentFactoryApproval | null;
  outlinePath: string | null;
  draftPath: string | null;
  kanbanTaskId: string | null;
  errorCode: string | null;
  updatedAt: string;
};

function fileFor(workflowId: string) {
  return path.join(ROOT, `${workflowId}.json`);
}

export async function readLocalHermesFactoryRun(workflowId: string) {
  try { return JSON.parse(await readFile(fileFor(workflowId), "utf8")) as LocalHermesContentFactoryRun; } catch { return null; }
}

export async function saveLocalHermesFactoryRun(run: LocalHermesContentFactoryRun) {
  await mkdir(ROOT, { recursive: true });
  await writeFile(fileFor(run.plan.workflowId), JSON.stringify(run, null, 2), "utf8");
  return run;
}

export async function runLocalHermesContentFactory(plan: HermesContentFactoryPlan, sourceUrls: string[]) {
  const now = new Date().toISOString();
  const base: LocalHermesContentFactoryRun = {
    plan, status: "running", sourceUrls, citations: [], qualityReport: null, approval: null,
    outlinePath: null, draftPath: null, kanbanTaskId: null, errorCode: null, updatedAt: now,
  };
  let kanbanTaskId: string | null = null;
  const kanban = await run("hermes", ["kanban", "create", `Hermes content factory · ${plan.contentType}`, "--body", `${hermesContentFactoryPrompt(plan, "brief")}\n\nSources:\n${sourceUrls.join("\n")}`, "--json"], { timeoutMs: 30_000 });
  try {
    const parsed = JSON.parse(kanban.stdout) as { id?: unknown; task?: { id?: unknown } };
    const id = parsed.id ?? parsed.task?.id;
    if (typeof id === "string") kanbanTaskId = id;
  } catch { /* Hermes may not have a local Kanban database yet. */ }
  const withKanban = { ...base, kanbanTaskId };
  await saveLocalHermesFactoryRun(withKanban);
  const research = await runHermesQuery([
    hermesContentFactoryPrompt(plan, "research"),
    "Return one citation record per source URL. Preserve the exact URLs and include concise evidence.",
    `Source URLs:\n${sourceUrls.join("\n")}`,
  ].join("\n\n"), { allowTools: false });
  if (!research.ok) return saveLocalHermesFactoryRun({ ...withKanban, status: "failed", errorCode: "local_research_failed", updatedAt: new Date().toISOString() });
  const citations = sourceUrls.map((url, index) => ({ id: `citation-${index + 1}`, url, retrievedAt: new Date().toISOString(), evidence: research.stdout.slice(0, 2000) }));
  const outline = await runHermesQuery(hermesContentFactoryPrompt(plan, "plan"), { allowTools: false });
  if (!outline.ok) return saveLocalHermesFactoryRun({ ...withKanban, citations, status: "failed", errorCode: "local_plan_failed", updatedAt: new Date().toISOString() });
  const draft = await runHermesQuery(hermesContentFactoryPrompt(plan, "draft"), { allowTools: false });
  if (!draft.ok) return saveLocalHermesFactoryRun({ ...withKanban, citations, status: "failed", errorCode: "local_draft_failed", updatedAt: new Date().toISOString() });
  const outlinePath = path.join(ROOT, `${plan.workflowId}-outline.md`);
  const draftPath = path.join(ROOT, `${plan.workflowId}-draft.md`);
  await writeFile(outlinePath, outline.stdout, "utf8");
  await writeFile(draftPath, draft.stdout, "utf8");
  const qualityReport: HermesContentFactoryQualityReport = {
    id: `quality-${plan.workflowId}`, workflowId: plan.workflowId, tenantSlug: plan.tenantSlug,
    passed: citations.length > 0 && draft.stdout.trim().length > 0, score: citations.length > 0 ? 100 : 0,
    citationCount: citations.length, findings: [], checkedAt: new Date().toISOString(),
  };
  return saveLocalHermesFactoryRun({ ...withKanban, status: "awaiting_approval", citations, qualityReport, outlinePath, draftPath, updatedAt: new Date().toISOString() });
}

export function localHermesFactoryCanPublish(run: LocalHermesContentFactoryRun) {
  return canPublishHermesContentFactoryPlan(run.plan, run.approval);
}
