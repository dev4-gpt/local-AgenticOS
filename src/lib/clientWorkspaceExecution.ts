import { Buffer } from "node:buffer";

export type ClientWorkspaceSurface =
  | "orchestrate" | "paperclip" | "room" | "pipeline" | "agent-kanban" | "kanban" | "loop" | "ruflo"
  | "create" | "opendesign" | "web-studio" | "flow-lab" | "video" | "studio" | "openmontage" | "music" | "games" | "thumbnails"
  | "integrations" | "seo" | "seo-guide" | "guide" | "deliver" | "leads" | "radar";

export type ClientTerminalEvent = {
  at: string;
  stream: "system" | "stdout" | "stderr";
  message: string;
};

export type WorkspaceArtifact = {
  fileName: string;
  contentType: "text/html" | "text/markdown";
  bytes: Buffer;
  previewHtml?: string;
};

const SURFACES = new Set<ClientWorkspaceSurface>([
  "orchestrate", "paperclip", "room", "pipeline", "agent-kanban", "kanban", "loop", "ruflo",
  "create", "opendesign", "web-studio", "flow-lab", "video", "studio", "openmontage", "music", "games", "thumbnails",
  "integrations", "seo", "seo-guide", "guide", "deliver", "leads", "radar",
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

export function workspacePrompt(input: { surface: ClientWorkspaceSurface; title: string; goal: string; artifactIntent: "preview" | "brief" }) {
  const requested = input.artifactIntent === "preview"
    ? "Return one complete, self-contained HTML document in a single ```html code fence. Use inline CSS only. Do not include scripts, remote assets, API keys, or placeholders for work you did not perform."
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

export function artifactFromWorkspaceOutput(input: { surface: ClientWorkspaceSurface; title: string; artifactIntent: "preview" | "brief"; output: string }): WorkspaceArtifact | null {
  const extracted = extractFence(input.output, input.artifactIntent === "preview" ? "html" : "markdown");
  if (!extracted) return null;
  const safeBase = input.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || input.surface;
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
    ? /```(?:html)?\s*\n([\s\S]*?)```/i
    : /```(?:markdown|md)?\s*\n([\s\S]*?)```/i;
  return output.match(matcher)?.[1] ?? null;
}
