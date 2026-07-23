"use client";

import { useEffect, useState } from "react";
import { ExternalLink, GitBranch, Loader2, RefreshCw, Search } from "lucide-react";

interface Status {
  installed: boolean;
  version: string;
  configured: boolean;
  ready: boolean;
  reportAvailable: boolean;
  obsidianExported: boolean;
  nodes: number;
  edges: number;
  lastBuiltAt: string | null;
  obsidianPath: string;
  corpusFiles: number;
  corpusBytes: number;
  corpusUpdatedAt: string | null;
  build: {
    phase: "idle" | "running" | "succeeded" | "failed";
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
  };
}

export default function GraphifyPanel({ latestVaultMtime = null }: { latestVaultMtime?: number | null }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"stage" | "build" | "query" | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    try { setStatus(await (await fetch("/api/memory/graphify", { cache: "no-store" })).json()); } catch { setNotice("Could not read Graphify status."); }
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (status?.build?.phase !== "running") return;
    const timer = window.setInterval(() => { void refresh(); }, 2500);
    return () => window.clearInterval(timer);
  }, [status?.build?.phase]);

  async function syncSources() {
    setBusy("stage"); setNotice("");
    try {
      const r = await fetch("/api/memory/graphify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "stage" }) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Source sync failed.");
      setStatus(j.status); setNotice(`Synced ${j.status.corpusFiles} private source files. Smart search is already current; rebuild only when you need updated relationships.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Source sync failed."); }
    setBusy(null);
  }

  async function build() {
    setBusy("build"); setNotice("");
    try {
      const r = await fetch("/api/memory/graphify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "build" }) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Graphify build failed.");
      setStatus(j.status); setNotice("Graph rebuild started in the background. Smart search and the current graph remain available while it runs.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Graphify build failed."); }
    setBusy(null);
  }

  async function query() {
    if (!question.trim()) return;
    setBusy("query"); setNotice(""); setAnswer("");
    try {
      const r = await fetch("/api/memory/graphify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "query", question }) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Graphify query failed.");
      setAnswer(j.answer || "No connected concepts found.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Graphify query failed."); }
    setBusy(null);
  }

  const indexMtime = status?.lastBuiltAt ? new Date(status.lastBuiltAt).getTime() : 0;
  const stale = Boolean(status?.ready && latestVaultMtime && latestVaultMtime > indexMtime);
  const building = status?.build?.phase === "running";

  return <section className="mb-3 rounded-xl border border-[rgba(90,184,150,0.35)] bg-[rgba(90,184,150,0.06)] p-3">
    <div className="flex flex-wrap items-center gap-2">
      <GitBranch size={14} style={{ color: "#5ab896" }} />
      <span className="text-[12px] font-medium" style={{ color: "var(--fg)" }}>Graphify knowledge layer</span>
      <span className="text-[10px] uppercase tracking-wider" style={{ color: status?.ready ? "#5ab896" : "var(--fg-dimmer)" }}>{status?.ready ? `${status.nodes} nodes · ${status.edges} edges` : status?.installed ? "ready to build" : "not installed"}</span>
      {Boolean(status?.corpusFiles) && <span className="text-[10px] text-[var(--fg-dimmer)]">{status?.corpusFiles} curated sources</span>}
      {stale && <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-200">New vault notes · rebuild needed</span>}
      <button onClick={refresh} title="Refresh Graphify status" className="ml-auto rounded-md border border-[var(--panel-border)] p-1.5 text-[var(--fg-dim)]"><RefreshCw size={12} /></button>
      <button onClick={syncSources} disabled={busy !== null || !status?.configured} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--panel-border)] px-2.5 py-1.5 text-[10.5px] text-[var(--fg-dim)] disabled:opacity-50">{busy === "stage" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sync sources</button>
      <button onClick={build} disabled={busy !== null || building || !status?.installed || !status?.configured} className="inline-flex items-center gap-1.5 rounded-md bg-[rgba(90,184,150,0.18)] px-2.5 py-1.5 text-[10.5px] text-[var(--fg)] disabled:opacity-50">{busy === "build" || building ? <Loader2 size={12} className="animate-spin" /> : <GitBranch size={12} />} {building ? "Rebuilding" : "Rebuild graph"}</button>
      {status?.reportAvailable && <a href="/api/memory/graphify?file=report" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-[var(--panel-border)] px-2 py-1.5 text-[10.5px] text-[var(--fg-dim)]"><ExternalLink size={11} /> Report</a>}
    </div>
    <div className="mt-2 text-[10.5px] leading-relaxed text-[var(--fg-dimmer)]">
      <strong className="text-[var(--fg-dim)]">Smart search updates automatically</strong> for names, titles, paths, and descriptions. Graphify maps conceptual relationships from a private corpus that excludes generated graph files.
      {status?.lastBuiltAt && <> Last built {new Date(status.lastBuiltAt).toLocaleString()}.</>}
      {status?.corpusUpdatedAt && <> Sources synced {new Date(status.corpusUpdatedAt).toLocaleString()}.</>}
      <span className="block mt-1">For business paperwork, place approved Markdown, text, CSV, JSON, HTML, PDF, DOCX, or RTF files inside the connected vault, sync sources, then rebuild the graph.</span>
      {status?.build?.phase === "failed" && <span className="mt-1 block text-red-300">Last rebuild failed: {status.build.error}</span>}
      {status?.build?.phase === "running" && <span className="mt-1 block text-amber-200">Relationship extraction is running locally in the background.</span>}
    </div>
    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--panel-border)] bg-[rgba(0,0,0,0.18)] px-2.5 py-1.5"><Search size={12} className="shrink-0 text-[var(--fg-dimmer)]" /><input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void query(); }} placeholder="Ask how concepts or projects connect..." className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--fg)] outline-none placeholder:text-[var(--fg-dimmer)]" /></div>
      <button onClick={query} disabled={busy !== null || !status?.ready || !question.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--panel-border)] px-3 py-1.5 text-[10.5px] text-[var(--fg-dim)] disabled:opacity-50">{busy === "query" ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Query graph</button>
    </div>
    {answer && <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--panel-border)] bg-[rgba(0,0,0,0.2)] p-2.5 text-[10.5px] leading-relaxed text-[var(--fg-dim)]">{answer}</pre>}
    {notice && <div className="mt-2 text-[10.5px] text-[var(--fg-dimmer)]">{notice}</div>}
  </section>;
}
