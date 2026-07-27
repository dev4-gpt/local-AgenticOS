"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Check, FileText, LockKeyhole, Plus, Save, Trash2 } from "lucide-react";

type Surface = "memory" | "journal" | "goals" | "notebook";
type RecordItem = { id: string; title: string; content: string; status: "active" | "done" | "archived"; metadata?: Record<string, unknown>; created_at: string };

const COPY: Record<Surface, { title: string; eyebrow: string; kind: string; placeholder: string; content: string }> = {
  memory: { title: "Tenant Memory", eyebrow: "Context · Memory", kind: "memory", placeholder: "Name this decision or memory", content: "Write the approved project memory here..." },
  journal: { title: "Tenant Journal", eyebrow: "Context · Journal", kind: "journal", placeholder: "Name this journal entry", content: "What happened, changed, or needs attention?" },
  goals: { title: "Tenant Goals", eyebrow: "Command · Goals", kind: "goal", placeholder: "Name the goal", content: "Describe the outcome and next step..." },
  notebook: { title: "Tenant Notebook", eyebrow: "Context · Notebook", kind: "notebook", placeholder: "Name this notebook note", content: "Add source notes or a research brief..." },
};

export default function ClientDataWorkspace({ surface }: { surface: Surface }) {
  const copy = COPY[surface];
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch(`/api/client-runtime/records?kind=${copy.kind}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setRecords(Array.isArray(data?.records) ? data.records : []);
    if (!response?.ok && data?.error === "capability_not_enabled") setError("Tenant data is not enabled in this client manifest yet.");
  }
  useEffect(() => { void load(); }, [copy.kind]);

  async function add() {
    if (!title.trim() || !content.trim() || busy) return;
    setBusy(true); setError("");
    const response = await fetch("/api/client-runtime/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: copy.kind, title, content }) }).catch(() => null);
    if (!response?.ok) setError((await response?.json().catch(() => null))?.error || "The tenant record could not be saved.");
    else { setTitle(""); setContent(""); await load(); }
    setBusy(false);
  }

  async function update(id: string, status: RecordItem["status"]) {
    await fetch("/api/client-runtime/records", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/client-runtime/records?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  const active = useMemo(() => records.filter((record) => record.status !== "archived"), [records]);
  return <div className="space-y-5">
    <section className="panel p-5 md:p-6">
      <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.28)", color: "#60a5fa" }}><LockKeyhole size={18} /></div><div><p className="eyebrow">{copy.eyebrow}</p><h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{copy.title}</h1><p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>This client edition stores records in the current tenant namespace with Supabase RLS. It does not read the operator vault or local filesystem.</p></div></div>
    </section>
    <section className="panel p-5 md:p-6">
      <div className="flex items-center gap-2"><Plus size={15} color="#60a5fa" /><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Add tenant record</h2></div>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy.placeholder} className="mt-4 w-full rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} />
      <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={copy.content} className="mt-3 min-h-[130px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} />
      <div className="mt-4 flex items-center gap-3"><button type="button" onClick={add} disabled={busy || !title.trim() || !content.trim()} className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold" style={{ background: busy ? "rgba(255,255,255,0.1)" : "#60a5fa", color: busy ? "var(--cream-mute)" : "#07111d" }}><Save size={13} />{busy ? "Saving" : "Save to tenant"}</button><span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>No secrets or credentials should be entered here.</span></div>
      {error && <p className="mt-3 text-[11px]" style={{ color: "#fda4af" }}>{error}</p>}
    </section>
    <section className="space-y-3">
      {active.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>No tenant records yet.</div>}
      {active.map((record) => <article key={record.id} className="panel p-4"><div className="flex items-start gap-3"><FileText size={15} color="#60a5fa" className="mt-0.5" /><div className="min-w-0 flex-1"><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{record.title}</h2><p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{record.content}</p><p className="mt-3 text-[10px]" style={{ color: "var(--cream-mute)" }}>{new Date(record.created_at).toLocaleString()} · {record.status}</p></div><div className="flex items-center gap-1"><button type="button" title={record.status === "done" ? "Mark active" : "Mark done"} onClick={() => update(record.id, record.status === "done" ? "active" : "done")} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: record.status === "done" ? "#34d399" : "var(--cream-mute)" }}><Check size={13} /></button><button type="button" title="Archive" onClick={() => update(record.id, "archived")} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}><Archive size={13} /></button><button type="button" title="Delete" onClick={() => remove(record.id)} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "#fda4af" }}><Trash2 size={13} /></button></div></div></article>)}
    </section>
  </div>;
}
