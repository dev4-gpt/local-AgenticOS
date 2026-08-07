"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Check, GitBranch, LockKeyhole, Plus, RotateCcw, Trash2 } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";

type Surface = "orchestrate" | "paperclip" | "room" | "pipeline" | "agent-kanban" | "kanban" | "loop" | "ruflo";
type Step = { id: string; title: string; status: "todo" | "in_progress" | "done" | "blocked" };
type Execution = { status?: string; jobId?: string; provider?: string; model?: string; errorCode?: string; adapter?: string; mode?: string; completedSteps?: number };
type Workflow = { id: string; title: string; content: string; status: "active" | "done" | "archived"; metadata?: { operation?: string; steps?: Step[]; execution?: Execution }; created_at: string };

const WORKFLOW_VISIBLE_ERROR_CODES = ["runtime_rate_limited", "runtime_limit_unavailable", "capability_not_enabled"];

const COPY: Record<Surface, { title: string; eyebrow: string; description: string; tabs: string[]; lanes: string[] }> = {
  orchestrate: { title: "Orchestration Control", eyebrow: "III. Orchestrate · Tenant workflow", description: "Shape a request into a governed work plan, then inspect its queue, handoffs, and approval evidence.", tabs: ["Overview", "Workflows", "Queue", "Evidence"], lanes: ["Intake", "Plan", "Review", "Approved"] },
  paperclip: { title: "Paperclip", eyebrow: "III. Orchestrate · Work ownership", description: "A hosted issue and build ledger. The local Paperclip app is not embedded; tenant work, artifacts, and delivery ownership are represented here.", tabs: ["Builds", "Issues", "Active", "Done", "Org", "Costs"], lanes: ["Captured", "Assigned", "Review", "Shipped"] },
  room: { title: "AI Agent Mastermind", eyebrow: "III. Orchestrate · Coordination", description: "Coordinate reviewed workstreams in a tenant room. Provider calls occur only through approved queued adapters.", tabs: ["Room", "Agenda", "Decisions", "Handoffs"], lanes: ["Brief", "Perspectives", "Decision", "Owner"] },
  pipeline: { title: "Pipeline", eyebrow: "III. Orchestrate · Delivery flow", description: "Move a captured idea through classification, human review, execution, and a tenant-owned artifact trail.", tabs: ["Board", "Capture", "Review", "Gallery"], lanes: ["Capture", "Human gate", "Execute", "Filed"] },
  "agent-kanban": { title: "Agent Kanban", eyebrow: "III. Orchestrate · Work items", description: "A managed board for scoped agent tasks, workspace artifacts, and the reviewer checkpoint.", tabs: ["Board", "Team", "Workspace", "Activity"], lanes: ["Backlog", "Building", "Review", "Done"] },
  kanban: { title: "Kanban", eyebrow: "III. Orchestrate · Work items", description: "A tenant work board with explicit ownership, review, and completion states.", tabs: ["Boards", "Tasks", "Assignees", "Archive"], lanes: ["Queued", "In progress", "Review", "Complete"] },
  loop: { title: "Loop Engineering", eyebrow: "III. Orchestrate · Iterations", description: "Run bounded improvement loops and retain the evidence behind each next-step decision.", tabs: ["Loops", "Hypotheses", "Checks", "History"], lanes: ["Target", "Change", "Check", "Decision"] },
  ruflo: { title: "Ruflo", eyebrow: "III. Orchestrate · Coordination", description: "Coordinate a multi-workstream plan with dependencies, human gates, and durable hosted records.", tabs: ["Command", "Flows", "Dependencies", "Reports"], lanes: ["Scope", "Routes", "Resolve", "Report"] },
};

export default function ClientWorkflowWorkspace({ surface }: { surface: Surface }) {
  const copy = COPY[surface];
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [operation, setOperation] = useState("plan");
  const [tab, setTab] = useState(copy.tabs[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch(`/api/client-runtime/workflows?surface=${encodeURIComponent(surface)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setWorkflows(Array.isArray(data?.workflows) ? data.workflows : []);
    if (!response?.ok) {
      const code = typeof data?.error === "string" && WORKFLOW_VISIBLE_ERROR_CODES.includes(data.error) ? data.error : data?.error;
      setError(code || "workflow_read_failed");
    }
  }

  useEffect(() => { void load(); }, [surface]);
  useEffect(() => {
    if (!workflows.some((item) => item.metadata?.execution?.status === "queued")) return;
    const timer = window.setInterval(() => { void load(); }, 10000);
    return () => window.clearInterval(timer);
  }, [workflows, surface]);

  async function createWorkflow() {
    if (!title.trim() || !goal.trim() || busy) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/client-runtime/workflows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ surface, operation, title, goal }),
    }).catch(() => null);
    if (!response?.ok) {
      const data = await response?.json().catch(() => null);
      setError(data?.error || "workflow_save_failed");
    } else {
      setTitle("");
      setGoal("");
      await load();
    }
    setBusy(false);
  }

  async function updateStep(id: string, step: Step) {
    const nextStatus = step.status === "todo" ? "in_progress" : step.status === "in_progress" ? "done" : "todo";
    await fetch("/api/client-runtime/workflows", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, stepId: step.id, stepStatus: nextStatus }),
    });
    await load();
  }

  async function updateStatus(id: string, status: "done" | "archived") {
    await fetch("/api/client-runtime/workflows", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await load();
  }

  async function retryExecution(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/client-runtime/workflows", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action: "retry_execution" }),
    }).catch(() => null);
    if (!response?.ok) {
      const data = await response?.json().catch(() => null);
      setError(data?.error || "workflow_retry_failed");
    } else {
      await load();
    }
    setBusy(false);
  }

  async function remove(id: string) {
    await fetch(`/api/client-runtime/workflows?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  const active = useMemo(() => workflows.filter((item) => item.status !== "archived"), [workflows]);
  const submitLabel = operation === "dispatch" ? "Queue approved job" : operation === "handoff" ? "Request handoff" : "Save workflow";

  return (
    <div className="space-y-5 pb-8">
      <section className="panel overflow-hidden p-0">
        <div className="p-5 md:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(90,184,150,0.12)", border: "1px solid rgba(90,184,150,0.28)", color: "#5ab896" }}>
            <LockKeyhole size={18} />
          </div>
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{copy.title}</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
              {copy.description}
            </p>
          </div>
        </div>
        </div>
        <div className="flex overflow-x-auto border-t px-4" style={{ borderColor: "var(--line-soft)" }}>{copy.tabs.map((item) => <button key={item} onClick={() => setTab(item)} className="shrink-0 border-b-2 px-3 py-3 text-[11px] font-semibold" style={{ color: item === tab ? "#5ab896" : "var(--cream-mute)", borderColor: item === tab ? "#5ab896" : "transparent" }}>{item}</button>)}</div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">{copy.lanes.map((lane, index) => <div key={lane} className="panel p-3" style={{ borderTop: `2px solid ${index === 2 ? "#fbbf24" : "#5ab896"}` }}><div className="flex items-center gap-2"><span className="text-[10px]" style={{ color: "#5ab896" }}>0{index + 1}</span><span className="text-[11px] font-semibold" style={{ color: "var(--cream)" }}>{lane}</span></div><p className="mt-3 text-[10px]" style={{ color: "var(--cream-mute)" }}>{tab === "Overview" ? "Tenant-scoped work state" : `${tab} lane ready for reviewed work`}</p></div>)}</section>

      <section className="panel p-5 md:p-6">
        <div className="flex items-center gap-2"><Plus size={15} color="#5ab896" /><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{surface === "paperclip" ? "Open hosted issue" : surface === "room" ? "Set room agenda" : surface === "pipeline" ? "Capture pipeline item" : surface === "loop" ? "Start a bounded loop" : "Create a workflow"}</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Name this workflow" className="rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} />
          <select value={operation} onChange={(event) => setOperation(event.target.value)} className="runtime-request-select rounded-md border px-3 py-2.5 text-[12px]" style={{ borderColor: "var(--line-soft)" }}>
            <option value="plan">Plan project</option>
            <option value="review">Review workflow</option>
            <option value="build">Build and review</option>
            <option value="iterate">Run an iteration</option>
            <option value="dispatch">Run approved provider job</option>
            <option value="handoff">Request approved handoff</option>
          </select>
        </div>
        <textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Describe the outcome and constraints" className="mt-3 min-h-[110px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} />
        <button type="button" onClick={createWorkflow} disabled={busy || !title.trim() || !goal.trim()} className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold" style={{ background: busy ? "rgba(255,255,255,0.1)" : "#5ab896", color: busy ? "var(--cream-mute)" : "#07111d" }}>
          <GitBranch size={13} />{busy ? "Saving" : submitLabel}
        </button>
        {error && <ClientRuntimeNotice code={error} />}
      </section>

      <section className="space-y-3">
        {active.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>No tenant workflows yet.</div>}
        {active.map((workflow) => (
          <article key={workflow.id} className="panel p-4">
            <div className="flex items-start gap-3">
              <GitBranch size={15} color="#5ab896" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{workflow.title}</h2>
                    <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{workflow.content}</p>
                  </div>
                  <span className="rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em]" style={{ color: workflow.status === "done" ? "#047857" : "var(--cream-mute)", background: workflow.status === "done" ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)", borderColor: workflow.status === "done" ? "rgba(4,120,87,0.28)" : "var(--line-soft)" }}>{workflow.status}</span>
                </div>
                {workflow.metadata?.execution && <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: workflow.metadata.execution.status === "failed" ? "rgba(153,27,27,0.32)" : workflow.metadata.execution.status === "completed" ? "rgba(4,120,87,0.28)" : "rgba(146,64,14,0.3)", background: workflow.metadata.execution.status === "failed" ? "rgba(248,113,113,0.14)" : workflow.metadata.execution.status === "completed" ? "rgba(16,185,129,0.12)" : "rgba(251,191,36,0.16)", color: workflow.metadata.execution.status === "failed" ? "#991b1b" : workflow.metadata.execution.status === "completed" ? "#047857" : "#92400e" }}><span className="uppercase tracking-[0.12em]">Execution: {workflow.metadata.execution.status}</span>{workflow.metadata.execution.adapter && <span>{workflow.metadata.execution.adapter}{workflow.metadata.execution.mode ? ` · ${workflow.metadata.execution.mode}` : ""}</span>}{typeof workflow.metadata.execution.completedSteps === "number" && <span>{workflow.metadata.execution.completedSteps} steps</span>}{workflow.metadata.execution.provider && <span>{workflow.metadata.execution.provider}{workflow.metadata.execution.model ? ` / ${workflow.metadata.execution.model}` : ""}</span>}</div>}
                {workflow.metadata?.execution?.status === "failed" && workflow.metadata.execution.errorCode && <ClientRuntimeNotice code={workflow.metadata.execution.errorCode} />}
                <div className="mt-4 space-y-2">{(workflow.metadata?.steps ?? []).map((step) => <button key={step.id} type="button" onClick={() => updateStep(workflow.id, step)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Check size={13} color={step.status === "done" ? "#34d399" : step.status === "in_progress" ? "#fbbf24" : "var(--cream-mute)"} />{step.title}<span className="ml-auto text-[9px] uppercase" style={{ color: "var(--cream-mute)" }}>{step.status}</span></button>)}</div>
                <div className="mt-4 flex items-center gap-2">{workflow.metadata?.execution?.status === "failed" && workflow.metadata.operation !== "dispatch" && <button type="button" title="Retry workflow execution" onClick={() => retryExecution(workflow.id)} disabled={busy} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "#fbbf24" }}><RotateCcw size={13} /></button>}<button type="button" title="Mark workflow done" onClick={() => updateStatus(workflow.id, "done")} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "#34d399" }}><Check size={13} /></button><button type="button" title="Archive workflow" onClick={() => updateStatus(workflow.id, "archived")} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}><Archive size={13} /></button><button type="button" title="Delete workflow" onClick={() => remove(workflow.id)} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "#fda4af" }}><Trash2 size={13} /></button><span className="ml-2 text-[10px]" style={{ color: "var(--cream-mute)" }}>{new Date(workflow.created_at).toLocaleString()}</span></div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
