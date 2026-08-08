import {
  ensurePaperclipCompany,
  paperclipError,
  paperclipJson,
  paperclipReadLimit,
  paperclipSession,
  readPaperclipAgents,
  readPaperclipIssues,
  readPaperclipProjects,
  readPaperclipRuns,
} from "@/lib/clientPaperclipData";
import {
  paperclipActivity,
  paperclipCostRows,
  paperclipIssueStatusCounts,
  paperclipProjectStats,
  paperclipStats,
  sortPaperclipAgents,
  type PaperclipIssue,
} from "@/lib/clientPaperclipAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hosted equivalent of the local `/api/paperclip/overview` aggregate: one call
// returns the company, roster, board, and dashboard numbers the Paperclip
// surface renders. Unlike the local route it reads tenant Supabase rows under
// RLS instead of a laptop service on :3100.
export async function GET() {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipReadLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);

  const company = await ensurePaperclipCompany(session.tenantSlug);
  if (!company.ok) {
    return company.schemaMissing
      ? paperclipJson({ configured: false, reason: "paperclip_schema_missing" })
      : paperclipError("paperclip_read_failed", 502);
  }

  const [projects, agents, issues, runs] = await Promise.all([
    readPaperclipProjects(session.tenantSlug),
    readPaperclipAgents(session.tenantSlug),
    readPaperclipIssues(session.tenantSlug),
    readPaperclipRuns(session.tenantSlug),
  ]);
  if (!projects.ok || !agents.ok || !issues.ok || !runs.ok) {
    const schemaMissing = [projects, agents, issues, runs].some((result) => !result.ok && result.schemaMissing);
    return schemaMissing
      ? paperclipJson({ configured: false, reason: "paperclip_schema_missing" })
      : paperclipError("paperclip_read_failed", 502);
  }

  return paperclipJson({
    configured: true,
    company: company.company,
    projects: projects.rows,
    agents: sortPaperclipAgents(agents.rows),
    // Build previews are large; the gallery route serves them on demand so the
    // dashboard payload stays small.
    issues: issues.rows.map(withoutPreview),
    runs: runs.rows,
    stats: paperclipStats({ agents: agents.rows, issues: issues.rows, runs: runs.rows, company: company.company }),
    activity: paperclipActivity(runs.rows, agents.rows),
    projectStats: paperclipProjectStats(projects.rows, issues.rows),
    issueByStatus: paperclipIssueStatusCounts(issues.rows),
    costRows: paperclipCostRows(agents.rows, runs.rows),
  });
}

function withoutPreview(issue: PaperclipIssue) {
  const { buildPreviewHtml: _preview, ...rest } = issue;
  return { ...rest, hasBuild: Boolean(issue.buildArtifactId) };
}
