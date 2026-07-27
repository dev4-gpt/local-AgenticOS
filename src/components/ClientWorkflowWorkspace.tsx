"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Check, GitBranch, LockKeyhole, Plus, Trash2 } from "lucide-react";

type Surface = "orchestrate" | "paperclip" | "room" | "pipeline" | "agent-kanban" | "kanban" | "loop" | "ruflo";
type Step = { id: string; title: string; status: "todo" | "in_progress" | "done" | "blocked" };
type Workflow = { id: string; title: string; content: string; status: "active" | "done" | "archived"; metadata?: { operation?: string; steps?: Step[] }; created_at: string };

const COPY: Record<Surface, { title: string; eyebrow: string }> = {
  orchestrate: { title: "Workflow Board", eyebrow: "Orchestrate · Tenant workflow" },
  paperclip: { title: "Paperclip Workspace", eyebrow: "Orchestrate · Work ownership" },
  room: { title: "AI Agent Mastermind", eyebrow: "Orchestrate · Coordination" },
  pipeline: { title: "Pipeline", eyebrow: "Orchestrate · Delivery flow" },
  "agent-kanban": { title: "Agent Kanban", eyebrow: "Orchestrate · Work items" },
  kanban: { title: "Kanban", eyebrow: "Orchestrate · Work items" },
  loop: { title: "Loop Engineering", eyebrow: "Orchestrate · Iterations" },
  ruflo: { title: "Ruflo", eyebrow: "Orchestrate · Coordination" },
};

export default function ClientWorkflowWorkspace({ surface }: { surface: Surface }) {
  const copy = COPY[surface];
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [operation, setOperation] = useState("plan");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch(`/api/client-runtime/workflows?surface=${encodeURIComponent(surface)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setWorkflows(Array.isArray(data?.workflows) ? data.workflows : []);
    if (!response?.ok && data?.error === "capability_not_enabled") setError("Tenant workflow management is not enabled in this client manifest yet.");
  }
  useEffect(() => { void load(); }, [surface]);

  async function createWorkflow() {
    if (!title.trim() || !goal.trim() || busy) return;
    setBusy(true); setError("");
    const response = await fetch("/api/client-runtime/workflows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ surface, operation, title, goal }) }).catch(() => null);
    if (!response?.ok) setError((await response?.json().catch(() => null))?.error || "The workflow could not be saved.");
    else { setTitle(""); setGoal(""); await load(); }
    setBusy(false);
  }

  async function updateStep(id: string, step: Step) {
    const nextStatus = step.status === "todo" ? "in_progress" : step.status === "in_progress" ? "done" : "todo";
    await fetch("/api/client-runtime/workflows", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, stepId: step.id, stepStatus: nextStatus }) });
    await load();
  }

  async function updateStatus(id: string, status: "done" | "archived") {
    await fetch("/api/client-runtime/workflows", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/client-runtime/workflows?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  const active = useMemo(() => workflows.filter((item) => item.status !== "archived"), [workflows]);
  return <div className="space-y-5">
    <section className="panel p-5 md:p-6"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(90,184,150,0.12)", border: "1px solid rgba(90,184,150,0.28)", color: "#5ab896" }}><LockKeyhole size={18} /></div><div><p className="eyebrow">{copy.eyebrow}</p><h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{copy.title}</h1><p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>This hosted workspace stores tenant-owned work state and review steps in Supabase. It does not execute a local agent, read the operator vault, or expose shell access.</p></div></div></section>
    <section className="panel p-5 md:p-6"><div className="flex items-center gap-2"><Plus size={15} color="#5ab896" /><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Create a workflow</h2></div><div className="mt-4 grid gap-3 md:grid-cols-[1fr_170px]"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Name this workflow" className="rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} /><select value={operation} onChange={(event) => setOperation(event.target.value)} className="runtime-request-select rounded-md border px-3 py-2.5 text-[12px]" style={{ borderColor: "var(--line-soft)" }}><option value="plan">Plan project</option><option value="review">Review workflow</option><option value="build">Build and review</option><option value="iterate">Run an iteration</option><option value="dispatch">Run approved provider job</option></select></div><textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Describe the outcome and constraints" className="mt-3 min-h-[110px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} /><button type="button" onClick={createWorkflow} disabled={busy || !title.trim() || !goal.trim()} className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold" style={{ background: busy ? "rgba(255,255,255,0.1)" : "#5ab896", color: busy ? "var(--cream-mute)" : "#07111d" }}><GitBranch size={13} />{busy ? "Saving" : operation === "dispatch" ? "Queue approved job" : "Save workflow"}</button>{error && <p className="mt-3 text-[11px]" style={{ color: "#fda4af" }}>{error}</p>}</section>
    <section className="space-y-3">{active.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>No tenant workflows yet.</div>}{active.map((workflow) => <article key={workflow.id} className="panel p-4"><div className="flex items-start gap-3"><GitBranch size={15} color="#5ab896" className="mt-0.5" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{workflow.title}</h2><p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{workflow.content}</p></div><span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: workflow.status === "done" ? "#34d399" : "var(--cream-mute)" }}>{workflow.status}</span></div><div className="mt-4 space-y-2">{(workflow.metadata?.steps ?? []).map((step) => <button key={step.id} type="button" onClick={() => updateStep(workflow.id, step)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Check size={13} color={step.status === "done" ? "#34d399" : step.status === "in_progress" ? "#fbbf24" : "var(--cream-mute)"} />{step.title}<span className="ml-auto text-[9px] uppercase" style={{ color: "var(--cream-mute)" }}>{step.status}</span></button>)}</div><div className="mt-4 flex items-center gap-2"><button type="button" title="Mark workflow done" onClick={() => updateStatus(workflow.id, "done")} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "#34d399" }}><Check size={13} /></button><button type="button" title="Archive workflow" onClick={() => updateStatus(workflow.id, "archived")} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}><Archive size={13} /></button><button type="button" title="Delete workflow" onClick={() => remove(workflow.id)} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "#fda4af" }}><Trash2 size={13} /></button><span className="ml-2 text-[10px]" style={{ color: "var(--cream-mute)" }}>{new Date(workflow.created_at).toLocaleString()}</span></div></div></div></article>)}</section>
  </div>;
}
