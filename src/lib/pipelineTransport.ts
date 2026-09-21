import type { PipelineItem } from "@/lib/clientPipelineAdapter";

export type PipelineTarget = "local" | "cloud";

type LocalItem = {
  slug: string; title: string; stage: PipelineItem["stage"]; idea: string;
  created: string; updated?: string; route?: PipelineItem["route"];
  confidence?: number; tags?: string[]; classification?: string; plan?: string;
  tasks?: string; pinned?: boolean; buildFile?: string;
};

export function localPipelineItem(item: LocalItem): PipelineItem {
  return {
    id: item.slug, slug: item.slug, title: item.title, stage: item.stage,
    idea: item.idea, createdAt: item.created, updatedAt: item.updated ?? item.created,
    route: item.route ?? null, confidence: item.confidence ?? null, tags: item.tags ?? [],
    classification: item.classification ?? null, plan: item.plan ?? null,
    tasks: item.tasks ?? null, pinned: item.pinned === true,
    buildArtifactId: item.buildFile ?? null, buildPreviewHtml: null,
    executionState: null, executionJobId: null, executionError: null, decidedAt: null,
  };
}

export function pipelineRequest(target: PipelineTarget, init: RequestInit, query = "") {
  if (target === "cloud") return { url: `/api/client-runtime/pipeline${query}`, init };
  const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
  const action = init.method === "DELETE" ? "delete"
    : init.method === "PATCH" ? (typeof body.pinned === "boolean" ? "pin" : "decide")
      : body.action;
  if (!["capture", "shape", "build", "delete", "pin", "decide"].includes(String(action))) throw new Error("Unknown pipeline action");
  return {
    url: `/api/pipeline/${action}`,
    init: {
      ...init, method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, slug: body.id ?? new URLSearchParams(query).get("id"), ...(action === "decide" ? { approve: body.decision === "approve" } : {}) }),
    },
  };
}

export function localPipelineArtifactUrl(file: string) {
  if (!file || file.split("/").some((part) => part === ".." || part === "." || !part) || file.includes("\\")) throw new Error("Invalid artifact path");
  return `/api/freeclaude/preview/free-claude-code/${file.split("/").map(encodeURIComponent).join("/")}`;
}
