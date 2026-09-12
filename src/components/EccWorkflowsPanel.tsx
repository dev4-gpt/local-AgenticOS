"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import registrations from "@/data/ecc-adapters.json";

type Revision = { id: string; content_hash: string; content: { summary: string } };
type Job = { id: string; status: string; error_code: string | null; created_at: string; output_metadata: { artifactId?: string; artifactHash?: string; artifact?: { adapterId: string; brief: string; checklist: { id: string; action: string; status: string }[]; context: { utf8Bytes: number; budgetBytes: number }; findings: { code: string; detail: string }[] }; evaluation?: { checks: { id: string; status: string }[]; runtimeMs: number; providerCostMicros: number; infrastructureCostMicros: number | null; inferenceCalls: number } } };
const button = "rounded border border-[var(--line)] px-3 py-2 text-xs disabled:opacity-40";
const departments: Record<string, string> = { engineering: "Engineering", "security-quality": "Security & Quality", research: "Research", "content-growth": "Content & Growth", "business-operations": "Business Operations", "data-infrastructure": "Data & Infrastructure" };

export default function EccWorkflowsPanel({ evaluationsOnly = false }: { evaluationsOnly?: boolean }) {
  const [jobs, setJobs] = useState<Job[]>([]); const [role, setRole] = useState(""); const [enabled, setEnabled] = useState(false); const [runtimeEnabled, setRuntimeEnabled] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]); const [selected, setSelected] = useState<string[]>([]);
  const [adapter, setAdapter] = useState(registrations.adapters[0].id); const [department, setDepartment] = useState("");
  const [brief, setBrief] = useState(""); const [evidenceRef, setEvidenceRef] = useState(""); const [evidenceSummary, setEvidenceSummary] = useState(""); const [evidenceHash, setEvidenceHash] = useState(""); const [budget, setBudget] = useState(12000);
  const pendingRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/client-runtime/ecc", { cache: "no-store" }); const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("Workflows are unavailable. Sign in to a configured tenant runtime.");
      setJobs(data.jobs); setRole(data.role); setEnabled(data.policyEnabled); setRuntimeEnabled(data.runtimeEnabled);
      if (!evaluationsOnly) {
        const lessons = await fetch("/api/client-runtime/learning?active=1", { cache: "no-store" }); const active = await lessons.json();
        if (lessons.ok && Array.isArray(active.revisions)) setRevisions(active.revisions);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Workflows could not be loaded."); }
  }, [evaluationsOnly]);
  useEffect(() => { void refresh(); }, [refresh]);
  const pending = jobs.some(job => ["queued", "running"].includes(job.status));
  useEffect(() => { if (!pending) return; const timer = setInterval(() => void refresh(), 5000); return () => clearInterval(timer); }, [pending, refresh]);
  async function changePolicy() {
    setBusy(true); setNotice("");
    try { const response = await fetch("/api/client-runtime/ecc", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !enabled }) }); if (!response.ok) throw new Error(); await refresh(); }
    catch { setNotice("Policy update failed. Owner or admin access is required."); } finally { setBusy(false); }
  }
  async function run(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const refs = evidenceRef.trim() ? [{ reference: evidenceRef.trim(), summary: evidenceSummary.trim(), sourceHash: evidenceHash.trim() }] : [];
      if (selected.some(id => !revisions.some(item => item.id === id))) throw new Error("A selected lesson is no longer active. Clear the selection and review the available lessons.");
      const payload = { input: { adapterId: adapter, brief, evidence: refs, contextBudgetBytes: budget }, learningRevisions: revisions.filter(item => selected.includes(item.id)).map(item => ({ id: item.id, contentHash: item.content_hash })) };
      const fingerprint = JSON.stringify(payload);
      if (pendingRequest.current?.fingerprint !== fingerprint) pendingRequest.current = { fingerprint, key: crypto.randomUUID() };
      const response = await fetch("/api/client-runtime/ecc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, idempotencyKey: pendingRequest.current.key }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error === "ecc_lesson_not_active" ? "A selected lesson changed or expired. Refresh and select its current revision." : `Workflow could not start: ${data.error ?? "unavailable"}`);
      pendingRequest.current = null;
      setNotice("Workflow queued. Its artifact and evaluation will appear below."); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Workflow failed."); } finally { setBusy(false); }
  }
  function download(job: Job) {
    const blob = new Blob([JSON.stringify(job.output_metadata.artifact, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${job.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section id={evaluationsOnly ? "ecc-evaluations" : "department-workflows"} className="panel mt-4 p-5 space-y-4" style={{ color: "var(--cream)" }}>
    <div><p className="eyebrow">{evaluationsOnly ? "Govern" : "Orchestrate"}</p><h2 className="text-xl">{evaluationsOnly ? "Evaluations" : "Department workflows"}</h2><p className="mt-2 text-sm opacity-70">{evaluationsOnly ? "Inspect actual artifact checks, missing evidence, context usage and measured provider cost. These checks do not replace release acceptance." : "Create bounded plans, reviews and handoffs. Workflows use the existing job and artifact systems and make no model calls."}</p></div>
    <div className="flex gap-3 flex-wrap"><button className={button} onClick={() => void refresh()} disabled={busy}>Refresh results</button>{!evaluationsOnly && ["owner", "admin"].includes(role) && <button className={button} onClick={() => void changePolicy()} disabled={busy}>{enabled ? "Disable tenant workflows & learning" : "Enable tenant workflows & learning"}</button>}</div>
    {notice && <p className="text-sm text-amber-200" role="status">{notice}</p>}
    {!evaluationsOnly && role && (!enabled || !runtimeEnabled) && <p className="text-sm opacity-70">{!runtimeEnabled ? "This runtime needs ecc-workflows and artifact capabilities enabled in its deployment configuration." : "An owner or admin must enable this tenant before workflows and automatic learning can run."}</p>}
    {!evaluationsOnly && <form onSubmit={run} className="grid gap-3">
      <div className="flex flex-wrap gap-3"><label className="text-xs">Department<select aria-label="Workflow department" value={department} onChange={e => { setDepartment(e.target.value); const first = registrations.adapters.find(item => !e.target.value || item.department === e.target.value); if (first) setAdapter(first.id); }} className="runtime-request-select block mt-1 rounded border border-[var(--line)] p-2 text-sm"><option value="">All departments</option>{Object.entries(departments).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="text-xs">Workflow<select aria-label="Department workflow" value={adapter} onChange={e => setAdapter(e.target.value)} className="runtime-request-select block mt-1 rounded border border-[var(--line)] p-2 text-sm">{registrations.adapters.filter(item => !department || item.department === department).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
      <label className="text-sm">Outcome and constraints<textarea required maxLength={8000} value={brief} onChange={e => setBrief(e.target.value)} className="block mt-1 w-full rounded border border-[var(--line)] bg-black/20 p-3 text-sm" /></label>
      <details><summary className="cursor-pointer text-sm">Evidence and context budget</summary><label className="block mt-3 text-xs">Source reference<input value={evidenceRef} onChange={e => setEvidenceRef(e.target.value)} placeholder="docs/review.md or job:record-id" required={Boolean(evidenceSummary || evidenceHash)} maxLength={200} className="block mt-1 w-full rounded border border-[var(--line)] bg-black/20 p-2 text-xs" /></label><label className="block mt-3 text-xs">Evidence summary<textarea value={evidenceSummary} onChange={e => setEvidenceSummary(e.target.value)} required={Boolean(evidenceRef || evidenceHash)} maxLength={2000} className="block mt-1 w-full rounded border border-[var(--line)] bg-black/20 p-2 text-xs" /></label><label className="block mt-3 text-xs">Source SHA-256 hash<input value={evidenceHash} onChange={e => setEvidenceHash(e.target.value)} required={Boolean(evidenceRef || evidenceSummary)} pattern="[0-9a-f]{64}" className="block mt-1 w-full rounded border border-[var(--line)] bg-black/20 p-2 text-xs" /></label><label className="block mt-3 text-xs">Context budget (UTF-8 bytes)<input type="number" min={256} max={64000} value={budget} onChange={e => setBudget(Number(e.target.value))} className="block mt-1 rounded border border-[var(--line)] bg-black/20 p-2" /></label><p className="mt-2 text-xs opacity-70">Supplied evidence stays unverified until reviewed; omitted evidence remains missing.</p></details>
      {!!selected.length && <button type="button" className={button} onClick={() => setSelected([])}>Clear selected lessons</button>}
      {!!revisions.length && <fieldset className="text-sm"><legend>Reviewed lessons to use (optional)</legend>{revisions.map(item => <label key={item.id} className="flex gap-2 mt-2"><input type="checkbox" checked={selected.includes(item.id)} onChange={e => setSelected(old => e.target.checked ? [...old, item.id] : old.filter(id => id !== item.id))} />{item.content.summary}</label>)}</fieldset>}
      <button className={`${button} justify-self-start`} disabled={busy || !enabled || !runtimeEnabled || !role || role === "viewer"}>{busy ? "Starting…" : "Create review artifact"}</button>
    </form>}
    {role && !jobs.length && <p className="text-sm opacity-70">No ECC runs yet. Evaluation evidence appears after a department workflow completes.</p>}
    <div className="grid gap-3">{jobs.map(job => <article key={job.id} className="rounded-lg border border-[var(--line-soft)] p-4 space-y-2 text-sm">
      <div className="flex justify-between gap-3"><h3>{job.output_metadata.artifact?.adapterId ?? "Department workflow"}</h3><span className="text-xs text-amber-200">{job.status}</span></div><p className="text-xs opacity-60">{new Date(job.created_at).toLocaleString()} · {job.id}</p>
      {job.error_code && <p className="text-rose-200">{job.error_code}</p>}
      {job.output_metadata.artifact && <><p>{job.output_metadata.artifact.brief}</p><ul className="list-disc pl-5">{job.output_metadata.artifact.checklist.map(item => <li key={item.id}>{item.action} <span className="text-xs opacity-60">— {item.status}</span></li>)}</ul><p className="text-xs opacity-70">Context: {job.output_metadata.artifact.context.utf8Bytes} / {job.output_metadata.artifact.context.budgetBytes} bytes</p>{job.output_metadata.artifact.findings.map(finding => <p key={finding.code} className="text-xs text-amber-200">{finding.detail}</p>)}<button className={button} onClick={() => download(job)}>Download artifact JSON</button></>}
      {job.output_metadata.evaluation && <details open={evaluationsOnly}><summary className="cursor-pointer">Verification results</summary><dl className="mt-2 grid grid-cols-2 gap-2 text-xs">{job.output_metadata.evaluation.checks.map(check => <div key={check.id}><dt className="opacity-60">{check.id}</dt><dd>{check.status}</dd></div>)}</dl><p className="mt-3 text-xs opacity-70">{job.output_metadata.evaluation.inferenceCalls} inference calls · provider cost ${(job.output_metadata.evaluation.providerCostMicros / 1e6).toFixed(2)} · local evaluation {job.output_metadata.evaluation.runtimeMs.toFixed(2)} ms · infrastructure cost {job.output_metadata.evaluation.infrastructureCostMicros === null ? "unmeasured" : `$${job.output_metadata.evaluation.infrastructureCostMicros / 1e6}`}</p><p className="mt-2 break-all text-xs opacity-50">Artifact hash: {job.output_metadata.artifactHash}</p></details>}
    </article>)}</div>
  </section>;
}
