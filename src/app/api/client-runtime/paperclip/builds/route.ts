import {
  paperclipError,
  paperclipJson,
  paperclipReadLimit,
  paperclipSession,
  readPaperclipAgents,
  readPaperclipIssues,
  readPaperclipProjects,
} from "@/lib/clientPaperclipData";
import { paperclipBuilds } from "@/lib/clientPaperclipAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GALLERY_LIMIT = 24;

// Hosted equivalent of the local `/api/paperclip/builds` gallery feed. Local
// Paperclip infers a shipped build from a `/builds/*.html` link plus an image
// attachment on the issue. Here a build exists when the worker committed a
// tenant artifact, so the card can only render for bytes that are really in
// tenant Cloud Storage.
export async function GET() {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipReadLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);

  const [issues, agents, projects] = await Promise.all([
    readPaperclipIssues(session.tenantSlug),
    readPaperclipAgents(session.tenantSlug),
    readPaperclipProjects(session.tenantSlug),
  ]);
  if (!issues.ok || !agents.ok || !projects.ok) {
    const schemaMissing = [issues, agents, projects].some((result) => !result.ok && result.schemaMissing);
    return schemaMissing
      ? paperclipJson({ configured: false, reason: "paperclip_schema_missing", count: 0, builds: [] })
      : paperclipError("paperclip_read_failed", 502);
  }

  const builds = paperclipBuilds({ issues: issues.rows, agents: agents.rows, projects: projects.rows });
  return paperclipJson({ configured: true, count: builds.length, builds: builds.slice(0, GALLERY_LIMIT) });
}
