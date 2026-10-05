"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, BookOpenText, CalendarDays, Check, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, LockKeyhole, Network, Plus, RefreshCw, Save, Tag, Target, Trash2, Upload } from "lucide-react";
import ClientCommunitySourceImport from "@/components/ClientCommunitySourceImport";
import ClientMemoryGraph3D, { type ClientGraphEdge, type ClientGraphNode } from "@/components/ClientMemoryGraph3D";
import ClientNotebookWorkspace from "@/components/ClientNotebookWorkspace";
import VoiceButton from "@/components/VoiceButton";

type Surface = "memory" | "journal" | "goals" | "notebook";
type LoadState = "loading" | "loaded" | "error";
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
  const [recordsLoadState, setRecordsLoadState] = useState<LoadState>("loading");
  const [hasMoreRecords, setHasMoreRecords] = useState(false);
  const [loadingMoreRecords, setLoadingMoreRecords] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [goalFilter, setGoalFilter] = useState<"active" | "done" | "all">("active");
  const [journalDay, setJournalDay] = useState<string | null>(null);
  const [notebookTab, setNotebookTab] = useState<"library" | "research" | "chat" | "studio" | "assets">("library");
  const [memoryView, setMemoryView] = useState<"recent" | "search" | "graph" | "galaxy">("recent");
  const [memoryQuery, setMemoryQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{ query: string; records: RecordItem[]; hasMore: boolean; nextOffset: number }>({ query: "", records: [], hasMore: false, nextOffset: 0 });
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchMoreBusy, setSearchMoreBusy] = useState(false);
  const [searchError, setSearchError] = useState<{ query: string; message: string } | null>(null);
  const [searchRevision, setSearchRevision] = useState(0);
  const [notebooks, setNotebooks] = useState<Array<{ id: string; title: string; summary: string; status: string }>>([]);
  const [activeNotebook, setActiveNotebook] = useState<string>("all");
  const [newNotebook, setNewNotebook] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [graphNodes, setGraphNodes] = useState<ClientGraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<ClientGraphEdge[]>([]);
  const [graphLoadState, setGraphLoadState] = useState<LoadState>("loading");
  const [graphPreviewLimited, setGraphPreviewLimited] = useState(false);
  const [graphBusy, setGraphBusy] = useState(false);
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
  const [selectedGraphRecord, setSelectedGraphRecord] = useState<RecordItem | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setRecordsLoadState("loading");
    // "all" is the only view that is not scoped to one notebook, so a client
    // can always see everything they imported regardless of how it is filed.
    const scope = surface === "notebook" && activeNotebook !== "all" ? `&notebook=${encodeURIComponent(activeNotebook)}` : "";
    const response = await fetch(`/api/client-runtime/records?kind=${copy.kind}${scope}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || !Array.isArray(data?.records)) {
      setRecordsLoadState("error");
      if (data?.error === "capability_not_enabled") setError("Tenant data is not enabled in this client manifest yet.");
      return false;
    }
    setRecords(data.records);
    setHasMoreRecords(data?.hasMore === true);
    setRecordsLoadState("loaded");
    return true;
  }
  useEffect(() => { void load(); }, [copy.kind, activeNotebook]);

  async function loadMoreRecords() {
    if (!hasMoreRecords || loadingMoreRecords) return;
    setLoadingMoreRecords(true);
    const scope = surface === "notebook" && activeNotebook !== "all" ? `&notebook=${encodeURIComponent(activeNotebook)}` : "";
    const response = await fetch(`/api/client-runtime/records?kind=${copy.kind}${scope}&offset=${records.length}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok && Array.isArray(data?.records)) {
      setRecords((current) => [...current, ...data.records.filter((record: RecordItem) => !current.some((existing) => existing.id === record.id))]);
      setHasMoreRecords(data.hasMore === true);
    } else setError(data?.error || "More tenant records could not be loaded.");
    setLoadingMoreRecords(false);
  }

  async function loadNotebooks() {
    if (surface !== "notebook") return;
    const response = await fetch("/api/client-runtime/notebooks", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok) setNotebooks(Array.isArray(data?.notebooks) ? data.notebooks : []);
    else if (data?.error === "notebook_schema_missing") setError("Notebooks need their migration applied before they can be used.");
  }
  useEffect(() => { void loadNotebooks(); }, [surface]);

  async function createNotebook() {
    const title = newNotebook.trim();
    if (!title || busy) return;
    setBusy(true); setError("");
    const response = await fetch("/api/client-runtime/notebooks", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(data?.error === "notebook_schema_missing" ? "Notebooks need their migration applied first." : "The notebook could not be created.");
    else { setNewNotebook(""); await loadNotebooks(); if (typeof data?.notebookId === "string") setActiveNotebook(data.notebookId); }
    setBusy(false);
  }

  async function loadGraph() {
    if (surface !== "memory") return;
    const response = await fetch("/api/client-runtime/memory-graph", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok && Array.isArray(data?.nodes) && Array.isArray(data?.edges)) {
      setGraphNodes(data.nodes);
      setGraphEdges(data.edges);
      setGraphPreviewLimited(data?.previewLimited?.nodes === true || data?.previewLimited?.edges === true);
      setGraphLoadState("loaded");
      return true;
    } else {
      setGraphLoadState("error");
    }
    return false;
  }
  useEffect(() => { void loadGraph(); }, [surface]);

  useEffect(() => {
    const query = memoryQuery.trim();
    if (surface !== "memory" || memoryView !== "search" || query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchBusy(true);
      setSearchError(null);
      void (async () => {
        const response = await fetch(`/api/client-runtime/records?kind=memory&q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal }).catch(() => null);
        const data = await response?.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response?.ok || !Array.isArray(data?.records)) setSearchError({ query, message: "Tenant memory search is unavailable." });
        else { setSearchResult({ query, records: data.records, hasMore: data.hasMore === true, nextOffset: Number(data.nextOffset) || data.records.length }); setSearchError(null); }
        setSearchBusy(false);
      })();
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [surface, memoryView, memoryQuery, searchRevision]);

  async function loadMoreSearch() {
    const query = memoryQuery.trim();
    if (query.length < 2 || searchResult.query !== query || !searchResult.hasMore || searchMoreBusy) return;
    setSearchMoreBusy(true);
    const response = await fetch(`/api/client-runtime/records?kind=memory&q=${encodeURIComponent(query)}&offset=${searchResult.nextOffset}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || !Array.isArray(data?.records)) setSearchError({ query, message: "More matching memories could not be loaded." });
    else {
      setSearchResult((current) => current.query === query ? { query, records: [...current.records, ...data.records.filter((record: RecordItem) => !current.records.some((existing) => existing.id === record.id))], hasMore: data.hasMore === true, nextOffset: Number(data.nextOffset) || current.nextOffset + data.records.length } : current);
      setSearchError(null);
    }
    setSearchMoreBusy(false);
  }

  async function add() {
    if (!title.trim() || !content.trim() || busy) return;
    setBusy(true); setError("");
    const response = await fetch("/api/client-runtime/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: copy.kind, title, content, notebookId: surface === "notebook" && activeNotebook !== "all" && activeNotebook !== "unfiled" ? activeNotebook : null, category: surface === "goals" ? category : undefined }) }).catch(() => null);
    if (!response?.ok) setError((await response?.json().catch(() => null))?.error || "The tenant record could not be saved.");
    else { setTitle(""); setContent(""); setCategory(""); await load(); if (surface === "memory") setSearchRevision((current) => current + 1); }
    setBusy(false);
  }

  async function update(id: string, status: RecordItem["status"]) {
    const response = await fetch("/api/client-runtime/records", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) }).catch(() => null);
    if (!response?.ok) { setError("The record could not be updated."); return; }
    await load();
    if (surface === "memory") { await refreshGraph(); setSearchRevision((current) => current + 1); }
  }

  async function remove(id: string) {
    const response = await fetch(`/api/client-runtime/records?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) { setError("The record could not be deleted."); return; }
    await load();
    if (surface === "memory") { await refreshGraph(); setSearchRevision((current) => current + 1); }
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
      await load(); await loadGraph(); setSearchRevision((current) => current + 1);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "The memory source could not be imported.");
    } finally {
      setImporting(false);
    }
  }

  async function exportMemory() {
    if (exporting) return;
    setExporting(true); setError("");
    try {
      const response = await fetch("/api/client-runtime/memory-import?format=markdown", { cache: "no-store" });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        setError(response.status === 401 ? "Sign in to export memory." : failure?.error === "memory_export_too_large" ? "This Markdown export exceeds 1,000 records. Request a full tenant export from support." : failure?.error === "memory_export_changed_retry" ? "Memory changed during export. Try again." : "The memory export could not be completed.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "veloce-memory.md";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("The memory export could not be completed.");
    } finally {
      setExporting(false);
    }
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
  const goalStats = useMemo(() => {
    const total = records.length;
    const completed = records.filter((record) => record.status === "done").length;
    return { total, completed, active: total - completed, progress: total ? Math.round((completed / total) * 100) : 0 };
  }, [records]);
  const selectedGraphNode = useMemo(() => graphNodes.find((node) => node.id === selectedGraphNodeId) ?? null, [graphNodes, selectedGraphNodeId]);
  const selectedRecord = useMemo(() => selectedGraphNode?.kind === "document" ? active.find((record) => record.id === selectedGraphNode.record_id) ?? (selectedGraphRecord?.id === selectedGraphNode.record_id ? selectedGraphRecord : null) : null, [active, selectedGraphNode, selectedGraphRecord]);
  useEffect(() => {
    setSelectedGraphRecord(null);
    if (selectedGraphNode?.kind !== "document" || !selectedGraphNode.record_id || active.some((record) => record.id === selectedGraphNode.record_id)) return;
    let cancelled = false;
    void fetch(`/api/client-runtime/records?kind=memory&id=${encodeURIComponent(selectedGraphNode.record_id)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!cancelled && Array.isArray(data?.records)) setSelectedGraphRecord(data.records[0] ?? null); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [selectedGraphNode, active]);
  const visibleRecords = useMemo(() => {
    if (!selectedGraphNode) return active;
    if (selectedGraphNode.kind === "document") {
      const loaded = active.filter((record) => record.id === selectedGraphNode.record_id);
      return loaded.length ? loaded : selectedGraphRecord && selectedGraphRecord.id === selectedGraphNode.record_id ? [selectedGraphRecord] : [];
    }
    if (selectedGraphNode.kind === "url") {
      const url = selectedGraphNode.metadata?.url;
      return active.filter((record) => record.metadata?.source_url === url || (Array.isArray(record.metadata?.source_links) && record.metadata.source_links.some((link) => typeof link === "object" && link !== null && (link as { url?: unknown }).url === url)));
    }
    const tag = selectedGraphNode.label.replace(/^#/, "").toLowerCase();
    return active.filter((record) => `${record.title}\n${record.content}`.toLowerCase().includes(`#${tag}`));
  }, [active, selectedGraphNode, selectedGraphRecord]);
  const journalDays = useMemo(() => Array.from(new Set(active.map((record) => new Date(record.created_at).toISOString().slice(0, 10)))).sort((left, right) => right.localeCompare(left)), [active]);
  useEffect(() => { if (surface === "journal" && !journalDay && journalDays[0]) setJournalDay(journalDays[0]); }, [surface, journalDay, journalDays]);
  const journalRecords = useMemo(() => journalDay ? active.filter((record) => new Date(record.created_at).toISOString().slice(0, 10) === journalDay) : active, [active, journalDay]);
  const goalRecords = useMemo(() => goalFilter === "all" ? active : active.filter((record) => goalFilter === "done" ? record.status === "done" : record.status !== "done"), [active, goalFilter]);
  // Search results come from the tenant-scoped server query, not the currently
  // loaded page of records or the bounded graph preview.
  const searchedRecords = memoryQuery.trim().length >= 2 && searchResult.query === memoryQuery.trim() ? searchResult.records : [];
  // What the notebook's chat and studio lanes are allowed to draw on.
  const notebookSources = useMemo(() => active.map((record) => ({ id: record.id, title: record.title, content: record.content })), [active]);
  function selectGraphNode(nodeId: string) {
    setSelectedGraphNodeId((current) => current === nodeId ? null : nodeId);
  }

  return <div className="space-y-5">
    <section className="panel p-5 md:p-6">
      <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.28)", color: "#60a5fa" }}><LockKeyhole size={18} /></div><div><p className="eyebrow">{copy.eyebrow}</p><h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{copy.title}</h1><p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>This client edition stores records in the current tenant namespace with Supabase RLS. It does not read the operator vault or local filesystem.</p></div></div>
    {surface === "memory" && <><div className="mt-4 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "var(--cream-mute)" }}><span className="rounded-md px-2 py-1" style={{ background: "rgba(179,128,63,0.14)", color: "var(--gold-deep)" }}>{recordsLoadState === "loading" && records.length === 0 ? "Loading tenant memories..." : recordsLoadState === "error" && records.length === 0 ? "Tenant memories unavailable" : `${active.length}${hasMoreRecords ? "+" : ""} tenant memories`}</span><span>{graphLoadState === "loading" && graphNodes.length === 0 ? "Loading graph..." : graphLoadState === "error" && graphNodes.length === 0 ? "Graph unavailable" : `${graphNodes.length} nodes · ${graphEdges.length} edges`}</span><span>Sources are scoped to this client tenant</span></div><div className="mt-4 flex flex-wrap gap-2"><input ref={fileInputRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void importMarkdown(file); }} /><button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Upload size={13} />{importing ? "Importing source" : "Import Markdown"}</button><button type="button" onClick={() => void exportMemory()} disabled={exporting} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px] disabled:opacity-50" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Download size={13} />{exporting ? "Preparing export" : "Export Markdown"}</button><button type="button" onClick={() => { setTitle(""); setContent(""); document.getElementById("client-memory-composer")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "rgba(179,128,63,0.42)", color: "var(--gold-deep)", background: "rgba(179,128,63,0.08)" }}><Plus size={13} />Add note</button></div></>}
      {surface === "notebook" && <><div className="mt-4 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "var(--cream-mute)" }}><span className="rounded-md px-2 py-1" style={{ background: "rgba(52,211,153,0.1)", color: "#34d399" }}>Tenant authenticated</span><span>{records.length} notebook records</span><span>{records.filter((record) => record.status !== "archived").length} active sources</span></div><div className="mt-5 flex flex-wrap gap-2" aria-label="Notebook workspace sections">{(["library", "research", "chat", "studio", "assets"] as const).map((item) => <button key={item} type="button" onClick={() => setNotebookTab(item)} className="rounded-md border px-3 py-2 text-[11px] capitalize" style={{ color: notebookTab === item ? "#07111d" : "var(--cream-dim)", background: notebookTab === item ? "#60a5fa" : "rgba(255,255,255,0.03)", borderColor: notebookTab === item ? "#60a5fa" : "var(--line-soft)" }}>{item}</button>)}</div>
      <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line-soft)" }}>
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>Notebook</p>
        <p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>Chat and studio only see the sources in the notebook you pick here.</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {[{ id: "all", title: "All sources" }, ...notebooks.filter((item) => item.status !== "archived"), { id: "unfiled", title: "Unfiled" }].map((item) => <button key={item.id} type="button" onClick={() => setActiveNotebook(item.id)}
            className="max-w-full truncate rounded-md border px-3 py-1.5 text-[11px]"
            style={{ color: activeNotebook === item.id ? "#07111d" : "var(--cream-dim)", background: activeNotebook === item.id ? "#60a5fa" : "rgba(255,255,255,0.03)", borderColor: activeNotebook === item.id ? "#60a5fa" : "var(--line-soft)" }}>{item.title}</button>)}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input value={newNotebook} onChange={(event) => setNewNotebook(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createNotebook(); } }}
            placeholder="Name a new notebook" className="min-w-[200px] flex-1 rounded-md border px-3 py-2 text-[11px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} />
          <button type="button" onClick={() => void createNotebook()} disabled={busy || !newNotebook.trim()}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[11px] disabled:opacity-40"
            style={{ borderColor: "rgba(96,165,250,0.42)", color: "#60a5fa", background: "rgba(96,165,250,0.08)" }}><Plus size={12} />Create</button>
        </div>
      </div></>}
    </section>
    {surface === "goals" && <section className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Total" value={String(goalStats.total)} color="#60a5fa" /><StatCard label="Active" value={String(goalStats.active)} color="#c4b5fd" /><StatCard label="Completed" value={String(goalStats.completed)} color="#34d399" /><StatCard label="Progress" value={`${goalStats.progress}%`} color="#f0c94a" progress={goalStats.progress} /></section>}
    {surface === "notebook" && notebookTab !== "library" ? <ClientNotebookWorkspace tab={notebookTab} sources={notebookSources} notebookId={activeNotebook === "all" || activeNotebook === "unfiled" ? null : activeNotebook} onImported={async () => { await load(); }} /> : surface === "goals" ? <GoalComposer title={title} content={content} category={category} busy={busy} filter={goalFilter} stats={goalStats} onTitle={setTitle} onContent={setContent} onCategory={setCategory} onFilter={setGoalFilter} onAdd={add} /> : surface === "journal" ? <JournalComposer title={title} content={content} busy={busy} days={journalDays} selectedDay={journalDay} entries={journalRecords} onTitle={setTitle} onContent={setContent} onSelectDay={setJournalDay} onAdd={add} /> : <section id={surface === "memory" ? "client-memory-composer" : undefined} className="panel p-5 md:p-6">
      <div className="flex items-center gap-2"><Plus size={15} color="#60a5fa" /><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Add tenant record</h2></div>
      <div className="mt-4 flex gap-3"><VoiceButton size={38} onTranscript={(transcript, options) => { if (options.final) setContent((current) => `${current}${current ? "\n" : ""}${transcript}`); }} /><div className="min-w-0 flex-1"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy.placeholder} className="w-full rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} />
      <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={copy.content} className="mt-3 min-h-[130px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} /></div></div>
      <div className="mt-4 flex items-center gap-3"><button type="button" onClick={add} disabled={busy || !title.trim() || !content.trim()} className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold" style={{ background: busy ? "rgba(255,255,255,0.1)" : "#60a5fa", color: busy ? "var(--cream-mute)" : "#07111d" }}><Save size={13} />{busy ? "Saving" : "Save to tenant"}</button><span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>No secrets or credentials should be entered here.</span></div>
      {error && <p className="mt-3 text-[11px]" style={{ color: "#fda4af" }}>{error}</p>}
    </section>}
    {surface === "memory" && <ClientCommunitySourceImport onImported={async () => { const refreshed = await Promise.all([load(), loadGraph()]); setSearchRevision((current) => current + 1); if (refreshed.some((loaded) => !loaded)) throw new Error("memory_refresh_failed"); }} />}
    {surface === "memory" && <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Network size={16} color="var(--gold-deep)" /><h2 className="text-[15px] font-semibold" style={{ color: "var(--cream)" }}>Knowledge map</h2><span className="rounded-md px-2 py-1 text-[10px] font-semibold" style={{ color: "var(--cream-soft)", background: "rgba(179,128,63,0.14)" }}>{graphLoadState === "loading" && graphNodes.length === 0 ? "Loading graph..." : graphLoadState === "error" && graphNodes.length === 0 ? "Unavailable" : `${graphEdges.length} relationships · ${graphNodes.length} nodes`}</span></div>
        <div className="flex items-center gap-2"><button type="button" onClick={refreshGraph} disabled={graphBusy} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px] font-semibold" style={{ borderColor: "rgba(179,128,63,0.42)", color: "var(--gold-deep)", background: "rgba(179,128,63,0.08)" }}><RefreshCw size={13} className={graphBusy ? "animate-spin" : ""} />{graphBusy ? "Refreshing" : "Refresh map"}</button></div>
      </div>
      {graphPreviewLimited && <p className="mt-3 text-xs text-amber-200">Graph preview is limited. Search reaches tenant memories beyond the visible map.</p>}
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Memory views">{(["recent", "search", "graph", "galaxy"] as const).map((view) => <button key={view} type="button" onClick={() => setMemoryView(view)} className="rounded-md border px-3 py-2 text-[11px] capitalize" style={{ color: memoryView === view ? "#07111d" : "var(--cream-dim)", background: memoryView === view ? "#f0c94a" : "rgba(255,255,255,0.03)", borderColor: memoryView === view ? "#f0c94a" : "var(--line-soft)" }}>{view === "galaxy" ? "Galaxy" : view}</button>)}</div>
      {memoryView === "search" && <div className="mt-4">
        <input value={memoryQuery} onChange={(event) => setMemoryQuery(event.target.value)} maxLength={200} placeholder="Search memories and source links in this tenant"
          className="w-full rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} />
        <p className="mt-2 text-[10px]" style={{ color: "var(--cream-mute)" }}>
          {memoryQuery.trim().length < 2 ? "Enter at least two characters." : searchError?.query === memoryQuery.trim() ? "Search unavailable." : searchBusy || searchResult.query !== memoryQuery.trim() ? "Searching tenant memories..." : `${searchedRecords.length}${searchResult.hasMore ? "+" : ""} matching memories`}
        </p>
        {searchError?.query === memoryQuery.trim() && <p role="alert" className="mt-2 text-xs text-rose-300">{searchError.message}</p>}
      </div>}
      {graphNodes.length > 0 && (memoryView === "graph" || memoryView === "galaxy") ? <>
        <ClientMemoryGraph3D nodes={graphNodes} edges={graphEdges} selectedNodeId={selectedGraphNodeId} onSelectNode={selectGraphNode} onClearSelection={() => setSelectedGraphNodeId(null)} />
        {selectedGraphNode && <div className="mt-4 rounded-md border p-4" style={{ borderColor: selectedGraphNode.kind === "document" ? "rgba(47,143,107,0.42)" : "rgba(176,74,104,0.42)", background: selectedGraphNode.kind === "document" ? "rgba(47,143,107,0.08)" : "rgba(176,74,104,0.08)" }}>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase" style={{ color: selectedGraphNode.kind === "document" ? "var(--emerald-dim)" : "var(--plum)" }}>{selectedGraphNode.kind === "document" ? <FileText size={13} /> : selectedGraphNode.kind === "url" ? <ExternalLink size={13} /> : <Tag size={13} />}{selectedGraphNode.kind === "document" ? "Selected memory" : selectedGraphNode.kind === "url" ? "Selected link" : "Selected tag"}</div>
          {selectedRecord ? <><h3 className="mt-2 text-[15px]" style={{ color: "var(--cream)" }}>{selectedRecord.title}</h3>{typeof selectedRecord.metadata?.source_url === "string" && <a href={selectedRecord.metadata.source_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 break-all text-xs text-emerald-300 hover:underline"><ExternalLink size={12} />Original source</a>}<p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: "var(--cream-soft)" }}>{selectedRecord.content}</p></> : <><h3 className="mt-2 text-[15px]" style={{ color: "var(--cream)" }}>{selectedGraphNode.label}</h3>{selectedGraphNode.kind === "url" && typeof selectedGraphNode.metadata?.url === "string" && <a href={selectedGraphNode.metadata.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 break-all text-xs text-emerald-300 hover:underline"><ExternalLink size={12} />{selectedGraphNode.metadata.url}</a>}<div className="mt-3 flex flex-wrap gap-2">{visibleRecords.map((record) => <button key={record.id} type="button" onClick={() => { const documentNode = graphNodes.find((node) => node.kind === "document" && node.record_id === record.id); if (documentNode) setSelectedGraphNodeId(documentNode.id); }} className="rounded-md border px-3 py-2 text-left text-[11px] font-semibold" style={{ borderColor: "rgba(176,74,104,0.32)", color: "var(--plum)", background: "rgba(250,247,239,0.8)" }}>{record.title}</button>)}</div></>}
        </div>}
      </> : memoryView === "graph" || memoryView === "galaxy" ? graphLoadState === "loading" ? <p role="status" className="mt-4 text-[11px]" style={{ color: "var(--cream-mute)" }}>Loading the tenant knowledge map...</p> : graphLoadState === "error" ? <p role="alert" className="mt-4 text-[11px]" style={{ color: "var(--cream-mute)" }}>The tenant knowledge map could not be loaded. Try refreshing the page.</p> : <p className="mt-4 text-[11px]" style={{ color: "var(--cream-mute)" }}>No graph links yet. Add two related tenant memories and refresh the map.</p> : memoryView === "recent" ? <p role={recordsLoadState === "loading" ? "status" : undefined} className="mt-4 text-[11px]" style={{ color: "var(--cream-mute)" }}>{recordsLoadState === "loading" && records.length === 0 ? "Loading tenant memories..." : recordsLoadState === "error" && records.length === 0 ? "Tenant memories could not be loaded." : `${active.length}${hasMoreRecords ? "+" : ""} recent tenant memories are available below.`}</p> : null}
    </section>}
    {surface !== "journal" && !(surface === "notebook" && notebookTab !== "library") && <section className="space-y-3">
      {!(surface === "memory" && memoryView === "search") && active.length === 0 && recordsLoadState === "loading" && <div role="status" className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>Loading tenant records...</div>}
      {!(surface === "memory" && memoryView === "search") && active.length === 0 && recordsLoadState === "error" && <div role="alert" className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>Tenant records could not be loaded. <button type="button" className="ml-2 underline" onClick={() => void load()}>Retry</button></div>}
      {!(surface === "memory" && memoryView === "search") && active.length === 0 && recordsLoadState === "loaded" && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>No tenant records yet.</div>}
      {!(surface === "memory" && memoryView === "search") && active.length > 0 && visibleRecords.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>No tenant records match this graph node.</div>}
      {surface === "memory" && memoryView === "search" && memoryQuery.trim().length >= 2 && !searchBusy && searchResult.query === memoryQuery.trim() && searchedRecords.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>No matching memories in this tenant.</div>}
      {(surface === "goals" ? goalRecords : surface === "memory" && memoryView === "search" ? searchedRecords : visibleRecords).map((record) => <article key={record.id} className="panel p-4"><div className="flex items-start gap-3"><FileText size={15} color="#60a5fa" className="mt-0.5" /><div className="min-w-0 flex-1"><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{record.title}</h2><p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{record.content}</p><SourceLinks metadata={record.metadata} /><p className="mt-3 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "var(--cream-mute)" }}>{surface === "goals" && typeof record.metadata?.category === "string" && <span className="inline-flex items-center gap-1"><Tag size={10} />{record.metadata.category}</span>}<span>{new Date(record.created_at).toLocaleString()} · {record.status}</span></p></div><div className="flex items-center gap-1"><button type="button" title={record.status === "done" ? "Mark active" : "Mark done"} onClick={() => update(record.id, record.status === "done" ? "active" : "done")} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: record.status === "done" ? "#34d399" : "var(--cream-mute)" }}><Check size={13} /></button><button type="button" title="Archive" onClick={() => update(record.id, "archived")} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}><Archive size={13} /></button><button type="button" title="Delete" onClick={() => remove(record.id)} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "#fda4af" }}><Trash2 size={13} /></button></div></div></article>)}
      {surface === "memory" && memoryView === "search" ? searchResult.query === memoryQuery.trim() && searchResult.hasMore && <button type="button" onClick={() => void loadMoreSearch()} disabled={searchMoreBusy} className="w-full rounded-md border px-4 py-2.5 text-xs font-semibold disabled:opacity-40" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>{searchMoreBusy ? "Loading" : "Load more matches"}</button> : hasMoreRecords && <button type="button" onClick={() => void loadMoreRecords()} disabled={loadingMoreRecords} className="w-full rounded-md border px-4 py-2.5 text-xs font-semibold disabled:opacity-40" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>{loadingMoreRecords ? "Loading" : "Load more"}</button>}
    </section>}
  </div>;
}

function SourceLinks({ metadata }: { metadata?: Record<string, unknown> }) {
  const sourceUrl = safeSourceHref(metadata?.source_url);
  const links = Array.isArray(metadata?.source_links) ? metadata.source_links.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const link = item as { url?: unknown; text?: unknown };
    const url = safeSourceHref(link.url);
    return url ? [{ url, text: typeof link.text === "string" && link.text.trim() ? link.text.trim() : url }] : [];
  }) : [];
  if (!sourceUrl && !links.length) return null;
  return <div className="mt-3 text-xs" style={{ color: "var(--cream-soft)" }}>
    {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-300 hover:underline"><ExternalLink size={12} />Original page</a>}
    {links.length > 0 && <details className="mt-2"><summary className="cursor-pointer">{links.length} source link{links.length === 1 ? "" : "s"}</summary><ul className="mt-2 max-h-40 space-y-1 overflow-auto">{links.map((link, index) => <li key={`${link.url}-${index}`}><a href={link.url} target="_blank" rel="noopener noreferrer" className="break-all text-sky-300 hover:underline">{link.text}</a></li>)}</ul></details>}
  </div>;
}

function safeSourceHref(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

function GoalComposer({ title, content, category, busy, filter, stats, onTitle, onContent, onCategory, onFilter, onAdd }: { title: string; content: string; category: string; busy: boolean; filter: "active" | "done" | "all"; stats: { total: number; completed: number; active: number; progress: number }; onTitle: (value: string) => void; onContent: (value: string) => void; onCategory: (value: string) => void; onFilter: (value: "active" | "done" | "all") => void; onAdd: () => Promise<void> }) {
  return <section className="space-y-4"><div className="panel p-5"><div className="flex items-center gap-2"><Target size={16} color="#22d3ee" /><h2 className="text-[14px] font-semibold" style={{ color: "var(--cream)" }}>Add a goal</h2></div><div className="mt-4 flex flex-wrap items-end gap-3"><VoiceButton size={38} onTranscript={(text, options) => { if (options.final) onTitle(`${title}${title ? " " : ""}${text}`); }} /><div className="min-w-[220px] flex-1"><input value={title} onChange={(event) => onTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void onAdd(); } }} placeholder="What is the goal?" className="w-full rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} /><textarea value={content} onChange={(event) => onContent(event.target.value)} placeholder="Define the outcome and the next step..." className="mt-2 min-h-[82px] w-full rounded-md border px-3 py-2 text-[11px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} /></div><label className="min-w-[150px]"><span className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--cream-mute)" }}>Category</span><select value={category} onChange={(event) => onCategory(event.target.value)} className="mt-1.5 w-full rounded-md border px-3 py-2 text-[11px]" style={{ color: "var(--cream-dim)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }}><option value="">No category</option>{["Work", "Business", "Content", "SEO", "Health", "Personal", "Learning"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button type="button" onClick={() => void onAdd()} disabled={busy || !title.trim() || !content.trim()} className="inline-flex rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40" style={{ background: "rgba(34,211,238,0.18)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.46)" }}><Plus size={13} className="mr-1.5" />{busy ? "Adding" : "Add"}</button></div></div><div className="flex flex-wrap items-center gap-2">{(["active", "done", "all"] as const).map((item) => <button key={item} type="button" onClick={() => onFilter(item)} className="rounded-full border px-3 py-1.5 text-[11px]" style={{ color: filter === item ? "var(--cream)" : "var(--cream-dim)", borderColor: filter === item ? "#a855f7" : "var(--line-soft)", background: filter === item ? "rgba(168,85,247,0.16)" : "transparent" }}>{item[0].toUpperCase() + item.slice(1)} · {item === "active" ? stats.active : item === "done" ? stats.completed : stats.total}</button>)}<span className="ml-auto text-[10px]" style={{ color: "var(--cream-mute)" }}>Stored as a tenant goal record</span></div></section>;
}

function JournalComposer({ title, content, busy, days, selectedDay, entries, onTitle, onContent, onSelectDay, onAdd }: { title: string; content: string; busy: boolean; days: string[]; selectedDay: string | null; entries: RecordItem[]; onTitle: (value: string) => void; onContent: (value: string) => void; onSelectDay: (value: string) => void; onAdd: () => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10);
  const chosen = selectedDay ?? today;
  const label = new Date(`${chosen}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return <section className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]"><aside className="space-y-2"><div className="flex items-center gap-2 px-1 text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}><CalendarDays size={12} />Recent entries</div>{days.length ? days.map((day) => <button key={day} type="button" onClick={() => onSelectDay(day)} className="flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left" style={{ borderColor: day === chosen ? "#a855f7" : "var(--line-soft)", background: day === chosen ? "rgba(168,85,247,0.12)" : "transparent" }}><span className="text-[11px]" style={{ color: day === chosen ? "var(--cream)" : "var(--cream-dim)" }}>{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>{day === today && <span className="text-[9px] uppercase" style={{ color: "#c4b5fd" }}>today</span>}</button>) : <p className="px-1 py-5 text-[11px]" style={{ color: "var(--cream-mute)" }}>No entries yet.</p>}</aside><main className="min-w-0 space-y-4"><div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>{chosen === today ? "Today" : "Journal"}</p><h2 className="mt-1 text-[22px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{label}</h2></div><div className="flex items-center gap-1"><button type="button" onClick={() => onSelectDay(new Date(new Date(`${chosen}T12:00:00`).getTime() - 86_400_000).toISOString().slice(0, 10))} className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><ChevronLeft size={14} /></button><button type="button" onClick={() => onSelectDay(today)} className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>Today</button><button type="button" disabled={chosen >= today} onClick={() => onSelectDay(new Date(new Date(`${chosen}T12:00:00`).getTime() + 86_400_000).toISOString().slice(0, 10))} className="grid h-8 w-8 place-items-center rounded-md border disabled:opacity-30" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><ChevronRight size={14} /></button></div></div>{chosen === today && <div className="panel p-4"><div className="flex items-center gap-2"><BookOpenText size={15} color="#c4b5fd" /><p className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>New entry</p></div><div className="mt-3 flex gap-3"><VoiceButton size={38} onTranscript={(text, options) => { if (options.final) onContent(`${content}${content ? "\n" : ""}${text}`); }} /><div className="min-w-0 flex-1"><input value={title} onChange={(event) => onTitle(event.target.value)} placeholder="Entry title" className="w-full rounded-md border px-3 py-2 text-[11px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} /><textarea value={content} onChange={(event) => onContent(event.target.value)} placeholder="What happened, changed, or needs attention?" className="mt-2 min-h-[110px] w-full rounded-md border px-3 py-2 text-[11px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} /><button type="button" onClick={() => void onAdd()} disabled={busy || !title.trim() || !content.trim()} className="mt-3 inline-flex items-center rounded-md px-3 py-2 text-[11px] font-semibold disabled:opacity-40" style={{ background: "rgba(168,85,247,0.17)", border: "1px solid rgba(168,85,247,0.48)", color: "#c4b5fd" }}><Plus size={13} className="mr-1.5" />{busy ? "Saving" : "Add entry"}</button></div></div></div>}<div className="space-y-3">{entries.length ? entries.map((entry) => <article key={entry.id} className="panel p-4"><p className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{entry.title}</p><p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{entry.content}</p><p className="mt-3 text-[10px]" style={{ color: "var(--cream-mute)" }}>{new Date(entry.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p></article>) : <div className="panel p-6 text-center text-[11px]" style={{ color: "var(--cream-mute)" }}>No entries for this day.</div>}</div></main></section>;
}

function StatCard({ label, value, color, progress }: { label: string; value: string; color: string; progress?: number }) {
  return <div className="panel p-4"><p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--cream-mute)" }}>{label}</p><p className="mt-2 text-[25px]" style={{ color, fontFamily: "'Bricolage Grotesque', sans-serif" }}>{value}</p>{progress !== undefined && <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}><div className="h-full" style={{ width: `${progress}%`, background: color }} /></div>}</div>;
}
