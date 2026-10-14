"use client";

// The four Notebook tabs, each driving a lane that already exists.
//
// These were previously a paragraph of description apiece with no input and no
// action, which broke the rule that no visible control may be decorative.
// Research imports a verified source, chat answers from selected records,
// studio queues a real workspace execution, and assets lists tenant artifacts
// with signed downloads. Nothing here claims an output it cannot produce.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Download, Eye, FileText, FolderOpen, LoaderCircle, Send, Sparkles, Upload } from "lucide-react";
import {
  NOTEBOOK_STUDIO_OUTPUTS,
  notebookChatPrompt,
  notebookStudioOutput,
  type NotebookSource,
  type NotebookStudioOutput,
} from "@/lib/clientNotebookLanes";

type Tab = "research" | "chat" | "studio" | "assets";
type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
type Execution = { id: string; status: string; title: string | null; artifactId: string | null; errorCode: string | null; createdAt: string | null; sourceReferences?: Array<{ id: string; title: string; sourceUrl: string | null; links: Array<{ url: string; text: string }> }> };
type Artifact = { id: string; original_name: string | null; content_type: string | null; byte_size: number | null; status: string | null; created_at: string | null };

const FIELD = { color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" } as const;

export default function ClientNotebookWorkspace({ tab, sources, notebookId, notebookScope, onImported }: { tab: Tab; sources: NotebookSource[]; notebookId: string | null; notebookScope: string; onImported: () => void | Promise<void> }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const selected = useMemo(() => sources.filter((source) => selectedIds.includes(source.id)), [sources, selectedIds]);

  function toggle(id: string) {
    setSelectedIds((current) => {
      const valid = current.filter((item) => sources.some((source) => source.id === item));
      return valid.includes(id) ? valid.filter((item) => item !== id) : valid.length < 5 ? [...valid, id] : valid;
    });
  }

  return <div className="space-y-4">
    {error && <p className="panel p-3 text-[11px]" style={{ color: "#fda4af" }}>{error}</p>}
    {tab === "research" && <ResearchLane notebookId={notebookId} onError={setError} onImported={onImported} />}
    {tab === "chat" && <ChatLane sources={sources} selected={selected} selectedIds={selectedIds} onToggle={toggle} onError={setError} />}
    {tab === "studio" && <StudioLane sources={sources} selected={selected} notebookScope={notebookScope} onToggle={toggle} onError={setError} />}
    {tab === "assets" && <AssetsLane onError={setError} />}
  </div>;
}

/** Research: the verified memory-import path, writing a notebook record. */
function ResearchLane({ notebookId, onError, onImported }: { notebookId: string | null; onError: (value: string) => void; onImported: () => void | Promise<void> }) {
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function importSource(file: File | undefined) {
    if (!file || importing) return;
    const fileName = file.name.trim();
    if (!/\.(?:md|markdown|txt)$/i.test(fileName) || file.size < 1 || file.size > 100_000) {
      onError("Choose a Markdown or text file smaller than 100 KB.");
      return;
    }
    setImporting(true); onError(""); setImported(null);
    try {
      const content = (await file.text()).replace(/\r\n?/g, "\n").trim();
      if (!content || content.length > 30_000) throw new Error("The file must contain no more than 30,000 characters.");
      const contentType = /\.txt$/i.test(fileName) ? "text/plain" : "text/markdown";
      const upload = await fetch("/api/client-runtime/artifacts", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName, contentType, byteSize: file.size }),
      });
      const uploadData = await upload.json().catch(() => null);
      if (!upload.ok || !uploadData?.artifactId || !uploadData?.uploadUrl) throw new Error(uploadData?.error || "The source file could not be prepared.");
      const written = await fetch(uploadData.uploadUrl, { method: "PUT", headers: uploadData.uploadHeaders ?? { "content-type": contentType }, body: file });
      if (!written.ok) throw new Error("The source file could not be stored.");
      const completed = await fetch(`/api/client-runtime/artifacts/${uploadData.artifactId}/complete`, { method: "POST" });
      if (!completed.ok) throw new Error((await completed.json().catch(() => null))?.error || "The source file could not be verified.");
      const stored = await fetch("/api/client-runtime/memory-import", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName, content, artifactId: uploadData.artifactId, kind: "notebook", notebookId }),
      });
      if (!stored.ok) throw new Error((await stored.json().catch(() => null))?.error || "The source could not be added to the notebook.");
      setImported(fileName);
      await onImported();
    } catch (importError) {
      onError(importError instanceof Error ? importError.message : "The source could not be imported.");
    } finally {
      setImporting(false);
    }
  }

  return <LanePanel icon={<BookOpen size={17} />} eyebrow="Tenant Notebook · research" title="Add a source"
    body="Import a Markdown or text source into this tenant's notebook library. The file is stored and verified as a tenant artifact first, then linked to a notebook record you can read, use as chat grounding, and export.">
    {notebookId ? null : <p className="mb-3 text-[11px]" style={{ color: "var(--cream-mute)" }}>No notebook is selected, so this source will be imported unfiled. Pick one above to file it.</p>}
    <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="sr-only"
      onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void importSource(file); }} />
    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing}
      className="inline-flex items-center gap-2 rounded-md border px-3 py-2.5 text-[11px] font-semibold disabled:opacity-40"
      style={{ borderColor: "rgba(96,165,250,0.42)", color: "#60a5fa", background: "rgba(96,165,250,0.1)" }}>
      {importing ? <LoaderCircle size={13} className="animate-spin" /> : <Upload size={13} />}{importing ? "Importing source" : "Import a source"}
    </button>
    {imported && <p className="mt-3 text-[11px]" style={{ color: "#34d399" }}>Added “{imported}” to the notebook library.</p>}
  </LanePanel>;
}

/** Chat: the text-agent job lane, answering only from selected records. */
function ChatLane({ sources, selected, selectedIds, onToggle, onError }: { sources: NotebookSource[]; selected: NotebookSource[]; selectedIds: string[]; onToggle: (id: string) => void; onError: (value: string) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | null>(null);
  useEffect(() => () => { if (pollRef.current) window.clearTimeout(pollRef.current); }, []);

  async function ask() {
    const value = question.trim();
    if (!value || busy) return;
    const prompt = notebookChatPrompt({ question: value, sources: selected });
    setBusy(true); onError("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: value }]);
    setQuestion("");
    const response = await fetch("/api/client-runtime/jobs", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, idempotencyKey: crypto.randomUUID() }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.jobId !== "string") {
      onError(typeof data?.error === "string" ? data.error : "notebook_chat_queue_failed");
      setBusy(false);
      return;
    }
    poll(data.jobId, 0);
  }

  function poll(jobId: string, attempts: number) {
    pollRef.current = window.setTimeout(async () => {
      const response = await fetch(`/api/client-runtime/jobs/${jobId}`, { cache: "no-store" }).catch(() => null);
      const job = (await response?.json().catch(() => null))?.job;
      if (job?.status === "succeeded") {
        const output = typeof job.output_metadata?.output === "string" ? job.output_metadata.output.trim() : "";
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: output || "The provider completed without text output." }]);
        setBusy(false);
      } else if (job?.status === "failed" || job?.status === "cancelled" || attempts >= 90) {
        onError(job?.error_code || "notebook_chat_incomplete");
        setBusy(false);
      } else {
        poll(jobId, attempts + 1);
      }
    }, attempts === 0 ? 700 : 1100);
  }

  return <>
    <SourcePicker sources={sources} selectedIds={selectedIds} onToggle={onToggle}
      hint="Selected sources are the only material the answer may draw on." />
    <LanePanel icon={<Send size={17} />} eyebrow="Tenant Notebook · chat" title="Ask the notebook"
      body="Ask a question answered strictly from the sources you selected. The request runs through the approved queued provider lane; nothing here opens a link or searches the web.">
      <div className="space-y-3">
        {messages.map((message) => <div key={message.id} className="rounded-md border p-3"
          style={{ borderColor: message.role === "user" ? "var(--line-soft)" : "rgba(96,165,250,0.32)", background: message.role === "user" ? "transparent" : "rgba(96,165,250,0.07)" }}>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>{message.role === "user" ? "You" : "Notebook"}</p>
          <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{message.content}</p>
        </div>)}
        {busy && <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>Waiting for the queued provider round…</p>}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What do these sources say about…?"
          className="min-h-[74px] min-w-[240px] flex-1 resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={FIELD} />
        <button type="button" onClick={() => void ask()} disabled={busy || !question.trim() || selected.length === 0}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40"
          style={{ background: "#60a5fa", color: "#07111d" }}>
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Send size={13} />}Ask
        </button>
      </div>
      {selected.length === 0 && <p className="mt-2 text-[10px]" style={{ color: "var(--cream-mute)" }}>Select at least one source above — this lane answers from your notebook, not from general knowledge.</p>}
    </LanePanel>
  </>;
}

/** Studio: the workspace-execution lane, producing a tenant artifact. */
function StudioLane({ sources, selected, notebookScope, onToggle, onError }: { sources: NotebookSource[]; selected: NotebookSource[]; notebookScope: string; onToggle: (id: string) => void; onError: (value: string) => void }) {
  const [output, setOutput] = useState<NotebookStudioOutput>("outline");
  const [instruction, setInstruction] = useState("");
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<{ artifactId: string; content: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/client-runtime/executions?surface=notebook", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    return response?.ok && Array.isArray(data?.executions) ? data.executions as Execution[] : null;
  }, []);
  useEffect(() => {
    let active = true;
    void load().then((items) => { if (active && items) setExecutions(items); });
    return () => { active = false; };
  }, [load]);

  const inFlight = executions.some((item) => item.status === "queued" || item.status === "running");
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => { void load().then((items) => { if (items) setExecutions(items); }); }, 4000);
    return () => window.clearInterval(timer);
  }, [inFlight, load]);

  async function build() {
    if (busy || selected.length === 0) return;
    const preset = NOTEBOOK_STUDIO_OUTPUTS.find((item) => item.key === output)!;
    setBusy(true); onError("");
    const response = await fetch("/api/client-runtime/executions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        surface: "notebook",
        title: `${preset.label} · ${selected.length} source${selected.length === 1 ? "" : "s"}`,
        notebookOutput: output,
        instruction,
        sourceIds: selected.map((source) => source.id),
        notebookScope,
        artifactIntent: "brief",
      }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) onError(typeof data?.error === "string" ? data.error : "notebook_studio_queue_failed");
    else {
      setInstruction("");
      const items = await load();
      if (items) setExecutions(items);
    }
    setBusy(false);
  }

  async function download(artifactId: string) {
    const response = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.downloadUrl !== "string") { onError(typeof data?.error === "string" ? data.error : "artifact_download_failed"); return; }
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  async function review(artifactId: string) {
    setReviewing(artifactId); onError(""); setReviewDraft(null);
    try {
      const lookup = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" });
      const data = await lookup.json().catch(() => null);
      if (!lookup.ok || typeof data?.downloadUrl !== "string") throw new Error("The saved draft could not be opened for review.");
      const url = new URL(data.downloadUrl, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/client-runtime/artifacts/")) throw new Error("The draft link could not be verified as a private workspace file.");
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("The saved draft could not be loaded. Try again or download it.");
      if (!/^text\/(?:markdown|plain)(?:;|$)/i.test(response.headers.get("content-type") ?? "")) throw new Error("This file type cannot be previewed here. Download it to review.");
      const length = Number(response.headers.get("content-length"));
      if (Number.isFinite(length) && length > 200_000) throw new Error("This draft is too large for in-app review. Download it to inspect.");
      if (!response.body) throw new Error("Draft preview is temporarily unavailable.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      let content = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 200_000) {
          await reader.cancel();
          throw new Error("This draft is too large for in-app review. Download it to inspect.");
        }
        content += decoder.decode(chunk.value, { stream: true });
      }
      content += decoder.decode();
      setReviewDraft({ artifactId, content });
    } catch (reviewError) {
      onError(reviewError instanceof Error ? reviewError.message : "Draft preview failed. Try again or download it.");
    } finally {
      setReviewing(null);
    }
  }

  return <>
    <SourcePicker sources={sources} selectedIds={selected.map((source) => source.id)} onToggle={onToggle}
      hint="The document is written from these sources only." />
    <LanePanel icon={<Sparkles size={17} />} eyebrow="Tenant Notebook · studio" title="Build a document"
      body="Turn selected sources into a document held in tenant storage. Audio and presentation outputs are deliberately absent — they need a media provider this lane does not have.">
      <div className="flex flex-wrap gap-2">
        {NOTEBOOK_STUDIO_OUTPUTS.map((item) => <button key={item.key} type="button" onClick={() => setOutput(notebookStudioOutput(item.key))}
          className="rounded-md border px-3 py-2 text-[11px]"
          style={{ color: output === item.key ? "#07111d" : "var(--cream-dim)", background: output === item.key ? "#60a5fa" : "rgba(255,255,255,0.03)", borderColor: output === item.key ? "#60a5fa" : "var(--line-soft)" }}>{item.label}</button>)}
      </div>
      <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Any extra direction — audience, length, what must be covered. Optional."
        className="mt-3 min-h-[70px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={FIELD} />
      <button type="button" onClick={() => void build()} disabled={busy || selected.length === 0}
        className="mt-3 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40"
        style={{ background: "#60a5fa", color: "#07111d" }}>
        {busy ? <LoaderCircle size={13} className="animate-spin" /> : <FileText size={13} />}Build the document
      </button>
      {selected.length === 0 && <p className="mt-2 text-[10px]" style={{ color: "var(--cream-mute)" }}>Select at least one source above.</p>}
      {selected.length > 0 && <p className="mt-2 text-[10px]" style={{ color: "var(--cream-mute)" }}>Drafts are grounded in tenant-verified sources and keep a source register.</p>}
      <div className="mt-4 space-y-2">
        {executions.map((execution) => <div key={execution.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3" style={{ borderColor: "var(--line-soft)" }}>
          <div className="min-w-0">
            <p className="truncate text-[12px]" style={{ color: "var(--cream)" }}>{execution.title || "Notebook document"}</p>
            <p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{execution.status}{execution.errorCode ? ` · ${execution.errorCode}` : ""}{execution.createdAt ? ` · ${new Date(execution.createdAt).toLocaleString()}` : ""}</p>
            {!!execution.sourceReferences?.length && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]" aria-label="Draft sources">
              {execution.sourceReferences.map((source) => <span key={source.id} className="inline-flex flex-wrap items-center gap-2" style={{ color: "var(--cream-mute)" }}>
                <span>{source.title}</span>
                {source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: "#60a5fa" }}>Source</a>}
                {source.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="underline" style={{ color: "#60a5fa" }}>{link.text || "Resource"}</a>)}
              </span>)}
            </div>}
          </div>
          {execution.artifactId && <div className="flex items-center gap-2">
            <button type="button" onClick={() => void review(execution.artifactId!)} disabled={reviewing === execution.artifactId}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px] disabled:opacity-50" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>
              {reviewing === execution.artifactId ? <LoaderCircle size={12} className="animate-spin" /> : <Eye size={12} />}Review
            </button>
            <button type="button" onClick={() => void download(execution.artifactId!)}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Download size={12} />Download</button>
          </div>}
          {reviewDraft?.artifactId === execution.artifactId && <pre className="basis-full max-h-80 w-full overflow-auto whitespace-pre-wrap rounded-md border p-3 text-[11px] leading-relaxed" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }} aria-label="Draft content for review">{reviewDraft.content}</pre>}
        </div>)}
      </div>
    </LanePanel>
  </>;
}

/** Assets: the tenant artifacts API, with authenticated downloads. */
function AssetsLane({ onError }: { onError: (value: string) => void }) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/client-runtime/artifacts", { cache: "no-store" }).catch(() => null);
      const data = await response?.json().catch(() => null);
      if (cancelled) return;
      if (!response?.ok) onError(typeof data?.error === "string" ? data.error : "artifact_list_failed");
      else setArtifacts(Array.isArray(data?.artifacts) ? data.artifacts as Artifact[] : []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [onError]);

  async function download(artifactId: string) {
    const response = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.downloadUrl !== "string") { onError(typeof data?.error === "string" ? data.error : "artifact_download_failed"); return; }
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  return <LanePanel icon={<FolderOpen size={17} />} eyebrow="Tenant Notebook · assets" title="Tenant artifacts"
    body="Everything you have imported here or produced through a run, with signed, time-limited downloads. Retention follows the tenant's storage lifecycle.">
    {loading ? <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>Loading tenant artifacts…</p>
      : artifacts.length === 0 ? <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>No tenant artifacts yet. Import a source or build a document to create one.</p>
      : <div className="space-y-2">{artifacts.map((artifact) => <div key={artifact.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3" style={{ borderColor: "var(--line-soft)" }}>
        <div className="min-w-0">
          <p className="truncate text-[12px]" style={{ color: "var(--cream)" }}>{artifact.original_name || "Untitled artifact"}</p>
          <p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{artifact.content_type || "unknown type"}{typeof artifact.byte_size === "number" ? ` · ${formatBytes(artifact.byte_size)}` : ""}{artifact.status ? ` · ${artifact.status}` : ""}</p>
        </div>
        <button type="button" onClick={() => void download(artifact.id)} disabled={artifact.status !== "ready"}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px] disabled:opacity-40" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Download size={12} />Download</button>
      </div>)}</div>}
  </LanePanel>;
}

function SourcePicker({ sources, selectedIds, onToggle, hint }: { sources: NotebookSource[]; selectedIds: string[]; onToggle: (id: string) => void; hint: string }) {
  return <section className="panel p-4 md:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Sources</h3>
      <span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{selectedIds.length} of {sources.length} selected</span>
    </div>
      <p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>{hint} Select up to 5 sources.</p>
    {sources.length === 0
      ? <p className="mt-3 text-[11px]" style={{ color: "var(--cream-mute)" }}>No notebook sources yet. Add one in the library or research tab.</p>
      : <div className="mt-3 flex flex-wrap gap-2">{sources.map((source) => {
          const active = selectedIds.includes(source.id);
          return <button key={source.id} type="button" onClick={() => onToggle(source.id)}
            className="max-w-full truncate rounded-md border px-3 py-2 text-[11px]"
            style={{ color: active ? "#07111d" : "var(--cream-dim)", background: active ? "#60a5fa" : "rgba(255,255,255,0.03)", borderColor: active ? "#60a5fa" : "var(--line-soft)" }}>{source.title || "Untitled source"}</button>;
        })}</div>}
  </section>;
}

function LanePanel({ icon, eyebrow, title, body, children }: { icon: React.ReactNode; eyebrow: string; title: string; body: string; children: React.ReactNode }) {
  return <section className="panel p-5 md:p-6">
    <div className="flex items-start gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md" style={{ color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)", background: "rgba(96,165,250,0.1)" }}>{icon}</div>
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-2 text-[19px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{title}</h2>
        <p className="mt-2 max-w-2xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{body}</p>
      </div>
    </div>
    <div className="mt-5">{children}</div>
  </section>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
