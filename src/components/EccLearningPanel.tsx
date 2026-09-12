"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type LessonContent = { summary: string; trigger: string; action: string; evidenceReferences: string[]; sourceHashes: string[] };
type Item = { id: string; created_by: string; content: LessonContent; content_hash: string; revision: number; confidence: number; status: string; reviewed_by: string | null; retention_expires_at: string; source_job_id: string | null; source_record_id: string | null };
const inputClass = "mt-1 w-full rounded border border-[var(--line)] bg-black/20 p-2 text-sm";
const buttonClass = "rounded border border-[var(--line)] px-3 py-2 text-xs disabled:opacity-40";

export default function EccLearningPanel() {
  const [items, setItems] = useState<Item[]>([]); const [role, setRole] = useState("");
  const [userId, setUserId] = useState("");
  const proposalRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [summary, setSummary] = useState(""); const [trigger, setTrigger] = useState(""); const [action, setAction] = useState("");
  const [evidence, setEvidence] = useState(""); const [hashes, setHashes] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/client-runtime/learning", { cache: "no-store" }); const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("Learning is unavailable. Sign in to an enabled tenant runtime.");
      setItems(data.items); setRole(data.role); setUserId(data.userId);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Learning could not be loaded."); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const reset = () => { proposalRequest.current = null; setEditing(null); setSummary(""); setTrigger(""); setAction(""); setEvidence(""); setHashes(""); };
  async function mutate(method: string, body: unknown) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/client-runtime/learning", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error === "learning_review_conflict_or_forbidden" ? "This lesson changed, expired, or cannot be approved. Refresh and review its current content." : "The lesson could not be saved. Check your role, evidence references and content.");
      reset(); await refresh(); setNotice("Saved. Only exact reviewed revisions can be selected for a workflow.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Learning update failed."); }
    finally { setBusy(false); }
  }
  async function propose(event: FormEvent) {
    event.preventDefault();
    const content = { summary, trigger, action, evidenceReferences: evidence.split("\n").map(x => x.trim()).filter(Boolean), sourceHashes: hashes.split("\n").map(x => x.trim()).filter(Boolean) };
    const fingerprint = JSON.stringify(content);
    if (proposalRequest.current?.fingerprint !== fingerprint) proposalRequest.current = { fingerprint, key: crypto.randomUUID() };
    await mutate(editing ? "PATCH" : "POST", editing ? { action: "edit", id: editing.id, expectedHash: editing.content_hash, content } : { content, idempotencyKey: proposalRequest.current.key, confidence: 0 });
  }
  const manager = role === "owner" || role === "admin";
  return <section className="panel mt-4 p-5 space-y-4" aria-labelledby="learning-title" style={{ color: "var(--cream)" }}>
    <div><p className="eyebrow">Context</p><h2 id="learning-title" className="text-xl">Learning</h2><p className="mt-2 text-sm opacity-70">Review lessons and instincts from this tenant. Job outcomes become proposals; confidence never replaces approval.</p></div>
    <button className={buttonClass} onClick={() => void refresh()} disabled={busy}>Refresh lessons</button>
    {notice && <p role="status" className="text-sm text-amber-200">{notice}</p>}
    {role && role !== "viewer" && <details open={editing ? true : undefined}><summary className="cursor-pointer text-sm">{editing ? "Edit lesson — approval will be invalidated" : "Propose a lesson"}</summary>
      <form className="mt-4 grid gap-3" onSubmit={propose}>
        <label className="text-sm">Sanitized summary<textarea required maxLength={2000} value={summary} onChange={e => setSummary(e.target.value)} className={inputClass} /></label>
        <label className="text-sm">When to use it<input required maxLength={2000} value={trigger} onChange={e => setTrigger(e.target.value)} className={inputClass} /></label>
        <label className="text-sm">Proposed action<textarea required maxLength={2000} value={action} onChange={e => setAction(e.target.value)} className={inputClass} /></label>
        <label className="text-sm">Evidence references, one per line<textarea required value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="job:record-id or docs/review.md" className={inputClass} /></label>
        <label className="text-sm">Source SHA-256 hashes, one per line<textarea required value={hashes} onChange={e => setHashes(e.target.value)} className={inputClass} /></label>
        <p className="text-xs opacity-70">Use summaries and references. Keep transcripts, credentials and personal data out of lessons.</p>
        <div className="flex gap-2"><button className={buttonClass} disabled={busy}>Save proposed lesson</button>{editing && <button type="button" className={buttonClass} onClick={reset}>Cancel edit</button>}</div>
      </form>
    </details>}
    {role && !items.length && <p className="text-sm opacity-70">No learning items yet. Propose a lesson or complete a workflow after the tenant enables learning.</p>}
    <div className="grid gap-3">{items.map(item => <article key={item.id} className="rounded-lg border border-[var(--line-soft)] p-4 space-y-2">
      <div className="flex justify-between gap-3"><h3 className="font-medium text-sm">{item.content.summary}</h3><span className="text-xs text-amber-200">{Date.parse(item.retention_expires_at) <= Date.now() ? "expired" : item.status}</span></div>
      <p className="text-sm"><b>Trigger:</b> {item.content.trigger}</p><p className="text-sm"><b>Action:</b> {item.content.action}</p>
      <details className="text-xs opacity-80"><summary className="cursor-pointer">Evidence, review and lineage</summary><div className="mt-2 space-y-1 break-all"><p>Revision {item.revision} · confidence {Number(item.confidence).toFixed(2)}</p><p>Content hash: {item.content_hash}</p><p>References: {item.content.evidenceReferences.join(", ")}</p><p>Source hashes: {item.content.sourceHashes.join(", ")}</p><p>Reviewer: {item.reviewed_by ?? "Not reviewed"}</p><p>Retained until: {new Date(item.retention_expires_at).toLocaleString()}</p><p>Source: {item.source_job_id ?? item.source_record_id ?? "Manual proposal"}</p></div></details>
      <div className="flex flex-wrap gap-2">
        {manager && item.status === "proposed" && <><button disabled={busy} className={buttonClass} onClick={() => void mutate("PATCH", { action: "review", decision: "approve", id: item.id, expectedHash: item.content_hash })}>Approve this exact content</button><button disabled={busy} className={buttonClass} onClick={() => void mutate("PATCH", { action: "review", decision: "reject", id: item.id, expectedHash: item.content_hash })}>Reject</button></>}
        {manager && item.status !== "revoked" && <button disabled={busy} className={buttonClass} onClick={() => void mutate("PATCH", { action: "revoke", id: item.id, expectedHash: item.content_hash })}>Revoke</button>}
        {(manager || (role === "member" && item.created_by === userId)) && <button disabled={busy} className={buttonClass} onClick={() => { setEditing(item); setSummary(item.content.summary); setTrigger(item.content.trigger); setAction(item.content.action); setEvidence(item.content.evidenceReferences.join("\n")); setHashes(item.content.sourceHashes.join("\n")); }}>Edit as proposal</button>}
      </div>
    </article>)}</div>
  </section>;
}
