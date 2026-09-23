import { Buffer } from "node:buffer";
import { parseClientReviewedPlan, reviewedPlanMarkdown } from "@/lib/clientProviderContracts";

export type ClientWorkspaceSurface =
  | "orchestrate" | "paperclip" | "room" | "pipeline" | "agent-kanban" | "kanban" | "loop" | "ruflo"
  | "create" | "opendesign" | "web-studio" | "flow-lab" | "video" | "studio" | "openmontage" | "music" | "games" | "thumbnails"
  | "integrations" | "seo" | "seo-guide" | "guide" | "deliver" | "leads" | "radar"
  | "notebook";

export type ClientTerminalEvent = {
  at: string;
  stream: "system" | "stdout" | "stderr";
  message: string;
};

export type WorkspaceArtifactIntent = "preview" | "brief" | "copy";

export const WORKSPACE_ARTIFACT_INTENTS: WorkspaceArtifactIntent[] = ["preview", "brief", "copy"];

export function isWorkspaceArtifactIntent(value: string): value is WorkspaceArtifactIntent {
  return (WORKSPACE_ARTIFACT_INTENTS as string[]).includes(value);
}

export type WorkspaceArtifact = {
  fileName: string;
  contentType: "text/html" | "text/markdown";
  bytes: Buffer;
  previewHtml?: string;
  /**
   * Set when a `preview` request produced markdown instead of HTML because the
   * provider returned a reviewed plan. Recorded rather than hidden: the preview
   * pane will be empty, and that should be explainable from the job record.
   */
  downgradedFrom?: WorkspaceArtifactIntent;
};

const SURFACES = new Set<ClientWorkspaceSurface>([
  "orchestrate", "paperclip", "room", "pipeline", "agent-kanban", "kanban", "loop", "ruflo",
  "create", "opendesign", "web-studio", "flow-lab", "video", "studio", "openmontage", "music", "games", "thumbnails",
  "integrations", "seo", "seo-guide", "guide", "deliver", "leads", "radar",
  "notebook",
]);

export function isClientWorkspaceSurface(value: string): value is ClientWorkspaceSurface {
  return SURFACES.has(value as ClientWorkspaceSurface);
}

export function workspaceTerminalEvents(surface: ClientWorkspaceSurface, phase: "queued" | "started" | "completed" | "failed", detail?: string): ClientTerminalEvent[] {
  const now = new Date().toISOString();
  const message = detail?.trim().slice(0, 500);
  const prefix = surface.replace(/-/g, " ");
  if (phase === "queued") return [
    { at: now, stream: "system", message: `Queued ${prefix} in the tenant runtime.` },
    { at: now, stream: "system", message: "Waiting for the approved Cloud Tasks worker." },
  ];
  if (phase === "started") return [
    { at: now, stream: "system", message: `Claimed ${prefix} execution in an ephemeral hosted workspace.` },
    { at: now, stream: "stdout", message: "Provider request is bounded by the tenant model policy and budget." },
  ];
  if (phase === "completed") return [
    { at: now, stream: "stdout", message: message || "Execution produced a tenant artifact." },
    { at: now, stream: "system", message: "Workspace cleanup complete. Durable output remains in tenant storage." },
  ];
  return [{ at: now, stream: "stderr", message: message || "Execution stopped before an artifact was created." }];
}

/**
 * Three intents, because two were not enough. `preview` renders something, and
 * `brief` plans something - but a surface like Radar exists to produce the
 * finished piece, and asking for a brief gave it a document *about* the post
 * instead of the post. This instruction is appended after the goal, so it wins
 * any disagreement; that is precisely why the surface's intent has to be
 * expressible here rather than argued for in the goal text.
 */
export function workspacePrompt(input: { surface: ClientWorkspaceSurface; title: string; goal: string; artifactIntent: WorkspaceArtifactIntent }) {
  const requested = input.artifactIntent === "preview"
    ? "Return one complete, self-contained HTML document in a single ```html code fence. Use inline CSS only. Do not include scripts, remote assets, API keys, or placeholders for work you did not perform."
    : input.artifactIntent === "copy"
    ? "Return the finished piece itself in a single ```markdown code fence - the words as they would be published, not a plan or a brief describing them. No preamble, no notes to the reader, no headings that only label the deliverable. Do not include API keys, secrets, or claims that an external action was performed."
    : "Return a concise Markdown implementation brief in a single ```markdown code fence. Do not include API keys, secrets, or claims that an external action was performed.";
  return [
    "You are the approved Veloce hosted workspace adapter.",
    `Surface: ${input.surface}.`,
    `Task title: ${input.title}.`,
    "Tenant request:",
    input.goal,
    "",
    requested,
    "The output becomes a tenant-owned artifact and must be directly useful.",
  ].join("\n").slice(0, 20_000);
}

export function artifactFromWorkspaceOutput(input: { surface: ClientWorkspaceSurface; title: string; artifactIntent: WorkspaceArtifactIntent; output: string; finishReason?: string | null }): WorkspaceArtifact | null {
  const safeBase = input.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || input.surface;

  // Providers whose contract sets toolMode "reviewed-plan" are given a FORCED
  // tool choice, so the model cannot return prose at all — its output is the
  // serialized plan envelope, which contains no fenced block. Before this
  // branch existed, extractFence found nothing and every workspace execution on
  // those four lanes (openclaw, hermes, fusion, antigravity) failed
  // workspace_artifact_invalid, after the provider had already been billed.
  //
  // A plan is structured data with no HTML, so it cannot satisfy the preview
  // contract below. It downgrades to markdown and says so, rather than
  // synthesising HTML the model never produced.
  const reviewedPlan = parseClientReviewedPlan(input.output);
  if (reviewedPlan) {
    const markdown = reviewedPlanMarkdown(reviewedPlan.plan);
    if (!markdown || markdown.length > 36_000) return null;
    return {
      fileName: `${safeBase}.md`,
      contentType: "text/markdown",
      bytes: Buffer.from(markdown, "utf8"),
      ...(input.artifactIntent === "preview" ? { downgradedFrom: "preview" as const } : {}),
    };
  }

  let extracted = extractFence(input.output, input.artifactIntent === "preview" ? "html" : "markdown");
  // Some text providers omit the terminal Markdown fence despite a normal
  // stop. Accept only an otherwise complete single Markdown block. A length
  // stop must never turn truncated output into a shipped artifact.
  if (!extracted && input.artifactIntent !== "preview" && input.finishReason === "stop") {
    const opening = /```(?:markdown|md)\s*\n/i.exec(input.output);
    if (opening) {
      const prefix = input.output.slice(0, opening.index);
      const body = input.output.slice(opening.index + opening[0].length);
      if (prefix.length <= 1_000 && !prefix.includes("```") && body.trim() && !body.includes("```")) extracted = body;
    }
  }
  if (!extracted) return null;
  if (input.artifactIntent === "preview") {
    const html = extracted.trim();
    if (!/<html[\s>]|<!doctype html/i.test(html) || html.length > 36_000) return null;
    return { fileName: `${safeBase}.html`, contentType: "text/html", bytes: Buffer.from(html, "utf8"), previewHtml: html };
  }
  const markdown = extracted.trim();
  if (!markdown || markdown.length > 36_000) return null;
  return { fileName: `${safeBase}.md`, contentType: "text/markdown", bytes: Buffer.from(markdown, "utf8") };
}

function extractFence(output: string, language: "html" | "markdown") {
  const matcher = language === "html"
    ? /^```(?:html)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*(?:\r?\n|$)/im
    : /^```(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*(?:\r?\n|$)/im;
  return output.match(matcher)?.[1] ?? null;
}
