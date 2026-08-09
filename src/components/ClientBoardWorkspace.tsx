"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Columns3, Download, LoaderCircle, Play, Plus, RotateCw, Trash2, TriangleAlert, X } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import {
  BOARD_COLUMNS, BOARD_PRIORITIES, boardCanBuild, boardColumnTasks, boardCounts, boardPriorityLabel,
  boardStatusLabel, boardStatuses, boardTimeAgo,
  type BoardComment, type BoardEvent, type BoardKind, type BoardTask,
} from "@/lib/clientBoardAdapter";

const COPY: Record<BoardKind, { eyebrow: string; title: string; description: string; accent: string }> = {
  kanban: {
    eyebrow: "III. Orchestrate · Work board",
    title: "Kanban",
    description: "A tenant work board with real stages, assignees, priorities, comments, and an event trail. Tasks are tenant rows, not a laptop SQLite database behind a CLI.",
    accent: "#60a5fa",
  },
  "agent-kanban": {
    eyebrow: "III. Orchestrate · Team board",
    title: "Agent Kanban",
    description: "Cards an agent builds. Each build runs through the approved hosted lane and ships a real tenant artifact with a sandboxed preview.",
    accent: "#5eead4",
  },
};

export default function ClientBoardWorkspace({ board }: { board: BoardKind }) {
  const copy = COPY[board];
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [events, setEvents] = useState<BoardEvent[]>([]);
  const [composer, setComposer] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/client-runtime/boards?board=${encodeURIComponent(board)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) { setError(typeof data?.error === "string" ? data.error : "board_read_failed"); return; }
    if (data?.configured === false) { setConfigured(false); setError("board_schema_missing"); return; }
    setConfigured(true);
    setError("");
    const next = Array.isArray(data?.tasks) ? data.tasks as BoardTask[] : [];
    setTasks(next);
    setSelectedId((current) => current && next.some((task) => task.id === current) ? current : null);
  }, [board]);

  useEffect(() => { setSelectedId(null); void load(); }, [load]);

  const inFlight = tasks.some((task) => task.executionState === "queued" || task.executionState === "running");
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => { void load(); }, 3000);
    return () => window.clearInterval(timer);
  }, [inFlight, load]);

  const loadDetail = useCallback(async (taskId: string) => {
    const response = await fetch(`/api/client-runtime/boards?board=${encodeURIComponent(board)}&taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) return;
    setComments(Array.isArray(data?.comments) ? data.comments as BoardComment[] : []);
    setEvents(Array.isArray(data?.events) ? data.events as BoardEvent[] : []);
  }, [board]);

  useEffect(() => { if (selectedId) void loadDetail(selectedId); else { setComments([]); setEvents([]); } }, [selectedId, loadDetail]);

  async function call(init: RequestInit, key: string, query = "") {
    setBusy(key); setError("");
    const response = await fetch(`/api/client-runtime/boards${query}`, init).catch(() => null);
    const data = await response?.json().catch(() => null);
    setBusy("");
    if (!response?.ok) { setError(typeof data?.error === "string" ? data.error : "board_request_failed"); return null; }
    await load();
    if (selectedId) await loadDetail(selectedId);
    return data as Record<string, unknown>;
  }

  const json = (payload: Record<string, unknown>, method = "POST"): RequestInit =>
    ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

  async function openArtifact(artifactId: string) {
    const response = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.downloadUrl !== "string") { setError("artifact_download_failed"); return; }
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  const counts = useMemo(() => boardCounts(tasks), [tasks]);
  const selected = tasks.find((task) => task.id === selectedId) ?? null;

  if (!configured) return <div className="space-y-5 pb-8">
    <section className="panel p-6 text-center">
      <TriangleAlert size={24} className="mx-auto" style={{ color: "#fbbf24" }} />
      <h2 className="mt-3 text-[14px] font-semibold" style={{ color: "var(--cream)" }}>Board tables are not in this tenant yet</h2>
      <p className="mx-auto mt-2 max-w-[520px] text-[11.5px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>
        Apply <span className="font-mono">product-experience/supabase-client-boards.sql</span> to this Supabase project, then reload.
      </p>
    </section>
    <ClientRuntimeNotice code="board_schema_missing" />
  </div>;

  return <div className="space-y-5 pb-8">
    <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: copy.accent, borderColor: `${copy.accent}52`, background: `${copy.accent}1f` }}><Columns3 size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{copy.title}</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{copy.description}</p>
        </div>
        <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: "rgba(90,184,150,0.28)", color: "#5ab896", background: "rgba(90,184,150,0.1)" }}>Tenant rows · RLS</div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {BOARD_COLUMNS[board].map((column) => <span key={column.key} className="rounded-md border px-2.5 py-1.5 text-[10.5px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>
          {column.label} · {counts[column.key] ?? 0}
        </span>)}
      </div>
    </section>

    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
        <div className="flex items-center gap-2">
          <Columns3 size={14} color={copy.accent} />
          <h2 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Board</h2>
          <span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{tasks.length} tasks</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} title="Refresh board" className="p-1.5" style={{ color: "var(--cream-mute)" }}><RotateCw size={13} /></button>
          <button type="button" onClick={() => setComposer((value) => !value)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-semibold" style={{ background: copy.accent, color: "#07111d" }}><Plus size={12} />{board === "kanban" ? "Add task" : "Add card"}</button>
        </div>
      </div>
      {composer && <div className="border-b p-4" style={{ borderColor: "var(--line-soft)", background: `${copy.accent}0d` }}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold" style={{ color: copy.accent }}>New {board === "kanban" ? "task" : "card"}</p>
          <button type="button" onClick={() => setComposer(false)} title="Close" style={{ color: "var(--cream-mute)" }}><X size={14} /></button>
        </div>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className="mt-3 w-full rounded-md border px-3 py-2.5 text-[12px]" style={field} />
        <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={board === "kanban" ? "Details, acceptance criteria, context" : "Brief for the agent to build from"} className="mt-2 min-h-[84px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px]" style={field} />
        <button type="button" disabled={!title.trim() || busy === "create"} onClick={async () => { if (await call(json({ action: "create", board, title: title.trim(), body: body.trim() }), "create")) { setTitle(""); setBody(""); setComposer(false); } }}
          className="mt-3 inline-flex items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold disabled:opacity-40" style={{ background: copy.accent, color: "#07111d" }}>
          {busy === "create" ? <LoaderCircle size={12} className="animate-spin" /> : <Plus size={12} />}Create
        </button>
      </div>}

      <div className="overflow-x-auto p-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${BOARD_COLUMNS[board].length}, minmax(180px, 1fr))`, minWidth: `${BOARD_COLUMNS[board].length * 190}px` }}>
          {BOARD_COLUMNS[board].map((column) => {
            const columnTasks = boardColumnTasks(tasks, column.key);
            return <div key={column.key}>
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--cream-dim)" }}>{column.label}</span>
                <span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{columnTasks.length}</span>
              </div>
              <div className="min-h-[150px] space-y-2 rounded-md border p-2" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.018)" }}>
                {columnTasks.map((task) => <motion.button layout key={task.id} type="button" onClick={() => setSelectedId(task.id)}
                  className="w-full rounded-md border p-2.5 text-left"
                  style={{ borderColor: task.id === selectedId ? `${copy.accent}80` : "var(--line-soft)", background: task.id === selectedId ? `${copy.accent}14` : "var(--panel)" }}>
                  <p className="line-clamp-2 text-[11.5px] font-medium leading-snug" style={{ color: "var(--cream)" }}>{task.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[9.5px]" style={{ color: "var(--cream-mute)" }}>
                    <span>{boardPriorityLabel(task.priority)}</span>
                    {task.assignee && <span>· {task.assignee}</span>}
                    {task.buildArtifactId && <span style={{ color: "#5ab896" }}>· artifact</span>}
                    <span>· {boardTimeAgo(task.createdAt)}</span>
                  </div>
                  {(task.executionState === "queued" || task.executionState === "running") && <p className="mt-1.5 flex items-center gap-1 text-[9.5px]" style={{ color: "#fbbf24" }}><LoaderCircle size={9} className="animate-spin" />{task.executionState}</p>}
                  {task.executionState === "failed" && <p className="mt-1.5 text-[9.5px]" style={{ color: "#fca5a5" }}>{task.executionError ?? "failed"}</p>}
                </motion.button>)}
                {columnTasks.length === 0 && <p className="px-1 py-4 text-center text-[10px]" style={{ color: "var(--cream-mute)" }}>Empty</p>}
              </div>
            </div>;
          })}
        </div>
      </div>
    </section>

    {selected && <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{selected.title}</p>
          <p className="mt-0.5 text-[10px]" style={{ color: "var(--cream-mute)" }}>{boardStatusLabel(selected)}</p>
        </div>
        <button type="button" onClick={() => { setSelectedId(null); void call({ method: "DELETE" }, "delete", `?id=${encodeURIComponent(selected.id)}`); }} title="Delete" className="rounded-md border p-1.5" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}><Trash2 size={12} /></button>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="space-y-3">
          {selected.body && <p className="whitespace-pre-wrap rounded-md border p-2.5 text-[11.5px] leading-relaxed" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.018)", color: "var(--cream-dim)" }}>{selected.body}</p>}
          {selected.buildPreviewHtml && <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Sandboxed deliverable preview</p>
            <iframe title={`${selected.title} deliverable`} sandbox="" referrerPolicy="no-referrer" srcDoc={sandboxed(selected.buildPreviewHtml)} className="h-[240px] w-full rounded-md border bg-white" style={{ borderColor: "var(--line-soft)" }} />
          </div>}
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Comments · {comments.length}</p>
            <div className="space-y-2">{comments.map((entry) => <div key={entry.id} className="rounded-md border p-2.5 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>
              {entry.body}<span className="mt-1 block text-[9.5px]" style={{ color: "var(--cream-mute)" }}>{boardTimeAgo(entry.createdAt)}</span>
            </div>)}</div>
            <div className="mt-2 flex gap-2">
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a comment" className="min-w-0 flex-1 rounded-md border px-2.5 py-2 text-[11px]" style={field} />
              <button type="button" disabled={!draft.trim() || busy === "comment"} onClick={async () => { if (await call(json({ action: "comment", taskId: selected.id, body: draft.trim() }), "comment")) setDraft(""); }}
                className="shrink-0 rounded-md border px-2.5 py-2 text-[10px] disabled:opacity-40" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>Post</button>
            </div>
          </div>
        </div>

        <aside className="space-y-2">
          <select value={selected.status} onChange={(event) => void call(json({ id: selected.id, board, status: event.target.value }, "PATCH"), "status")} className="w-full rounded-md border px-2.5 py-2 text-[11px]" style={field} aria-label="Status">
            {boardStatuses(board).map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select value={selected.priority} onChange={(event) => void call(json({ id: selected.id, board, priority: Number(event.target.value) }, "PATCH"), "priority")} className="w-full rounded-md border px-2.5 py-2 text-[11px]" style={field} aria-label="Priority">
            {BOARD_PRIORITIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
          <input defaultValue={selected.assignee ?? ""} onBlur={(event) => { if (event.target.value.trim() !== (selected.assignee ?? "")) void call(json({ id: selected.id, board, assignee: event.target.value.trim() || null }, "PATCH"), "assignee"); }}
            placeholder="Assignee" className="w-full rounded-md border px-2.5 py-2 text-[11px]" style={field} />
          {boardCanBuild(selected) && <button type="button" disabled={busy === "build"} onClick={() => void call(json({ action: "build", taskId: selected.id }), "build")}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[11px] font-semibold disabled:opacity-40" style={{ background: copy.accent, color: "#07111d" }}>
            {busy === "build" ? <LoaderCircle size={12} className="animate-spin" /> : <Play size={12} />}Build it
          </button>}
          {selected.buildArtifactId && <button type="button" onClick={() => openArtifact(selected.buildArtifactId!)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-[10.5px]" style={{ borderColor: `${copy.accent}59`, color: copy.accent }}><Download size={11} />Signed download</button>}
          {events.length > 0 && <div className="pt-1">
            <p className="mb-1 text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Event trail</p>
            <div className="space-y-1">{events.slice(0, 8).map((entry) => <p key={entry.id} className="text-[9.5px]" style={{ color: "var(--cream-mute)" }}>{entry.kind} · {boardTimeAgo(entry.createdAt)}</p>)}</div>
          </div>}
        </aside>
      </div>
    </section>}

    {error && <ClientRuntimeNotice code={error} />}
  </div>;
}

const field = { color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" } as const;

function sandboxed(html: string) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;">`;
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<head([^>]*)>/i, `<head$1>${policy}`);
}
