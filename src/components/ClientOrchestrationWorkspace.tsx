"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Columns3,
  FileText,
  GitBranch,
  LoaderCircle,
  Network,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import EccWorkflowsPanel from "@/components/EccWorkflowsPanel";

export type ClientOrchestrationSurface = "orchestrate" | "paperclip" | "room" | "pipeline" | "agent-kanban" | "kanban" | "loop" | "ruflo";

type WorkflowStatus = "active" | "done" | "archived";
type StepStatus = "todo" | "in_progress" | "done" | "blocked";
type WorkflowStep = { id: string; title: string; status: StepStatus };
type Workflow = {
  id: string;
  title: string;
  content: string;
  status: WorkflowStatus;
  created_at: string;
  metadata?: {
    operation?: string;
    steps?: WorkflowStep[];
    execution?: { status?: string; errorCode?: string; provider?: string; model?: string; completedSteps?: number };
  };
};
type UsageSummary = {
  totalCostMicros: number;
  inputTokens: number;
  outputTokens: number;
  byProvider: Record<string, { costMicros: number; inputTokens: number; outputTokens: number; model: string | null }>;
};

type SurfaceConfig = {
  title: string;
  eyebrow: string;
  description: string;
  tabs: string[];
  primary: string;
  operation: "plan" | "review" | "build" | "dispatch" | "iterate" | "handoff";
  prompt: string;
};

const CONFIG: Record<ClientOrchestrationSurface, SurfaceConfig> = {
  orchestrate: { title: "Orchestration Control", eyebrow: "III. Orchestrate", description: "Tenant-owned workflow records, queue lifecycle, human review, and delivery evidence.", tabs: ["Overview", "Active", "Completed"], primary: "Create workflow", operation: "plan", prompt: "Define the outcome, constraints, owner, and required review evidence." },
  paperclip: { title: "Paperclip", eyebrow: "III. Orchestrate · Build issues", description: "Hosted build issues with real queue state and tenant-owned workflow evidence. This replaces the local Paperclip service instead of embedding a laptop iframe.", tabs: ["Build issues", "Active", "Done", "Org dashboard", "Cost", "Open full"], primary: "New build issue", operation: "build", prompt: "Describe the build issue, acceptance criteria, constraints, and the artifact you expect." },
  room: { title: "AI Agent Mastermind", eyebrow: "III. Orchestrate · Coordination", description: "A hosted room where reviewed work is sent through the approved provider lane and preserved as a tenant workflow.", tabs: ["In the room", "Agenda", "Decisions", "Handoffs"], primary: "Send to room", operation: "dispatch", prompt: "State the question, decision needed, source context, and any constraints for the room." },
  pipeline: { title: "Pipeline", eyebrow: "III. Orchestrate · Delivery flow", description: "Capture a work item, route it through review, and retain an explicit handoff rather than a vault-only local file.", tabs: ["Pipeline", "Gallery"], primary: "Capture idea", operation: "plan", prompt: "Describe the idea, intended outcome, audience, and non-negotiable constraints." },
  "agent-kanban": { title: "Agent Kanban", eyebrow: "III. Orchestrate · Team board", description: "A tenant board for real queued work. Cards represent durable workflow records, not a browser-only mock board.", tabs: ["Board", "Team", "Workspace", "Activity"], primary: "Add work card", operation: "build", prompt: "Describe the task, definition of done, priority, and reviewer checkpoint." },
  kanban: { title: "Kanban", eyebrow: "III. Orchestrate · Work board", description: "A hosted, reviewable Kanban board with explicit workflow stages and no dependency on Hermes' local database.", tabs: ["Board", "Tasks", "Assignees", "Archive"], primary: "Add task", operation: "plan", prompt: "Describe the task, intended owner, constraints, and completion evidence." },
  loop: { title: "Loop Engineering", eyebrow: "III. Orchestrate · Iterations", description: "A bounded hosted improvement loop. Every run records target, change, checks, and next decision in the tenant ledger.", tabs: ["Loops", "Checks", "History"], primary: "Run loop", operation: "iterate", prompt: "Define the target, success signal, proposed change, and review checks for this iteration." },
  ruflo: { title: "Ruflo", eyebrow: "III. Orchestrate · Coordination", description: "A hosted dependency flow with named workstreams and durable output. The local Ruflo CLI graph is not exposed from Cloud Run.", tabs: ["Command", "Flows", "Dependencies", "Reports"], primary: "Launch flow", operation: "plan", prompt: "Define the mission, workstreams, dependencies, success criteria, and approval boundary." },
};

const ROOM_MEMBERS = [
  ["OpenRouter work lane", "ready when approved", "#60a5fa"],
  ["Claude", "separate credential required", "#d4a574"],
  ["Kimi", "separate credential required", "#22d3ee"],
  ["GLM", "separate credential required", "#34d399"],
  ["Grok", "separate credential required", "#f472b6"],
  ["Sakana", "separate credential required", "#a78bfa"],
] as const;

const KANBAN_COLUMNS = ["Captured", "Assigned", "Review", "Done"] as const;

export default function ClientOrchestrationWorkspace({ surface }: { surface: ClientOrchestrationSurface }) {
  const config = CONFIG[surface];
  const [tab, setTab] = useState(config.tabs[0]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [composer, setComposer] = useState(false);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [monthlyUsage, setMonthlyUsage] = useState<UsageSummary | null>(null);

  async function load() {
    const response = await fetch(`/api/client-runtime/workflows?surface=${encodeURIComponent(surface)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) {
      setError(typeof data?.error === "string" ? data.error : "workflow_read_failed");
      return;
    }
    const next = Array.isArray(data?.workflows) ? data.workflows as Workflow[] : [];
    setWorkflows(next);
    setSelectedId((current) => current && next.some((workflow) => workflow.id === current) ? current : (next[0]?.id ?? null));
    if (surface === "paperclip") {
      const observability = await fetch("/api/client-runtime/observability", { cache: "no-store" }).catch(() => null);
      const observabilityData = await observability?.json().catch(() => null);
      if (observability?.ok && observabilityData?.monthlyUsage && typeof observabilityData.monthlyUsage === "object") setMonthlyUsage(observabilityData.monthlyUsage as UsageSummary);
      else setMonthlyUsage(null);
    } else setMonthlyUsage(null);
  }

  useEffect(() => { setTab(CONFIG[surface].tabs[0]); setComposer(false); setError(""); void load(); }, [surface]);
  useEffect(() => {
    if (!workflows.some((workflow) => ["queued", "running"].includes(String(workflow.metadata?.execution?.status ?? "")))) return;
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [workflows, surface]);

  async function createWorkflow() {
    if (!title.trim() || !goal.trim() || busy) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/client-runtime/workflows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ surface, operation: config.operation, title: title.trim(), goal: goal.trim() }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(typeof data?.error === "string" ? data.error : "workflow_queue_failed");
    else {
      setComposer(false);
      setTitle("");
      setGoal("");
      await load();
      if (typeof data?.workflowId === "string") setSelectedId(data.workflowId);
    }
    setBusy(false);
  }

  async function updateWorkflow(id: string, patch: Record<string, unknown>) {
    const response = await fetch("/api/client-runtime/workflows", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...patch }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(typeof data?.error === "string" ? data.error : "workflow_update_failed");
    else await load();
  }

  const active = workflows.filter((workflow) => workflow.status === "active");
  const done = workflows.filter((workflow) => workflow.status === "done");
  const selected = workflows.find((workflow) => workflow.id === selectedId) ?? null;
  const visible = useMemo(() => filterForTab(surface, tab, workflows), [surface, tab, workflows]);

  return <div className="space-y-5 pb-8">
    <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: "#60a5fa", borderColor: "rgba(96,165,250,0.32)", background: "rgba(96,165,250,0.12)" }}><GitBranch size={18} /></div>
        <div className="min-w-0 flex-1"><p className="eyebrow">{config.eyebrow}</p><h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{config.title}</h1><p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{config.description}</p></div>
        <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: "rgba(90,184,150,0.28)", color: "#5ab896", background: "rgba(90,184,150,0.1)" }}>Tenant workflow ledger</div>
      </div>
      <div className="mt-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--line-soft)" }}>{config.tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className="border-b-2 px-3 py-2 text-[11px] font-medium" style={{ borderColor: tab === item ? "#60a5fa" : "transparent", color: tab === item ? "#bfdbfe" : "var(--cream-mute)" }}>{item}</button>)}</div>
    </section>

    {surface === "paperclip" && <PaperclipSummary total={workflows.length} active={active.length} done={done.length} usage={monthlyUsage} />}
    {surface === "paperclip" && tab === "Cost" && <CostBreakdown usage={monthlyUsage} />}
    {surface === "room" && tab === "In the room" && <RoomPanel onCompose={() => { setComposer(true); setTitle("Room decision"); setGoal("Prepare a concise decision memo with assumptions, options, risks, and a recommended owner."); }} />}
    {(surface === "pipeline" || surface === "agent-kanban" || surface === "kanban") && (tab === "Pipeline" || tab === "Board" || tab === "Tasks") && <WorkflowBoard workflows={workflows} onSelect={setSelectedId} />}
    {surface === "loop" && tab === "Loops" && <LoopPanel active={active.length} done={done.length} onCompose={() => { setComposer(true); setTitle("Improvement loop"); setGoal("Define the target, measurable check, change, and next decision."); }} />}
    {surface === "ruflo" && (tab === "Command" || tab === "Flows") && <RufloPanel workflow={selected} />}

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
          <div className="flex items-center gap-2"><Columns3 size={14} color="#60a5fa" /><h2 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>{listTitle(surface, tab)}</h2><span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{visible.length} records</span></div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => void load()} title="Refresh workflows" className="p-1.5" style={{ color: "var(--cream-mute)" }}><RefreshCw size={13} /></button><button type="button" onClick={() => setComposer(true)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-semibold" style={{ color: "#07111d", background: "#60a5fa" }}><Play size={12} />{config.primary}</button></div>
        </div>
        {composer && <Composer title={title} goal={goal} prompt={config.prompt} busy={busy} operation={config.operation} onTitle={setTitle} onGoal={setGoal} onClose={() => setComposer(false)} onSubmit={() => void createWorkflow()} />}
        <div className="p-3">
          {visible.length ? <div className="space-y-2">{visible.map((workflow) => <WorkflowRow key={workflow.id} workflow={workflow} selected={selectedId === workflow.id} onSelect={() => setSelectedId(workflow.id)} onDone={() => void updateWorkflow(workflow.id, { status: "done" })} />)}</div> : <EmptyState surface={surface} tab={tab} onCreate={() => setComposer(true)} />}
        </div>
      </div>
      <WorkflowDetail workflow={selected} onStep={(step) => void updateWorkflow(selected?.id ?? "", { stepId: step.id, stepStatus: nextStepStatus(step.status) })} onArchive={() => selected && void updateWorkflow(selected.id, { status: "archived" })} />
    </section>
    {surface === "orchestrate" && <EccWorkflowsPanel />}
    {error && <ClientRuntimeNotice code={error} />}
  </div>;
}

function PaperclipSummary({ total, active, done, usage }: { total: number; active: number; done: number; usage: UsageSummary | null }) {
  const summary: Array<[string, string | number, string, string?]> = [
    ["Build issues", total, "#60a5fa"],
    ["Active", active, "#fbbf24"],
    ["Done", done, "#5ab896"],
    ["Provider budget usage", usage ? formatCost(usage.totalCostMicros) : "Unavailable", "#c4b5fd", usage ? `${usage.inputTokens.toLocaleString()} input / ${usage.outputTokens.toLocaleString()} output tokens` : "Observability data could not be read."],
  ];
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.map(([label, value, color, note]) => <div key={label} className="panel px-4 py-3"><p className="text-[10px] uppercase" style={{ color: "var(--cream-mute)" }}>{label}</p><p className="mt-1 text-[22px] font-semibold" style={{ color }}>{value}</p>{note && <p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>{note}</p>}</div>)}</section>;
}

function CostBreakdown({ usage }: { usage: UsageSummary | null }) {
  const providers = usage ? Object.entries(usage.byProvider) : [];
  return <section className="panel p-4 md:p-5"><div className="flex items-center gap-2"><Activity size={14} color="#c4b5fd" /><div><p className="eyebrow">Monthly reserved or settled usage</p><h2 className="mt-1 text-[15px] font-semibold" style={{ color: "var(--cream)" }}>Provider budget ledger</h2></div></div>{usage ? providers.length ? <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{providers.map(([provider, entry]) => <div key={provider} className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.02)" }}><p className="text-[12px] font-medium" style={{ color: "var(--cream)" }}>{provider}</p><p className="mt-1 text-[17px] font-semibold" style={{ color: "#c4b5fd" }}>{formatCost(entry.costMicros)}</p><p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>{entry.inputTokens.toLocaleString()} input / {entry.outputTokens.toLocaleString()} output tokens{entry.model ? ` · ${entry.model}` : ""}</p></div>)}</div> : <p className="mt-4 text-[11px]" style={{ color: "var(--cream-mute)" }}>No provider budget entries this month. Provider-free workflow planning does not create an entry.</p> : <p className="mt-4 text-[11px]" style={{ color: "var(--cream-mute)" }}>The tenant budget ledger is currently unavailable.</p>}</section>;
}

function RoomPanel({ onCompose }: { onCompose: () => void }) {
  return <section className="panel p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">In the room</p><h2 className="mt-1 text-[16px] font-semibold" style={{ color: "var(--cream)" }}>Provider lanes and their real activation state</h2></div><button type="button" onClick={onCompose} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold" style={{ background: "#a78bfa", color: "#170a29" }}><Send size={12} />Send a reviewed question</button></div><div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{ROOM_MEMBERS.map(([name, state, color]) => <div key={name} className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.02)" }}><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: color }} /><span className="text-[12px] font-medium" style={{ color: "var(--cream)" }}>{name}</span></div><p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>{state}</p></div>)}</div></section>;
}

function WorkflowBoard({ workflows, onSelect }: { workflows: Workflow[]; onSelect: (id: string) => void }) {
  const columns = KANBAN_COLUMNS.map((name, index) => ({ name, cards: workflows.filter((workflow) => boardColumn(workflow) === index) }));
  return <section className="panel overflow-x-auto p-4"><div className="grid min-w-[760px] grid-cols-4 gap-3">{columns.map(({ name, cards }) => <div key={name}><div className="mb-2 flex items-center justify-between px-1"><span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>{name}</span><span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{cards.length}</span></div><div className="min-h-[112px] space-y-2 rounded-md border p-2" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.018)" }}>{cards.map((workflow) => <button key={workflow.id} type="button" onClick={() => onSelect(workflow.id)} className="w-full rounded-md border p-2.5 text-left" style={{ borderColor: "var(--line-soft)", background: "var(--panel)" }}><p className="line-clamp-2 text-[11px] font-medium" style={{ color: "var(--cream)" }}>{workflow.title}</p><p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>{executionLabel(workflow)}</p></button>)}</div></div>)}</div></section>;
}

function LoopPanel({ active, done, onCompose }: { active: number; done: number; onCompose: () => void }) {
  return <section className="panel p-4 md:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Hosted control loop</p><h2 className="mt-1 text-[16px] font-semibold" style={{ color: "var(--cream)" }}>Target <ArrowRight size={14} className="mx-1 inline" /> Change <ArrowRight size={14} className="mx-1 inline" /> Check <ArrowRight size={14} className="mx-1 inline" /> Decision</h2><p className="mt-2 text-[11px]" style={{ color: "var(--cream-mute)" }}>The current hosted runner records each stage and preserves its evidence. Builder and judge provider calls are independently gated.</p></div><button type="button" onClick={onCompose} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold" style={{ background: "#5eead4", color: "#06251f" }}><RefreshCw size={12} />Run loop</button></div><div className="mt-4 flex gap-5 text-[11px]" style={{ color: "var(--cream-mute)" }}><span>{active} active</span><span>{done} completed</span><span>External changes require approval</span></div></section>;
}

function RufloPanel({ workflow }: { workflow: Workflow | null }) {
  const steps = workflow?.metadata?.steps ?? [{ id: "scope", title: "Scope", status: "todo" as const }, { id: "routes", title: "Routes", status: "todo" as const }, { id: "resolve", title: "Resolve", status: "todo" as const }, { id: "report", title: "Report", status: "todo" as const }];
  return <section className="panel p-4 md:p-5"><div className="flex items-center gap-2"><Network size={15} color="#d4a574" /><div><p className="eyebrow">Hosted flow map</p><h2 className="mt-1 text-[16px] font-semibold" style={{ color: "var(--cream)" }}>{workflow?.title ?? "No flow selected"}</h2></div></div><div className="mt-5 grid gap-3 md:grid-cols-4">{steps.slice(0, 4).map((step, index) => <div key={step.id} className="relative rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.02)" }}><span className="text-[10px]" style={{ color: "#d4a574" }}>WORKSTREAM {index + 1}</span><p className="mt-1 text-[12px] font-medium" style={{ color: "var(--cream)" }}>{step.title}</p><p className="mt-2 text-[10px]" style={{ color: "var(--cream-mute)" }}>{step.status.replace("_", " ")}</p></div>)}</div></section>;
}

function Composer({ title, goal, prompt, busy, operation, onTitle, onGoal, onClose, onSubmit }: { title: string; goal: string; prompt: string; busy: boolean; operation: string; onTitle: (value: string) => void; onGoal: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  return <div className="border-b p-4" style={{ borderColor: "var(--line-soft)", background: "rgba(96,165,250,0.045)" }}><div className="flex items-center justify-between gap-3"><p className="text-[11px] font-semibold" style={{ color: "#bfdbfe" }}>{operation === "dispatch" ? "Reviewed provider dispatch" : "Tenant workflow"}</p><button type="button" onClick={onClose} title="Close composer" style={{ color: "var(--cream-mute)" }}><X size={14} /></button></div><input value={title} onChange={(event) => onTitle(event.target.value)} placeholder="Name this work" className="mt-3 w-full rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.03)", borderColor: "var(--line-soft)" }} /><textarea value={goal} onChange={(event) => onGoal(event.target.value)} placeholder={prompt} className="mt-2 min-h-[106px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.03)", borderColor: "var(--line-soft)" }} /><div className="mt-3 flex items-center justify-between gap-3"><p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>Creates a durable tenant record, then queues its approved runner.</p><button type="button" disabled={busy || !title.trim() || !goal.trim()} onClick={onSubmit} className="inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold disabled:opacity-40" style={{ background: "#60a5fa", color: "#07111d" }}>{busy ? <LoaderCircle size={12} className="animate-spin" /> : <ArrowRight size={12} />}{busy ? "Queueing" : operation === "dispatch" ? "Send" : "Create"}</button></div></div>;
}

function WorkflowRow({ workflow, selected, onSelect, onDone }: { workflow: Workflow; selected: boolean; onSelect: () => void; onDone: () => void }) {
  return <div className="rounded-md border p-3" style={{ borderColor: selected ? "rgba(96,165,250,0.5)" : "var(--line-soft)", background: selected ? "rgba(96,165,250,0.06)" : "rgba(255,255,255,0.018)" }}><div className="flex gap-3"><button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left"><div className="flex items-center gap-2"><StatusDot workflow={workflow} /><p className="truncate text-[12px] font-medium" style={{ color: "var(--cream)" }}>{workflow.title}</p></div><p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>{workflow.content}</p><p className="mt-2 text-[10px]" style={{ color: "var(--cream-mute)" }}>{executionLabel(workflow)} · {formatDate(workflow.created_at)}</p></button>{workflow.status === "active" && <button type="button" onClick={onDone} title="Mark workflow done" className="self-start rounded-md border p-1.5" style={{ color: "#5ab896", borderColor: "rgba(90,184,150,0.3)" }}><CheckCircle2 size={13} /></button>}</div></div>;
}

function WorkflowDetail({ workflow, onStep, onArchive }: { workflow: Workflow | null; onStep: (step: WorkflowStep) => void; onArchive: () => void }) {
  return <aside className="panel min-h-[260px] overflow-hidden"><div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}><div className="flex items-center gap-2"><Activity size={14} color="#60a5fa" /><h2 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Workflow detail</h2></div>{workflow && <button type="button" onClick={onArchive} className="text-[10px]" style={{ color: "var(--cream-mute)" }}>Archive</button>}</div>{workflow ? <div className="p-4"><p className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{workflow.title}</p><p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>{workflow.content}</p><div className="mt-4 space-y-2">{(workflow.metadata?.steps ?? []).map((step, index) => <button key={step.id} type="button" onClick={() => onStep(step)} className="flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><span className="text-[10px]" style={{ color: "#60a5fa" }}>{index + 1}</span><span className="flex-1 text-[11px]">{step.title}</span><span className="text-[10px]" style={{ color: step.status === "done" ? "#5ab896" : "var(--cream-mute)" }}>{step.status.replace("_", " ")}</span></button>)}</div><div className="mt-4 rounded-md border p-3 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)", background: "rgba(255,255,255,0.015)" }}><ShieldCheck size={12} className="mr-1 inline" />{executionLabel(workflow)}</div></div> : <div className="grid min-h-[205px] place-items-center p-6 text-center"><div><FileText size={20} className="mx-auto" style={{ color: "var(--cream-mute)" }} /><p className="mt-2 text-[11px]" style={{ color: "var(--cream-mute)" }}>Select a tenant workflow to inspect its queue and review state.</p></div></div>}</aside>;
}

function EmptyState({ surface, tab, onCreate }: { surface: ClientOrchestrationSurface; tab: string; onCreate: () => void }) {
  return <div className="grid min-h-[220px] place-items-center p-6 text-center"><div><CircleDot size={22} className="mx-auto" style={{ color: "#60a5fa" }} /><p className="mt-3 text-[12px] font-medium" style={{ color: "var(--cream)" }}>No {tab.toLowerCase()} yet</p><p className="mt-1 max-w-sm text-[11px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>Create the first hosted {CONFIG[surface].title.toLowerCase()} workflow. It will be stored in this tenant and run through the approved queue.</p><button type="button" onClick={onCreate} className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "rgba(96,165,250,0.36)", color: "#bfdbfe" }}><Play size={12} />Create workflow</button></div></div>;
}

function filterForTab(surface: ClientOrchestrationSurface, tab: string, workflows: Workflow[]) {
  if (tab === "Done" || tab === "Completed" || tab === "Archive") return workflows.filter((workflow) => workflow.status !== "active");
  if (tab === "Active") return workflows.filter((workflow) => workflow.status === "active");
  if (surface === "paperclip" && tab === "Cost") return workflows.filter((workflow) => workflow.metadata?.execution?.provider);
  return workflows;
}

function listTitle(surface: ClientOrchestrationSurface, tab: string) {
  if (surface === "room" && tab === "In the room") return "Room dispatches";
  if (surface === "paperclip" && tab === "Build issues") return "Build issue ledger";
  return `${tab} ledger`;
}

function executionLabel(workflow: Workflow) {
  const execution = workflow.metadata?.execution;
  if (execution?.status === "succeeded") return "Queued runner completed";
  if (execution?.status === "failed") return `Runner failed${execution.errorCode ? `: ${execution.errorCode}` : ""}`;
  if (execution?.status === "running") return "Runner is working";
  if (execution?.status === "queued") return "Queued for hosted runner";
  if (execution?.status === "approval_required") return "Provider dispatch awaits approval";
  return workflow.status === "done" ? "Marked complete" : "Workflow record created";
}

function boardColumn(workflow: Workflow) {
  if (workflow.status === "done") return 3;
  const execution = workflow.metadata?.execution?.status;
  if (execution === "succeeded") return 3;
  if (execution === "running") return 2;
  if ((workflow.metadata?.steps ?? []).some((step) => step.status === "in_progress" || step.status === "done")) return 1;
  return 0;
}

function nextStepStatus(status: StepStatus): StepStatus {
  if (status === "todo") return "in_progress";
  if (status === "in_progress") return "done";
  if (status === "done") return "blocked";
  return "todo";
}

function StatusDot({ workflow }: { workflow: Workflow }) {
  const status = workflow.metadata?.execution?.status;
  const color = status === "failed" ? "#f87171" : status === "succeeded" || workflow.status === "done" ? "#5ab896" : status === "running" ? "#fbbf24" : "#60a5fa";
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown time" : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatCost(micros: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(micros / 1_000_000);
}
