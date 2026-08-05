"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Check, Download, FileText, LockKeyhole, Network, Plus, RefreshCw, Save, Tag, Trash2, Upload } from "lucide-react";
import ClientMemoryGraph3D, { type ClientGraphEdge, type ClientGraphNode } from "@/components/ClientMemoryGraph3D";

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
  const [importing, setImporting] = useState(false);
  const [graphNodes, setGraphNodes] = useState<ClientGraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<ClientGraphEdge[]>([]);
  const [graphBusy, setGraphBusy] = useState(false);
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const response = await fetch(`/api/client-runtime/records?kind=${copy.kind}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setRecords(Array.isArray(data?.records) ? data.records : []);
    if (!response?.ok && data?.error === "capability_not_enabled") setError("Tenant data is not enabled in this client manifest yet.");
  }
  useEffect(() => { void load(); }, [copy.kind]);

  async function loadGraph() {
    if (surface !== "memory") return;
    const response = await fetch("/api/client-runtime/memory-graph", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok) {
      setGraphNodes(Array.isArray(data?.nodes) ? data.nodes : []);
      setGraphEdges(Array.isArray(data?.edges) ? data.edges : []);
    }
  }
  useEffect(() => { void loadGraph(); }, [surface]);

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

  async function importMarkdown(file: File | undefined) {
    if (!file || surface !== "memory" || importing) return;
    const fileName = file.name.trim();
    if (!/\.(?:md|markdown|txt)$/i.test(fileName) || file.size < 1 || file.size > 100_000) {
      setError("Choose a Markdown or text file smaller than 100 KB.");
      return;
    }
    setImporting(true); setError("");
    try {
      const content = (await file.text()).replace(/\r\n?/g, "\n").trim();
      if (!content || content.length > 30_000) throw new Error("The file must contain no more than 30,000 characters.");
      const contentType = /\.txt$/i.test(fileName) ? "text/plain" : "text/markdown";
      const upload = await fetch("/api/client-runtime/artifacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName, contentType, byteSize: file.size }),
      });
      const uploadData = await upload.json().catch(() => null);
      if (!upload.ok || !uploadData?.artifactId || !uploadData?.uploadUrl) throw new Error(uploadData?.error || "The source file could not be prepared.");
      const written = await fetch(uploadData.uploadUrl, { method: "PUT", headers: uploadData.uploadHeaders ?? { "content-type": contentType }, body: file });
      if (!written.ok) throw new Error("The source file could not be stored.");
      const completed = await fetch(`/api/client-runtime/artifacts/${uploadData.artifactId}/complete`, { method: "POST" });
      const completedData = await completed.json().catch(() => null);
      if (!completed.ok) throw new Error(completedData?.error || "The source file could not be verified.");
      const imported = await fetch("/api/client-runtime/memory-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName, content, artifactId: uploadData.artifactId }),
      });
      const importedData = await imported.json().catch(() => null);
      if (!imported.ok) throw new Error(importedData?.error || "The memory source could not be imported.");
      await load(); await loadGraph();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "The memory source could not be imported.");
    } finally {
      setImporting(false);
    }
  }

  function exportMemory() {
    window.location.assign("/api/client-runtime/memory-import?format=markdown");
  }

  async function refreshGraph() {
    if (surface !== "memory" || graphBusy) return;
    setGraphBusy(true); setError("");
    const response = await fetch("/api/client-runtime/memory-graph", { method: "POST" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(data?.error || "The knowledge graph could not be refreshed.");
    else await loadGraph();
    setGraphBusy(false);
  }

  const active = useMemo(() => records.filter((record) => record.status !== "archived"), [records]);
  const selectedGraphNode = useMemo(() => graphNodes.find((node) => node.id === selectedGraphNodeId) ?? null, [graphNodes, selectedGraphNodeId]);
  const selectedRecord = useMemo(() => selectedGraphNode?.kind === "document" ? active.find((record) => record.id === selectedGraphNode.record_id) ?? null : null, [active, selectedGraphNode]);
  const visibleRecords = useMemo(() => {
    if (!selectedGraphNode) return active;
    if (selectedGraphNode.kind === "document") return active.filter((record) => record.id === selectedGraphNode.record_id);
    const tag = selectedGraphNode.label.replace(/^#/, "").toLowerCase();
    return active.filter((record) => `${record.title}\n${record.content}`.toLowerCase().includes(`#${tag}`));
  }, [active, selectedGraphNode]);
  function selectGraphNode(nodeId: string) {
    setSelectedGraphNodeId((current) => current === nodeId ? null : nodeId);
  }

  return <div className="space-y-5">
    <section className="panel p-5 md:p-6">
      <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.28)", color: "#60a5fa" }}><LockKeyhole size={18} /></div><div><p className="eyebrow">{copy.eyebrow}</p><h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{copy.title}</h1><p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>This client edition stores records in the current tenant namespace with Supabase RLS. It does not read the operator vault or local filesystem.</p></div></div>
      {surface === "memory" && <div className="mt-5 flex flex-wrap gap-2"><input ref={fileInputRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void importMarkdown(file); }} /><button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Upload size={13} />{importing ? "Importing source" : "Import Markdown"}</button><button type="button" onClick={exportMemory} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Download size={13} />Export Markdown</button></div>}
    </section>
    <section className="panel p-5 md:p-6">
      <div className="flex items-center gap-2"><Plus size={15} color="#60a5fa" /><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Add tenant record</h2></div>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy.placeholder} className="mt-4 w-full rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} />
      <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={copy.content} className="mt-3 min-h-[130px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} />
      <div className="mt-4 flex items-center gap-3"><button type="button" onClick={add} disabled={busy || !title.trim() || !content.trim()} className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold" style={{ background: busy ? "rgba(255,255,255,0.1)" : "#60a5fa", color: busy ? "var(--cream-mute)" : "#07111d" }}><Save size={13} />{busy ? "Saving" : "Save to tenant"}</button><span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>No secrets or credentials should be entered here.</span></div>
      {error && <p className="mt-3 text-[11px]" style={{ color: "#fda4af" }}>{error}</p>}
    </section>
    {surface === "memory" && <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Network size={16} color="var(--gold-deep)" /><h2 className="text-[15px] font-semibold" style={{ color: "var(--cream)" }}>Knowledge map</h2><span className="rounded-md px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--cream-soft)", background: "rgba(179,128,63,0.14)" }}>{graphEdges.length} relationships · {graphNodes.length} nodes</span></div>
        <div className="flex items-center gap-2"><button type="button" onClick={refreshGraph} disabled={graphBusy} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px] font-semibold" style={{ borderColor: "rgba(179,128,63,0.42)", color: "var(--gold-deep)", background: "rgba(179,128,63,0.08)" }}><RefreshCw size={13} className={graphBusy ? "animate-spin" : ""} />{graphBusy ? "Refreshing" : "Refresh map"}</button></div>
      </div>
      {graphNodes.length > 0 ? <>
        <ClientMemoryGraph3D nodes={graphNodes} edges={graphEdges} selectedNodeId={selectedGraphNodeId} onSelectNode={selectGraphNode} onClearSelection={() => setSelectedGraphNodeId(null)} />
        {selectedGraphNode && <div className="mt-4 rounded-md border p-4" style={{ borderColor: selectedGraphNode.kind === "document" ? "rgba(47,143,107,0.42)" : "rgba(176,74,104,0.42)", background: selectedGraphNode.kind === "document" ? "rgba(47,143,107,0.08)" : "rgba(176,74,104,0.08)" }}>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase" style={{ color: selectedGraphNode.kind === "document" ? "var(--emerald-dim)" : "var(--plum)" }}>{selectedGraphNode.kind === "document" ? <FileText size={13} /> : <Tag size={13} />}{selectedGraphNode.kind === "document" ? "Selected memory" : "Selected tag"}</div>
          {selectedRecord ? <><h3 className="mt-2 text-[15px]" style={{ color: "var(--cream)" }}>{selectedRecord.title}</h3><p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: "var(--cream-soft)" }}>{selectedRecord.content}</p></> : <><h3 className="mt-2 text-[15px]" style={{ color: "var(--cream)" }}>{selectedGraphNode.label}</h3><div className="mt-3 flex flex-wrap gap-2">{visibleRecords.map((record) => <button key={record.id} type="button" onClick={() => { const documentNode = graphNodes.find((node) => node.kind === "document" && node.record_id === record.id); if (documentNode) setSelectedGraphNodeId(documentNode.id); }} className="rounded-md border px-3 py-2 text-left text-[11px] font-semibold" style={{ borderColor: "rgba(176,74,104,0.32)", color: "var(--plum)", background: "rgba(250,247,239,0.8)" }}>{record.title}</button>)}</div></>}
        </div>}
      </> : <p className="mt-4 text-[11px]" style={{ color: "var(--cream-mute)" }}>No graph links yet.</p>}
    </section>}
    <section className="space-y-3">
      {active.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>No tenant records yet.</div>}
      {active.length > 0 && visibleRecords.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>No tenant records match this graph node.</div>}
      {visibleRecords.map((record) => <article key={record.id} className="panel p-4"><div className="flex items-start gap-3"><FileText size={15} color="#60a5fa" className="mt-0.5" /><div className="min-w-0 flex-1"><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{record.title}</h2><p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{record.content}</p><p className="mt-3 text-[10px]" style={{ color: "var(--cream-mute)" }}>{new Date(record.created_at).toLocaleString()} · {record.status}</p></div><div className="flex items-center gap-1"><button type="button" title={record.status === "done" ? "Mark active" : "Mark done"} onClick={() => update(record.id, record.status === "done" ? "active" : "done")} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: record.status === "done" ? "#34d399" : "var(--cream-mute)" }}><Check size={13} /></button><button type="button" title="Archive" onClick={() => update(record.id, "archived")} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}><Archive size={13} /></button><button type="button" title="Delete" onClick={() => remove(record.id)} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "#fda4af" }}><Trash2 size={13} /></button></div></div></article>)}
    </section>
  </div>;
}
