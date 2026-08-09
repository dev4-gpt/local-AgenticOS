"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Code2, Download, FileText, FolderOpen, LoaderCircle, Play, RotateCcw, Terminal, WandSparkles } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import type { ClientTerminalEvent, ClientWorkspaceSurface } from "@/lib/clientWorkspaceExecution";

type Execution = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  provider: string | null;
  model: string | null;
  errorCode: string | null;
  createdAt: string | null;
  finishedAt: string | null;
  title: string | null;
  artifactIntent: "preview" | "brief" | null;
  artifactId: string | null;
  previewHtml: string | null;
  terminalEvents: ClientTerminalEvent[];
};

// Partial because not every job surface is routed to this generic screen: the
// notebook queues workspace executions from its own studio lane, and the
// seventeen Batch A surfaces render through ClientStudioWorkspace instead.
const SURFACE_COPY: Partial<Record<ClientWorkspaceSurface, { title: string; eyebrow: string; description: string; actions: string[]; preview: boolean }>> = {
  orchestrate: { title: "Orchestration Control", eyebrow: "III. Orchestrate", description: "Create a bounded tenant runtime job with a transcript, durable result, and explicit approval boundary.", actions: ["Plan a launch sequence", "Review an operating workflow", "Prepare a stakeholder handoff"], preview: false },
  paperclip: { title: "Paperclip", eyebrow: "III. Orchestrate · Build ledger", description: "Prepare a real hosted build artifact and preserve the job record, terminal trail, and output in this tenant.", actions: ["Build a landing page", "Create a client dashboard", "Prepare a product issue brief"], preview: true },
  room: { title: "AI Agent Mastermind", eyebrow: "III. Orchestrate · Room", description: "Turn a room agenda into an approved tenant artifact. Provider work stays queued and auditable.", actions: ["Decision memo", "Red-team an offer", "Create a research brief"], preview: false },
  pipeline: { title: "Pipeline", eyebrow: "III. Orchestrate · Delivery flow", description: "Run an approved pipeline step in an ephemeral workspace and retain the deliverable instead of a laptop-only file.", actions: ["Capture a product idea", "Generate a build brief", "Prepare a review package"], preview: false },
  "agent-kanban": { title: "Agent Kanban", eyebrow: "III. Orchestrate · Team", description: "Create a tenant-owned work artifact from a scoped agent task. Each run exposes its actual queue and output state.", actions: ["Build a mini tool", "Create an SEO content board", "Prototype a dashboard"], preview: true },
  kanban: { title: "Kanban", eyebrow: "III. Orchestrate · Work items", description: "Convert a bounded work item into an auditable artifact through the hosted execution boundary.", actions: ["Draft a sprint plan", "Prepare a review checklist", "Create a task brief"], preview: false },
  loop: { title: "Loop Engineering", eyebrow: "III. Orchestrate · Iterations", description: "Run a bounded implementation loop. The result is stored as an artifact, with no hidden local mutation.", actions: ["Improve a landing page", "Audit a conversion flow", "Design an experiment"], preview: true },
  ruflo: { title: "Ruflo", eyebrow: "III. Orchestrate · Flows", description: "Run a coordinated workstream through the hosted queue and retain a reviewable tenant outcome.", actions: ["Build a campaign plan", "Create a delivery report", "Coordinate a launch"], preview: false },
  create: { title: "Create", eyebrow: "IV. Create", description: "Use the approved hosted workspace to build a tenant artifact. Browser input never reaches a local operator filesystem.", actions: ["Build a product page", "Draft an explainer", "Create a campaign concept"], preview: true },
  opendesign: { title: "OpenDesign", eyebrow: "IV. Create · Design", description: "Generate a tenant-owned design implementation artifact with a real provider run and isolated workspace lifecycle.", actions: ["Design a pricing page", "Create a client portal", "Build a style guide"], preview: true },
  "web-studio": { title: "Web Studio", eyebrow: "IV. Create · Sites", description: "Build a previewable HTML artifact in the hosted runtime. Completed outputs are stored in Cloud Storage for this tenant.", actions: ["Build a launch page", "Create a waitlist page", "Make a portfolio homepage"], preview: true },
  "flow-lab": { title: "Flow Lab", eyebrow: "IV. Create · Strategy", description: "Turn an approved brief into an artifact-backed workflow. External research and publishing stay separately gated.", actions: ["Map an onboarding flow", "Design a content system", "Create a funnel brief"], preview: false },
  video: { title: "Video Studio", eyebrow: "IV. Create · Video", description: "Prepare an artifact-backed production brief now. Video generation activates only when the approved media provider is enabled.", actions: ["Write a product explainer", "Storyboard a launch reel", "Prepare an avatar script"], preview: false },
  studio: { title: "Studio", eyebrow: "IV. Create · Media", description: "Prepare production-ready tenant artifacts through the approved hosted worker, with media providers independently gated.", actions: ["Create a campaign brief", "Draft a narration script", "Design a creative concept"], preview: false },
  openmontage: { title: "OpenMontage", eyebrow: "IV. Create · Video assembly", description: "Create a hosted assembly brief. Render execution remains unavailable until a dedicated media worker is enabled.", actions: ["Create a montage brief", "Plan a trailer", "Draft a scene list"], preview: false },
  music: { title: "Music Studio", eyebrow: "IV. Create · Audio", description: "Prepare a tenant-owned composition brief. Audio generation is activated per provider and budget approval.", actions: ["Create a brand theme", "Draft a podcast intro", "Plan a background score"], preview: false },
  games: { title: "Game Studio", eyebrow: "IV. Create · Interactive", description: "Build a sandboxed, previewable HTML game artifact through the hosted provider lane.", actions: ["Build a memory game", "Create a puzzle game", "Make a clicker prototype"], preview: true },
  thumbnails: { title: "Thumbnail Studio", eyebrow: "IV. Create · Thumbnails", description: "Create a visual direction brief. Image-generation output is activated only with an approved media provider.", actions: ["Create a YouTube thumbnail brief", "Design a launch visual", "Plan a social cover"], preview: false },
  integrations: { title: "Integrations", eyebrow: "V. Govern · Connections", description: "Prepare an implementation record without touching external accounts. Credentials, OAuth scopes, and activation remain reviewed separately.", actions: ["Plan an integration", "Draft an OAuth scope review", "Create a connector brief"], preview: false },
  seo: { title: "SEO", eyebrow: "V. Govern · Search", description: "Create a governed SEO implementation brief. Live research and deployment only run through separately approved adapters.", actions: ["Create an SEO brief", "Audit a content opportunity", "Draft a technical SEO plan"], preview: false },
  "seo-guide": { title: "SEO Guide", eyebrow: "V. Govern · Guidance", description: "Generate a tenant-owned SEO playbook artifact without accessing local toolchains or production publishing destinations.", actions: ["Create an SEO playbook", "Write a content checklist", "Prepare an audit rubric"], preview: false },
  guide: { title: "Capability Guide", eyebrow: "V. Govern · Capability", description: "Generate a governed implementation guide that records its provider, budget, and artifact evidence.", actions: ["Create a capability guide", "Write an approval checklist", "Prepare an operations brief"], preview: false },
  deliver: { title: "Deliver", eyebrow: "VI. Deliver", description: "Prepare an auditable delivery artifact. A destination action is never executed until a separate approval record exists.", actions: ["Create a delivery package", "Prepare a webhook payload brief", "Draft a client handoff"], preview: false },
  leads: { title: "Leads", eyebrow: "VI. Deliver · Lead operations", description: "Create a tenant-owned lead-operation brief. Enrichment and outbound delivery remain provider and approval gated.", actions: ["Define an ICP", "Create a lead research brief", "Prepare outreach copy"], preview: false },
  radar: { title: "Radar", eyebrow: "VI. Deliver · Publishing", description: "Prepare a publishing artifact with a durable trail. No destination receives data until its OAuth/API adapter is approved.", actions: ["Draft a publish plan", "Create a distribution brief", "Prepare a campaign report"], preview: false },
};

export default function ClientExecutionWorkspace({ surface }: { surface: ClientWorkspaceSurface }) {
  const copy = SURFACE_COPY[surface];
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch(`/api/client-runtime/executions?surface=${encodeURIComponent(surface)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) {
      setError(typeof data?.error === "string" ? data.error : "workspace_execution_read_failed");
      return;
    }
    const next = Array.isArray(data?.executions) ? data.executions as Execution[] : [];
    setExecutions(next);
    setSelectedId((current) => current && next.some((item) => item.id === current) ? current : (next[0]?.id ?? null));
  }

  useEffect(() => { void load(); }, [surface]);
  useEffect(() => {
    if (!executions.some((item) => item.status === "queued" || item.status === "running")) return;
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [executions, surface]);

  async function run() {
    if (!title.trim() || !goal.trim() || busy) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/client-runtime/executions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ surface, title, goal, artifactIntent: copy?.preview ? "preview" : "brief" }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(typeof data?.error === "string" ? data.error : "workspace_execution_queue_failed");
    else {
      setTitle("");
      setGoal("");
      await load();
      if (typeof data?.jobId === "string") setSelectedId(data.jobId);
    }
    setBusy(false);
  }

  async function downloadArtifact(artifactId: string) {
    const response = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.downloadUrl !== "string") {
      setError(typeof data?.error === "string" ? data.error : "artifact_download_failed");
      return;
    }
    window.location.assign(data.downloadUrl);
  }

  const selected = useMemo(() => executions.find((item) => item.id === selectedId) ?? executions[0] ?? null, [executions, selectedId]);
  const preview = selected?.previewHtml ? safePreviewDocument(selected.previewHtml) : null;
  const terminalEvents = selected?.terminalEvents ?? [];

  // A surface with no generic copy is rendered by its own component, so
  // reaching this screen for one means the route table is wrong.
  if (!copy) return <ClientRuntimeNotice code="capability_not_enabled" />;

  return <div className="space-y-5 pb-8">
    <section className="panel p-5 md:p-6"><div className="flex flex-wrap items-start gap-4"><div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: "#60a5fa", borderColor: "rgba(96,165,250,0.32)", background: "rgba(96,165,250,0.12)" }}><Terminal size={18} /></div><div className="min-w-0 flex-1"><p className="eyebrow">{copy.eyebrow}</p><h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{copy.title}</h1><p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{copy.description}</p></div><div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: "rgba(90,184,150,0.28)", color: "#5ab896", background: "rgba(90,184,150,0.1)" }}>Cloud Tasks + tenant storage</div></div></section>

    <section className="panel p-5 md:p-6"><div className="flex items-center gap-2"><WandSparkles size={15} color="#60a5fa" /><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Run in hosted workspace</h2></div><div className="mt-4 flex flex-wrap gap-2">{copy.actions.map((action) => <button key={action} type="button" onClick={() => { setTitle(action); setGoal(`Create a clear, production-ready outcome for: ${action}. Keep it scoped to this tenant and include only the implementation artifact.`); }} className="rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)", background: "rgba(255,255,255,0.025)" }}>{action}</button>)}</div><div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr]"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Name the work" className="rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} /><textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Describe the outcome and constraints" className="min-h-[92px] resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} /></div><button type="button" onClick={() => void run()} disabled={busy || !title.trim() || !goal.trim()} className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40" style={{ background: "#60a5fa", color: "#07111d" }}>{busy ? <LoaderCircle size={13} className="animate-spin" /> : copy.preview ? <Code2 size={13} /> : <FileText size={13} />}{busy ? "Queueing" : copy.preview ? "Build preview artifact" : "Create implementation brief"}</button>{error && <div className="mt-4"><ClientRuntimeNotice code={error} /></div>}</section>

    <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]"><div className="panel overflow-hidden"><div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}><div className="flex items-center gap-2"><Activity size={14} color="#60a5fa" /><h2 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Runtime history</h2></div><button type="button" onClick={() => void load()} title="Refresh runtime history" className="p-1.5" style={{ color: "var(--cream-mute)" }}><RotateCcw size={13} /></button></div><div className="max-h-[430px] overflow-y-auto p-2">{executions.length ? executions.map((execution) => <button key={execution.id} type="button" onClick={() => setSelectedId(execution.id)} className="mb-2 w-full rounded-md border p-3 text-left" style={{ borderColor: execution.id === selected?.id ? "rgba(96,165,250,0.5)" : "var(--line-soft)", background: execution.id === selected?.id ? "rgba(96,165,250,0.08)" : "transparent" }}><div className="flex items-start justify-between gap-3"><span className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>{execution.title || "Hosted execution"}</span><Status status={execution.status} /></div><p className="mt-2 text-[10px]" style={{ color: "var(--cream-mute)" }}>{execution.provider || "provider"}{execution.model ? ` · ${execution.model}` : ""}</p>{execution.errorCode && <p className="mt-2 text-[10px]" style={{ color: "#fca5a5" }}>{execution.errorCode}</p>}</button>) : <p className="p-4 text-[11px]" style={{ color: "var(--cream-mute)" }}>No hosted executions yet.</p>}</div></div>
      <div className="panel overflow-hidden"><div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}><Terminal size={14} color="#60a5fa" /><h2 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Execution terminal</h2></div>{selected ? <><pre className="max-h-[220px] min-h-[150px] overflow-auto p-4 text-[11px] leading-6" style={{ color: "var(--cream-dim)" }}>{terminalEvents.length ? terminalEvents.map((event) => `${event.stream === "stderr" ? "!" : ">"} ${event.message}`).join("\n") : "Awaiting worker events."}</pre>{preview && <div className="border-t p-3" style={{ borderColor: "var(--line-soft)" }}><div className="mb-2 flex items-center gap-2 text-[11px]" style={{ color: "var(--cream-dim)" }}><Play size={12} color="#60a5fa" />Sandboxed artifact preview</div><iframe title={`${selected.title || "Hosted"} preview`} sandbox="" referrerPolicy="no-referrer" srcDoc={preview} className="h-[300px] w-full rounded-md border bg-white" style={{ borderColor: "var(--line-soft)" }} /></div>}{selected.artifactId && <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}><span><FolderOpen size={12} className="mr-1 inline" />Tenant artifact retained.</span><button type="button" onClick={() => void downloadArtifact(selected.artifactId!)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5" style={{ borderColor: "rgba(96,165,250,0.35)", color: "#93c5fd" }}><Download size={11} />Signed download</button></div>}</> : <p className="p-4 text-[11px]" style={{ color: "var(--cream-mute)" }}>Queue a workspace run to see its persisted terminal trail.</p>}</div></section>
  </div>;
}

function Status({ status }: { status: Execution["status"] }) {
  const color = status === "succeeded" ? "#5ab896" : status === "failed" || status === "cancelled" ? "#fca5a5" : "#fbbf24";
  return <span className="rounded-md border px-2 py-1 text-[9px] uppercase tracking-[0.1em]" style={{ color, borderColor: `${color}55`, background: `${color}12` }}>{status}</span>;
}

function safePreviewDocument(html: string) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data: https:;">`;
  return html.replace(/<head([^>]*)>/i, `<head$1>${policy}`).replace(/<script[\s\S]*?<\/script>/gi, "");
}
