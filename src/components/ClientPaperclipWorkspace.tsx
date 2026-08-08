"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity, ArrowUpRight, CircleDot, Download, Hammer, LoaderCircle,
  Network, Play, Plus, RotateCw, Trash2, TriangleAlert, Users, X,
} from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import {
  PAPERCLIP_ISSUE_PRIORITIES, paperclipFormatMicros, paperclipOrgChart, paperclipTimeAgo,
  type PaperclipAgent, type PaperclipBuild, type PaperclipCompany, type PaperclipCostRow,
  type PaperclipIssue, type PaperclipOrgNode, type PaperclipProject, type PaperclipRun, type PaperclipStats,
} from "@/lib/clientPaperclipAdapter";

const AMBER = "#d4a574";
const TABS = ["Builds", "Issues", "Active", "Done", "Org", "Dashboard", "Costs"] as const;
type Tab = (typeof TABS)[number];

type IssueRow = Omit<PaperclipIssue, "buildPreviewHtml"> & { hasBuild: boolean };
type Comment = { id: string; issueId: string; authorAgentId: string | null; body: string; createdAt: string };
type Overview = {
  company: PaperclipCompany; projects: PaperclipProject[]; agents: PaperclipAgent[]; issues: IssueRow[];
  runs: PaperclipRun[]; stats: PaperclipStats; activity: Array<{ id: string; agent: string; status: string; when: string; summary: string }>;
  projectStats: Array<{ id: string; name: string; total: number; done: number }>;
  issueByStatus: Record<string, number>; costRows: PaperclipCostRow[];
};

export default function ClientPaperclipWorkspace() {
  const [tab, setTab] = useState<Tab>("Builds");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [builds, setBuilds] = useState<PaperclipBuild[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [detailPreview, setDetailPreview] = useState<string | null>(null);
  const [composer, setComposer] = useState<"issue" | "agent" | "project" | null>(null);

  const load = useCallback(async () => {
    const [overviewResponse, buildsResponse] = await Promise.all([
      fetch("/api/client-runtime/paperclip/overview", { cache: "no-store" }).catch(() => null),
      fetch("/api/client-runtime/paperclip/builds", { cache: "no-store" }).catch(() => null),
    ]);
    const overviewData = await overviewResponse?.json().catch(() => null);
    if (!overviewResponse?.ok) {
      setError(typeof overviewData?.error === "string" ? overviewData.error : "paperclip_read_failed");
      return;
    }
    if (overviewData?.configured === false) {
      setConfigured(false);
      setError(typeof overviewData?.reason === "string" ? overviewData.reason : "paperclip_schema_missing");
      return;
    }
    setConfigured(true);
    setError("");
    setOverview(overviewData as Overview);
    setSelectedId((current) => {
      const issues = (overviewData as Overview).issues;
      return current && issues.some((issue) => issue.id === current) ? current : (issues[0]?.id ?? null);
    });
    const buildsData = await buildsResponse?.json().catch(() => null);
    setBuilds(buildsResponse?.ok && Array.isArray(buildsData?.builds) ? buildsData.builds as PaperclipBuild[] : []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Only poll while a run is genuinely in flight, so an idle board is quiet.
  const inFlight = overview?.issues.some((issue) => issue.executionState === "queued" || issue.executionState === "running") ?? false;
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [inFlight, load]);

  const loadDetail = useCallback(async (issueId: string) => {
    const response = await fetch(`/api/client-runtime/paperclip/issues?issueId=${encodeURIComponent(issueId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) return;
    setComments(Array.isArray(data?.comments) ? data.comments as Comment[] : []);
    setDetailPreview(typeof data?.issue?.buildPreviewHtml === "string" ? data.issue.buildPreviewHtml : null);
  }, []);

  useEffect(() => { if (selectedId) void loadDetail(selectedId); else { setComments([]); setDetailPreview(null); } }, [selectedId, loadDetail]);

  async function call(path: string, init: RequestInit, key: string) {
    setBusy(key);
    setError("");
    const response = await fetch(`/api/client-runtime/paperclip/${path}`, init).catch(() => null);
    const data = await response?.json().catch(() => null);
    setBusy("");
    if (!response?.ok) {
      setError(typeof data?.error === "string" ? data.error : "paperclip_request_failed");
      return null;
    }
    await load();
    if (selectedId) await loadDetail(selectedId);
    return data as Record<string, unknown>;
  }

  const json = (body: Record<string, unknown>, method = "POST"): RequestInit =>
    ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  async function openBuild(artifactId: string) {
    const response = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.downloadUrl !== "string") {
      setError(typeof data?.error === "string" ? data.error : "artifact_download_failed");
      return;
    }
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  const company = overview?.company;
  const issues = overview?.issues ?? [];
  const agents = overview?.agents ?? [];
  const selected = issues.find((issue) => issue.id === selectedId) ?? null;
  const visibleIssues = useMemo(() => {
    if (tab === "Active") return issues.filter((issue) => issue.status === "active" || issue.status === "blocked");
    if (tab === "Done") return issues.filter((issue) => issue.status === "done" || issue.status === "cancelled");
    return issues;
  }, [tab, issues]);

  return <div className="space-y-5 pb-8">
    <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: AMBER, borderColor: "rgba(212,165,116,0.4)", background: "rgba(212,165,116,0.14)" }}><Hammer size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">III. Orchestrate · Build issues</p>
          <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{company?.name || "Paperclip"}</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
            {company?.description || "Your hosted build company: agents, projects, build issues, and everything the team has shipped. Runs execute in the tenant Cloud Run lane and ship a real artifact — no laptop service is embedded."}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {company && <div className="rounded-md border px-3 py-2 text-[10px] font-mono" style={{ borderColor: "rgba(212,165,116,0.3)", color: AMBER, background: "rgba(212,165,116,0.1)" }}>{company.issuePrefix}-{company.issueCounter}</div>}
          <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: "rgba(90,184,150,0.28)", color: "#5ab896", background: "rgba(90,184,150,0.1)" }}>Tenant company · RLS</div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--line-soft)" }}>
        {TABS.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className="flex items-center gap-1.5 border-b-2 px-3 py-2 text-[11px] font-medium" style={{ borderColor: tab === item ? AMBER : "transparent", color: tab === item ? "#f0dcc2" : "var(--cream-mute)" }}>
          {item === "Builds" && <Hammer size={12} />}{item === "Org" && <Network size={12} />}{item === "Dashboard" && <Activity size={12} />}{item}
        </button>)}
      </div>
    </section>

    {!configured
      ? <SchemaNotice />
      : <>
        {overview && <StatTiles stats={overview.stats} />}

        {tab === "Builds" && <BuildsGallery builds={builds} onRefresh={() => void load()} onOpen={openBuild} />}

        {(tab === "Issues" || tab === "Active" || tab === "Done") && <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
              <div className="flex items-center gap-2"><CircleDot size={14} color={AMBER} /><h2 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>{tab === "Issues" ? "Build issue ledger" : `${tab} issues`}</h2><span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{visibleIssues.length} issues</span></div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void load()} title="Refresh issues" className="p-1.5" style={{ color: "var(--cream-mute)" }}><RotateCw size={13} /></button>
                <button type="button" onClick={() => setComposer(composer === "issue" ? null : "issue")} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-semibold" style={{ color: "#1a1206", background: AMBER }}><Plus size={12} />New build issue</button>
              </div>
            </div>
            {composer === "issue" && <IssueComposer projects={overview?.projects ?? []} agents={agents} busy={busy === "issue"} onClose={() => setComposer(null)}
              onSubmit={async (payload) => { const created = await call("issues", json(payload), "issue"); if (created) { setComposer(null); if (typeof (created.issue as { id?: string } | undefined)?.id === "string") setSelectedId((created.issue as { id: string }).id); } }} />}
            <div className="p-3">
              {visibleIssues.length
                ? <div className="space-y-2">{visibleIssues.map((issue) => <IssueRowCard key={issue.id} issue={issue} agents={agents} selected={issue.id === selectedId} onSelect={() => setSelectedId(issue.id)} />)}</div>
                : <EmptyIssues tab={tab} onCreate={() => setComposer("issue")} />}
            </div>
          </div>
          <IssueDetail issue={selected} agents={agents} projects={overview?.projects ?? []} comments={comments} preview={detailPreview} busy={busy}
            onPatch={(patch) => void call("issues", json({ id: selected?.id, ...patch }, "PATCH"), "patch")}
            onShip={() => void call("runs", json({ issueId: selected?.id }), "ship")}
            onComment={(body) => void call("issues", json({ action: "comment", issueId: selected?.id, body }), "comment")}
            onDelete={() => { if (selected) { setSelectedId(null); void call(`issues?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" }, "delete"); } }}
            onOpenBuild={openBuild} />
        </section>}

        {tab === "Org" && <OrgView agents={agents} projects={overview?.projects ?? []} busy={busy} composer={composer} onComposer={setComposer}
          onAgent={async (payload) => { if (await call("agents", json(payload), "agent")) setComposer(null); }}
          onProject={async (payload) => { if (await call("projects", json(payload), "project")) setComposer(null); }}
          onPatchAgent={(id, patch) => void call("agents", json({ id, ...patch }, "PATCH"), "agent-patch")}
          onDeleteAgent={(id) => void call(`agents?id=${encodeURIComponent(id)}`, { method: "DELETE" }, "agent-delete")} />}

        {tab === "Dashboard" && overview && <DashboardView overview={overview} />}
        {tab === "Costs" && overview && <CostsView rows={overview.costRows} stats={overview.stats} />}
      </>}

    {error && <ClientRuntimeNotice code={error} />}
  </div>;
}

function SchemaNotice() {
  return <section className="panel p-6 text-center">
    <TriangleAlert size={24} className="mx-auto" style={{ color: "#fbbf24" }} />
    <h2 className="mt-3 text-[14px] font-semibold" style={{ color: "var(--cream)" }}>Paperclip tables are not in this tenant yet</h2>
    <p className="mx-auto mt-2 max-w-[520px] text-[11.5px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>
      The hosted Paperclip company, agents, projects, issues, and runs live in Supabase under tenant RLS. Apply <span className="font-mono">product-experience/supabase-client-paperclip.sql</span> to this project, then reload. Nothing is shown as working until the tables exist.
    </p>
  </section>;
}

function StatTiles({ stats }: { stats: PaperclipStats }) {
  const tiles: Array<[string, string | number, string, string?]> = [
    ["Build issues", stats.issues, AMBER],
    ["Active agents", `${stats.onlineAgents}/${stats.agents}`, "#60a5fa"],
    ["Builds shipped", stats.builds, "#5ab896"],
    ["Runs 24h", stats.runs24h, "#fbbf24", `${stats.successRate}% success`],
    ["Settled run cost", paperclipFormatMicros(stats.spentMicros), "#c4b5fd", stats.budgetMicros ? `of ${paperclipFormatMicros(stats.budgetMicros)} budget` : "no budget set"],
  ];
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{tiles.map(([label, value, color, note]) => <div key={label} className="panel px-4 py-3">
    <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>{label}</p>
    <p className="mt-1 text-[22px] font-semibold" style={{ color }}>{value}</p>
    {note && <p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>{note}</p>}
  </div>)}</section>;
}

function BuildsGallery({ builds, onRefresh, onOpen }: { builds: PaperclipBuild[] | null; onRefresh: () => void; onOpen: (artifactId: string) => void }) {
  return <section className="panel p-4 md:p-5">
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: "rgba(212,165,116,0.14)", border: "1px solid rgba(212,165,116,0.4)", color: AMBER }}><Hammer size={17} /></div>
          <h2 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--cream)" }}>Everything the team has built</h2>
        </div>
        <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--cream-dim)" }}>
          {builds ? `${builds.length} build${builds.length === 1 ? "" : "s"} shipped` : "Loading…"} · every card is a committed tenant artifact
        </p>
      </div>
      <button type="button" onClick={onRefresh} title="Refresh builds" className="rounded-lg border p-2" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}><RotateCw size={14} /></button>
    </div>

    {builds && builds.length === 0 && <div className="rounded-2xl p-10 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--line-soft)" }}>
      <Hammer size={26} className="mx-auto mb-3" style={{ color: "var(--cream-mute)" }} />
      <div className="text-[14px]" style={{ color: "var(--cream)" }}>No builds yet</div>
      <p className="mx-auto mt-1.5 max-w-[440px] text-[12.5px]" style={{ color: "var(--cream-mute)" }}>Open a build issue, assign an agent, then ship it. When the hosted run commits an artifact, the build appears here automatically.</p>
    </div>}

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {(builds ?? Array.from({ length: 3 })).map((entry, index) => {
        const build = entry as PaperclipBuild | undefined;
        if (!build) return <div key={index} className="h-[300px] animate-pulse rounded-2xl" style={{ background: "rgba(255,255,255,0.03)" }} />;
        return <motion.div key={build.issueId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="group flex flex-col overflow-hidden rounded-2xl" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid var(--line-soft)" }}>
          <button type="button" onClick={() => onOpen(build.artifactId)} className="relative block aspect-[16/10] w-full overflow-hidden text-left" style={{ background: "#05080d" }}>
            {build.previewHtml
              ? <iframe title={`${build.title} build preview`} sandbox="" referrerPolicy="no-referrer" srcDoc={sandboxedPreview(build.previewHtml)} aria-hidden="true" tabIndex={-1}
                  className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white" style={{ width: "250%", height: "250%", transform: "scale(0.4)" }} />
              : <div className="absolute inset-0 grid place-items-center" style={{ color: "var(--cream-mute)" }}><Hammer size={22} /></div>}
            <div className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100" style={{ background: "rgba(5,8,13,0.45)" }}>
              <span className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ background: AMBER, color: "#1a1206" }}><Play size={14} />Open live build</span>
            </div>
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold tracking-wide" style={{ background: "rgba(52,211,153,0.16)", color: "#34d399", backdropFilter: "blur(6px)" }}>
              ● {build.status === "done" ? "SHIPPED" : build.status.toUpperCase()}
            </span>
          </button>
          <div className="flex flex-1 flex-col gap-2 p-3.5">
            <div className="text-[14px] font-semibold leading-snug" style={{ color: "var(--cream)" }}>{build.title}</div>
            <div className="flex items-center gap-2 text-[11.5px]" style={{ color: "var(--cream-mute)" }}>
              {build.agent && <span className="inline-flex items-center gap-1">{build.agentIcon}{build.agent}</span>}
              {build.project && <><span>·</span><span className="truncate">{build.project}</span></>}
              <span>·</span><span>{paperclipTimeAgo(build.createdAt)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <button type="button" onClick={() => onOpen(build.artifactId)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium" style={{ background: "rgba(212,165,116,0.16)", color: AMBER }}><Download size={12} />Signed download</button>
              <span className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[12px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}>{build.identifier}<ArrowUpRight size={12} /></span>
            </div>
          </div>
        </motion.div>;
      })}
    </div>
  </section>;
}

function IssueComposer({ projects, agents, busy, onClose, onSubmit }: {
  projects: PaperclipProject[]; agents: PaperclipAgent[]; busy: boolean; onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [projectId, setProjectId] = useState("");
  const [assigneeAgentId, setAssigneeAgentId] = useState("");
  return <div className="border-b p-4" style={{ borderColor: "var(--line-soft)", background: "rgba(212,165,116,0.05)" }}>
    <div className="flex items-center justify-between gap-3">
      <p className="text-[11px] font-semibold" style={{ color: "#f0dcc2" }}>New build issue</p>
      <button type="button" onClick={onClose} title="Close composer" style={{ color: "var(--cream-mute)" }}><X size={14} /></button>
    </div>
    <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What should the team build?" className="mt-3 w-full rounded-md border px-3 py-2.5 text-[12px]" style={fieldStyle} />
    <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Acceptance criteria, constraints, and what the build must contain." className="mt-2 min-h-[100px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={fieldStyle} />
    <div className="mt-2 grid gap-2 sm:grid-cols-3">
      <select value={priority} onChange={(event) => setPriority(event.target.value)} className="rounded-md border px-3 py-2 text-[12px]" style={fieldStyle} aria-label="Priority">
        {PAPERCLIP_ISSUE_PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="rounded-md border px-3 py-2 text-[12px]" style={fieldStyle} aria-label="Project">
        <option value="">No project</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <select value={assigneeAgentId} onChange={(event) => setAssigneeAgentId(event.target.value)} className="rounded-md border px-3 py-2 text-[12px]" style={fieldStyle} aria-label="Assignee">
        <option value="">Unassigned</option>
        {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
      </select>
    </div>
    <div className="mt-3 flex items-center justify-between gap-3">
      <p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>Creates a numbered tenant issue. Shipping it queues the approved hosted runner.</p>
      <button type="button" disabled={busy || !title.trim()} onClick={() => onSubmit({ title: title.trim(), description: description.trim(), priority, projectId: projectId || null, assigneeAgentId: assigneeAgentId || null })}
        className="inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold disabled:opacity-40" style={{ background: AMBER, color: "#1a1206" }}>
        {busy ? <LoaderCircle size={12} className="animate-spin" /> : <Plus size={12} />}{busy ? "Creating" : "Create issue"}
      </button>
    </div>
  </div>;
}

function IssueRowCard({ issue, agents, selected, onSelect }: { issue: IssueRow; agents: PaperclipAgent[]; selected: boolean; onSelect: () => void }) {
  const agent = agents.find((candidate) => candidate.id === issue.assigneeAgentId);
  return <button type="button" onClick={onSelect} className="w-full rounded-md border p-3 text-left" style={{ borderColor: selected ? "rgba(212,165,116,0.5)" : "var(--line-soft)", background: selected ? "rgba(212,165,116,0.07)" : "rgba(255,255,255,0.018)" }}>
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: statusColor(issue) }} />
      <span className="shrink-0 font-mono text-[10.5px]" style={{ color: AMBER }}>{issue.identifier}</span>
      <span className="truncate text-[12px] font-medium" style={{ color: "var(--cream)" }}>{issue.title}</span>
      {issue.hasBuild && <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "rgba(52,211,153,0.16)", color: "#34d399" }}>BUILD</span>}
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "var(--cream-mute)" }}>
      <span className="rounded border px-1.5 py-0.5" style={{ borderColor: "var(--line-soft)" }}>{issue.status}</span>
      <span style={{ color: priorityColor(issue.priority) }}>{issue.priority}</span>
      {agent && <span>· {agent.icon} {agent.name}</span>}
      <span>· {paperclipTimeAgo(issue.createdAt)}</span>
      {issue.executionState && <span>· run {issue.executionState}</span>}
    </div>
  </button>;
}

function IssueDetail({ issue, agents, projects, comments, preview, busy, onPatch, onShip, onComment, onDelete, onOpenBuild }: {
  issue: IssueRow | null; agents: PaperclipAgent[]; projects: PaperclipProject[]; comments: Comment[]; preview: string | null; busy: string;
  onPatch: (patch: Record<string, unknown>) => void; onShip: () => void; onComment: (body: string) => void; onDelete: () => void; onOpenBuild: (artifactId: string) => void;
}) {
  const [draft, setDraft] = useState("");
  if (!issue) return <aside className="panel grid min-h-[260px] place-items-center p-6 text-center">
    <div><CircleDot size={20} className="mx-auto" style={{ color: "var(--cream-mute)" }} /><p className="mt-2 text-[11px]" style={{ color: "var(--cream-mute)" }}>Select a build issue to inspect its run state, thread, and artifact.</p></div>
  </aside>;
  const running = issue.executionState === "queued" || issue.executionState === "running";
  return <aside className="panel overflow-hidden">
    <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
      <div className="flex items-center gap-2"><span className="font-mono text-[11px]" style={{ color: AMBER }}>{issue.identifier}</span></div>
      <button type="button" onClick={onDelete} title="Delete issue" className="p-1" style={{ color: "var(--cream-mute)" }}><Trash2 size={13} /></button>
    </div>
    <div className="space-y-4 p-4">
      <p className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{issue.title}</p>
      {issue.description && <p className="whitespace-pre-wrap text-[11px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>{issue.description}</p>}

      <div className="grid gap-2">
        <select value={issue.status} onChange={(event) => onPatch({ status: event.target.value })} className="rounded-md border px-2.5 py-2 text-[11px]" style={fieldStyle} aria-label="Issue status">
          {["backlog", "active", "blocked", "done", "cancelled"].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={issue.priority} onChange={(event) => onPatch({ priority: event.target.value })} className="rounded-md border px-2.5 py-2 text-[11px]" style={fieldStyle} aria-label="Issue priority">
          {PAPERCLIP_ISSUE_PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={issue.assigneeAgentId ?? ""} onChange={(event) => onPatch({ assigneeAgentId: event.target.value || null })} className="rounded-md border px-2.5 py-2 text-[11px]" style={fieldStyle} aria-label="Issue assignee">
          <option value="">Unassigned</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.role ? ` — ${agent.role}` : ""}</option>)}
        </select>
        <select value={issue.projectId ?? ""} onChange={(event) => onPatch({ projectId: event.target.value || null })} className="rounded-md border px-2.5 py-2 text-[11px]" style={fieldStyle} aria-label="Issue project">
          <option value="">No project</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </div>

      <button type="button" disabled={busy === "ship" || running} onClick={onShip} className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[11px] font-semibold disabled:opacity-40" style={{ background: AMBER, color: "#1a1206" }}>
        {busy === "ship" ? <LoaderCircle size={12} className="animate-spin" /> : <Play size={12} />}
        {running ? `Run ${issue.executionState}…` : busy === "ship" ? "Queueing run" : "Ship it — queue agent run"}
      </button>
      {issue.executionState && <p className="text-[10px]" style={{ color: issue.executionState === "failed" ? "#fca5a5" : "var(--cream-mute)" }}>Run state: {issue.executionState}{issue.executionJobId ? ` · job ${issue.executionJobId.slice(0, 8)}` : ""}</p>}

      {preview && <div>
        <p className="mb-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Sandboxed build preview</p>
        <iframe title={`${issue.title} build`} sandbox="" referrerPolicy="no-referrer" srcDoc={sandboxedPreview(preview)} className="h-[220px] w-full rounded-md border bg-white" style={{ borderColor: "var(--line-soft)" }} />
      </div>}
      {issue.buildArtifactId && <button type="button" onClick={() => onOpenBuild(issue.buildArtifactId!)} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px]" style={{ borderColor: "rgba(212,165,116,0.35)", color: AMBER }}><Download size={11} />Signed artifact download</button>}

      <div>
        <p className="mb-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Thread · {comments.length}</p>
        <div className="space-y-2">{comments.map((comment) => <div key={comment.id} className="rounded-md border p-2.5 text-[11px] leading-relaxed" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)", background: "rgba(255,255,255,0.015)" }}>
          {comment.body}<span className="mt-1 block text-[9.5px]" style={{ color: "var(--cream-mute)" }}>{paperclipTimeAgo(comment.createdAt)}</span>
        </div>)}</div>
        <div className="mt-2 flex gap-2">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a note to this issue" className="min-w-0 flex-1 rounded-md border px-2.5 py-2 text-[11px]" style={fieldStyle} />
          <button type="button" disabled={!draft.trim() || busy === "comment"} onClick={() => { onComment(draft.trim()); setDraft(""); }} className="shrink-0 rounded-md border px-2.5 py-2 text-[10px] disabled:opacity-40" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>Post</button>
        </div>
      </div>
    </div>
  </aside>;
}

function OrgView({ agents, projects, busy, composer, onComposer, onAgent, onProject, onPatchAgent, onDeleteAgent }: {
  agents: PaperclipAgent[]; projects: PaperclipProject[]; busy: string; composer: "issue" | "agent" | "project" | null;
  onComposer: (value: "issue" | "agent" | "project" | null) => void;
  onAgent: (payload: Record<string, unknown>) => void; onProject: (payload: Record<string, unknown>) => void;
  onPatchAgent: (id: string, patch: Record<string, unknown>) => void; onDeleteAgent: (id: string) => void;
}) {
  const chart = useMemo(() => paperclipOrgChart(agents), [agents]);
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
        <div className="flex items-center gap-2"><Users size={14} color={AMBER} /><h2 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Organisation</h2><span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{agents.length} agents</span></div>
        <button type="button" onClick={() => onComposer(composer === "agent" ? null : "agent")} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-semibold" style={{ background: AMBER, color: "#1a1206" }}><Plus size={12} />Hire agent</button>
      </div>
      {composer === "agent" && <AgentComposer agents={agents} busy={busy === "agent"} onClose={() => onComposer(null)} onSubmit={onAgent} />}
      <div className="p-4">{agents.length ? <div className="space-y-2">{chart.map((node) => <OrgBranch key={node.agent.id} node={node} depth={0} onPatch={onPatchAgent} onDelete={onDeleteAgent} />)}</div>
        : <p className="py-8 text-center text-[11px]" style={{ color: "var(--cream-mute)" }}>No agents yet. Hire one, then assign it to a build issue.</p>}</div>
    </section>
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
        <h2 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Projects</h2>
        <button type="button" onClick={() => onComposer(composer === "project" ? null : "project")} className="rounded-md border p-1.5" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}><Plus size={12} /></button>
      </div>
      {composer === "project" && <ProjectComposer busy={busy === "project"} onClose={() => onComposer(null)} onSubmit={onProject} />}
      <div className="space-y-2 p-4">{projects.length ? projects.map((project) => <div key={project.id} className="rounded-md border p-2.5" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.018)" }}>
        <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: project.color }} /><span className="text-[12px] font-medium" style={{ color: "var(--cream)" }}>{project.icon} {project.name}</span></div>
        <p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>{project.status}{project.targetDate ? ` · target ${project.targetDate}` : ""}</p>
      </div>) : <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>No projects yet.</p>}</div>
    </section>
  </div>;
}

function OrgBranch({ node, depth, onPatch, onDelete }: { node: PaperclipOrgNode; depth: number; onPatch: (id: string, patch: Record<string, unknown>) => void; onDelete: (id: string) => void }) {
  const agent = node.agent;
  const paused = agent.status === "paused" || agent.status === "terminated";
  return <div style={{ marginLeft: depth * 18 }}>
    <div className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.018)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: agent.status === "working" ? "#fbbf24" : paused ? "#6b7280" : "#5ab896" }} />
        <span className="text-[12.5px] font-medium" style={{ color: "var(--cream)" }}>{agent.icon} {agent.name}</span>
        {agent.role && <span className="rounded border px-1.5 py-0.5 text-[9.5px] uppercase" style={{ borderColor: "var(--line-soft)", color: AMBER }}>{agent.role}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => onPatch(agent.id, { status: paused ? "idle" : "paused" })} className="rounded border px-2 py-1 text-[9.5px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}>{paused ? "Resume" : "Pause"}</button>
          <button type="button" onClick={() => onDelete(agent.id)} title="Remove agent" className="p-1" style={{ color: "var(--cream-mute)" }}><Trash2 size={12} /></button>
        </div>
      </div>
      <p className="mt-1.5 text-[10px]" style={{ color: "var(--cream-mute)" }}>
        {agent.title || "—"} · {agent.provider ? `${agent.provider}${agent.model ? ` · ${agent.model}` : ""}` : "no reviewed provider"} · {agent.budgetMicros ? paperclipFormatMicros(agent.budgetMicros) : "no budget"}
        {agent.lastHeartbeatAt ? ` · heartbeat ${paperclipTimeAgo(agent.lastHeartbeatAt)}` : " · never run"}
      </p>
    </div>
    {node.reports.length > 0 && <div className="mt-2 space-y-2">{node.reports.map((child) => <OrgBranch key={child.agent.id} node={child} depth={depth + 1} onPatch={onPatch} onDelete={onDelete} />)}</div>}
  </div>;
}

function AgentComposer({ agents, busy, onClose, onSubmit }: { agents: PaperclipAgent[]; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [icon, setIcon] = useState("");
  const [reportsTo, setReportsTo] = useState("");
  const [budget, setBudget] = useState("");
  return <div className="border-b p-4" style={{ borderColor: "var(--line-soft)", background: "rgba(212,165,116,0.05)" }}>
    <div className="flex items-center justify-between"><p className="text-[11px] font-semibold" style={{ color: "#f0dcc2" }}>Hire an agent</p><button type="button" onClick={onClose} title="Close" style={{ color: "var(--cream-mute)" }}><X size={14} /></button></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Agent name" className="rounded-md border px-3 py-2 text-[12px]" style={fieldStyle} />
      <input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Role (CEO, CTO, Engineer…)" className="rounded-md border px-3 py-2 text-[12px]" style={fieldStyle} />
      <input value={icon} onChange={(event) => setIcon(event.target.value)} placeholder="Icon (emoji)" maxLength={4} className="rounded-md border px-3 py-2 text-[12px]" style={fieldStyle} />
      <input value={budget} onChange={(event) => setBudget(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="Monthly budget (USD)" className="rounded-md border px-3 py-2 text-[12px]" style={fieldStyle} />
      <select value={reportsTo} onChange={(event) => setReportsTo(event.target.value)} className="rounded-md border px-3 py-2 text-[12px] sm:col-span-2" style={fieldStyle} aria-label="Reports to">
        <option value="">Reports to nobody</option>
        {agents.map((agent) => <option key={agent.id} value={agent.id}>Reports to {agent.name}</option>)}
      </select>
    </div>
    <p className="mt-2 text-[10px]" style={{ color: "var(--cream-mute)" }}>The agent runs on this tenant&apos;s reviewed workspace provider. It cannot be given a provider or model outside the approved allowlist.</p>
    <button type="button" disabled={busy || !name.trim()} onClick={() => onSubmit({ name: name.trim(), role: role.trim(), icon: icon.trim(), reportsTo: reportsTo || null, budgetMicros: Math.round((Number(budget) || 0) * 1_000_000) })}
      className="mt-3 inline-flex items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold disabled:opacity-40" style={{ background: AMBER, color: "#1a1206" }}>
      {busy ? <LoaderCircle size={12} className="animate-spin" /> : <Plus size={12} />}{busy ? "Hiring" : "Hire agent"}
    </button>
  </div>;
}

function ProjectComposer({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  return <div className="border-b p-4" style={{ borderColor: "var(--line-soft)", background: "rgba(212,165,116,0.05)" }}>
    <div className="flex items-center justify-between"><p className="text-[11px] font-semibold" style={{ color: "#f0dcc2" }}>New project</p><button type="button" onClick={onClose} title="Close" style={{ color: "var(--cream-mute)" }}><X size={14} /></button></div>
    <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" className="mt-3 w-full rounded-md border px-3 py-2 text-[12px]" style={fieldStyle} />
    <input value={icon} onChange={(event) => setIcon(event.target.value)} placeholder="Icon (emoji)" maxLength={4} className="mt-2 w-full rounded-md border px-3 py-2 text-[12px]" style={fieldStyle} />
    <button type="button" disabled={busy || !name.trim()} onClick={() => onSubmit({ name: name.trim(), icon: icon.trim() })} className="mt-3 inline-flex items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold disabled:opacity-40" style={{ background: AMBER, color: "#1a1206" }}>
      {busy ? <LoaderCircle size={12} className="animate-spin" /> : <Plus size={12} />}{busy ? "Creating" : "Create project"}
    </button>
  </div>;
}

function DashboardView({ overview }: { overview: Overview }) {
  const { stats, activity, projectStats, issueByStatus } = overview;
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
    <section className="panel p-4 md:p-5">
      <div className="flex items-center gap-2"><Activity size={14} color={AMBER} /><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Company dashboard</h2></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([["Runs 24h", stats.runs24h], ["Succeeded", stats.succeeded], ["Failed", stats.failed], ["Success rate", `${stats.successRate}%`]] as const).map(([label, value]) => <div key={label} className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.02)" }}>
          <p className="text-[10px] uppercase" style={{ color: "var(--cream-mute)" }}>{label}</p><p className="mt-1 text-[18px] font-semibold" style={{ color: "var(--cream)" }}>{value}</p>
        </div>)}
      </div>
      <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Projects</h3>
      <div className="mt-2 space-y-2">{projectStats.length ? projectStats.map((project) => <div key={project.id} className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)" }}>
        <div className="flex items-center justify-between text-[11.5px]"><span style={{ color: "var(--cream)" }}>{project.name}</span><span style={{ color: "var(--cream-mute)" }}>{project.done}/{project.total}</span></div>
        <div className="mt-2 h-1.5 w-full rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}><div className="h-full rounded-full" style={{ width: `${project.total ? (project.done / project.total) * 100 : 0}%`, background: AMBER }} /></div>
      </div>) : <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>No projects yet.</p>}</div>
      <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Issues by status</h3>
      <div className="mt-2 flex flex-wrap gap-2">{Object.entries(issueByStatus).map(([status, count]) => <span key={status} className="rounded-md border px-2.5 py-1.5 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>{status} · {count}</span>)}
        {Object.keys(issueByStatus).length === 0 && <span className="text-[11px]" style={{ color: "var(--cream-mute)" }}>No issues yet.</span>}</div>
    </section>
    <section className="panel overflow-hidden">
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}><h2 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Recent agent runs</h2></div>
      <div className="max-h-[520px] space-y-2 overflow-y-auto p-3">{activity.length ? activity.map((entry) => <div key={entry.id} className="rounded-md border p-2.5" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.018)" }}>
        <div className="flex items-center justify-between gap-2"><span className="text-[11.5px]" style={{ color: "var(--cream)" }}>{entry.agent}</span><span className="text-[9.5px] uppercase" style={{ color: entry.status === "succeeded" ? "#5ab896" : entry.status === "failed" ? "#fca5a5" : "#fbbf24" }}>{entry.status}</span></div>
        {entry.summary && <p className="mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>{entry.summary}</p>}
        <p className="mt-1 text-[9.5px]" style={{ color: "var(--cream-mute)" }}>{paperclipTimeAgo(entry.when)}</p>
      </div>) : <p className="p-3 text-[11px]" style={{ color: "var(--cream-mute)" }}>No agent runs yet. Ship a build issue to create one.</p>}</div>
    </section>
  </div>;
}

function CostsView({ rows, stats }: { rows: PaperclipCostRow[]; stats: PaperclipStats }) {
  return <section className="panel p-4 md:p-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="eyebrow">Settled provider spend</p><h2 className="mt-1 text-[15px] font-semibold" style={{ color: "var(--cream)" }}>Cost per agent</h2></div>
      <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>{paperclipFormatMicros(stats.spentMicros)} settled{stats.budgetMicros ? ` · ${paperclipFormatMicros(stats.budgetMicros)} company budget` : ""}</p>
    </div>
    <div className="mt-4 space-y-2">{rows.length ? rows.map((row) => {
      const share = row.budgetMicros ? Math.min(100, (row.spentMicros / row.budgetMicros) * 100) : 0;
      return <div key={row.id} className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.02)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] font-medium" style={{ color: "var(--cream)" }}>{row.name}</span>
          <span className="text-[11px]" style={{ color: "#c4b5fd" }}>{paperclipFormatMicros(row.spentMicros)}{row.budgetMicros ? ` / ${paperclipFormatMicros(row.budgetMicros)}` : ""}</span>
        </div>
        <p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>{row.provider || "no reviewed provider"}{row.model ? ` · ${row.model}` : ""} · {row.runs} run{row.runs === 1 ? "" : "s"}</p>
        {row.budgetMicros > 0 && <div className="mt-2 h-1.5 w-full rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}><div className="h-full rounded-full" style={{ width: `${share}%`, background: share > 85 ? "#fca5a5" : "#c4b5fd" }} /></div>}
      </div>;
    }) : <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>No agents yet, so nothing has spent against the tenant budget.</p>}</div>
  </section>;
}

function EmptyIssues({ tab, onCreate }: { tab: Tab; onCreate: () => void }) {
  return <div className="grid min-h-[220px] place-items-center p-6 text-center"><div>
    <CircleDot size={22} className="mx-auto" style={{ color: AMBER }} />
    <p className="mt-3 text-[12px] font-medium" style={{ color: "var(--cream)" }}>No {tab.toLowerCase()} issues yet</p>
    <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>Open a build issue to get a numbered tenant record. Assigning an agent and shipping it queues the approved hosted run.</p>
    <button type="button" onClick={onCreate} className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "rgba(212,165,116,0.36)", color: AMBER }}><Plus size={12} />New build issue</button>
  </div></div>;
}

const fieldStyle = { color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" } as const;

function statusColor(issue: IssueRow) {
  if (issue.executionState === "failed" || issue.status === "blocked") return "#fca5a5";
  if (issue.status === "done") return "#5ab896";
  if (issue.executionState === "running" || issue.executionState === "queued") return "#fbbf24";
  return AMBER;
}

function priorityColor(priority: string) {
  return priority === "critical" ? "#fca5a5" : priority === "high" ? "#fbbf24" : priority === "low" ? "var(--cream-mute)" : "#93c5fd";
}

// Build artifacts are provider-generated HTML. They render only inside a
// sandboxed frame with scripts stripped and a restrictive CSP, so a build can
// never reach the tenant session or the network. This mirrors the execution
// workspace preview; it is duplicated here because the shared module is
// server-only (it imports node:buffer).
function sandboxedPreview(html: string) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;">`;
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<head([^>]*)>/i, `<head$1>${policy}`);
}
