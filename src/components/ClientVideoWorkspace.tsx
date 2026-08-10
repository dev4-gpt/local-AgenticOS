"use client";

// The hosted Video studio: Script, Storyboard, Library. See
// clientVideoWorkspace.ts for which local lanes are provider-bound and why the
// Library exists at all.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clapperboard, Download, FileText, Info, LoaderCircle, Upload } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import {
  VIDEO_GATES,
  VIDEO_LENGTHS,
  VIDEO_SCRIPT_PRESETS,
  VIDEO_STORYBOARD_PRESETS,
  VIDEO_TABS,
  videoLength,
  videoScriptGoal,
  videoStoryboardGoal,
  videoTitle,
  type VideoLength,
  type VideoTab,
} from "@/lib/clientVideoWorkspace";

type Execution = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  errorCode: string | null;
  createdAt: string | null;
  title: string | null;
  artifactId: string | null;
};

const ACCENT = "#f87171";
const FIELD = { color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" } as const;

export default function ClientVideoWorkspace() {
  const [tab, setTab] = useState<VideoTab>("script");
  const [subject, setSubject] = useState("");
  const [direction, setDirection] = useState("");
  const [source, setSource] = useState("");
  const [length, setLength] = useState<VideoLength>("standard");
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/client-runtime/executions?surface=video", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) { setError(typeof data?.error === "string" ? data.error : "workspace_execution_read_failed"); return; }
    setError("");
    setExecutions(Array.isArray(data?.executions) ? data.executions as Execution[] : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const inFlight = executions.some((item) => item.status === "queued" || item.status === "running");
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [inFlight, load]);

  const library = useMemo(() => executions.filter((item) => item.artifactId), [executions]);
  const scripts = useMemo(() => library.filter((item) => (item.title ?? "").startsWith("Script")), [library]);
  const storyboards = useMemo(() => library.filter((item) => (item.title ?? "").startsWith("Storyboard")), [library]);
  const writing = tab === "script";
  const presets = writing ? VIDEO_SCRIPT_PRESETS : VIDEO_STORYBOARD_PRESETS;

  async function run() {
    if (busy || !subject.trim() || !direction.trim()) return;
    setBusy(true); setError("");
    const goal = writing
      ? videoScriptGoal({ subject, direction, length, source })
      : videoStoryboardGoal({ subject, direction, source });
    const response = await fetch("/api/client-runtime/executions", {
      method: "POST", headers: { "content-type": "application/json" },
      // A script is performed, so it is copy. A storyboard is a plan, so it is not.
      body: JSON.stringify({ surface: "video", title: videoTitle({ tab, subject }), goal, artifactIntent: writing ? "copy" : "brief" }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(typeof data?.error === "string" ? data.error : "workspace_execution_queue_failed");
    else { setSource(""); await load(); setTab("library"); }
    setBusy(false);
  }

  async function download(artifactId: string) {
    const response = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.downloadUrl !== "string") { setError(typeof data?.error === "string" ? data.error : "artifact_download_failed"); return; }
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  const ready = Boolean(subject.trim() && direction.trim());

  return <div className="space-y-5 pb-8">
    <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: ACCENT, borderColor: `${ACCENT}52`, background: `${ACCENT}1f` }}><Clapperboard size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">IV. Create · Video</p>
          <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>Video Studio</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
            Get the script and the shot plan right before anyone pays to render. Presenter and programmatic rendering each activate with their own approved provider.
          </p>
        </div>
        <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: `${ACCENT}47`, color: ACCENT, background: `${ACCENT}1a` }}>
          {scripts.length} scripts · {storyboards.length} storyboards
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--line-soft)" }}>
        {VIDEO_TABS.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)}
          className="border-b-2 px-3 py-2 text-[11px] font-medium"
          style={{ borderColor: tab === item.key ? ACCENT : "transparent", color: tab === item.key ? "var(--cream)" : "var(--cream-mute)" }}>
          {item.key === "library" ? `${item.label} · ${library.length}` : item.label}
        </button>)}
      </div>
    </section>

    {error && <ClientRuntimeNotice code={error} />}

    {tab !== "library" && <>
      <section className="panel p-4 md:p-5">
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => <button key={preset.label} type="button" onClick={() => setDirection(preset.direction)}
            className="rounded-md border px-3 py-2 text-[11px]"
            style={{ borderColor: direction === preset.direction ? ACCENT : "var(--line-soft)", color: direction === preset.direction ? ACCENT : "var(--cream-dim)", background: "rgba(255,255,255,0.025)" }}>{preset.label}</button>)}
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>{writing ? "What the video is about" : "Which video"}</span>
          <input value={subject} onChange={(event) => setSubject(event.target.value)}
            placeholder={writing ? "The subject and the audience" : "The video this storyboard is for"}
            className="w-full rounded-md border px-3 py-2.5 text-[12px]" style={FIELD} />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>{writing ? "What it must land" : "The edit"}</span>
          <textarea value={direction} onChange={(event) => setDirection(event.target.value)}
            placeholder={writing ? "The one thing a viewer should remember, and the tone." : "Pacing, and any footage you already have."}
            className="min-h-[92px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={FIELD} />
        </label>

        {writing && <div className="mt-3 flex flex-wrap gap-2">
          {VIDEO_LENGTHS.map((item) => <button key={item.key} type="button" onClick={() => setLength(videoLength(item.key))}
            className="rounded-md border px-3 py-1.5 text-[11px]"
            style={{ color: length === item.key ? "#07111d" : "var(--cream-dim)", background: length === item.key ? ACCENT : "rgba(255,255,255,0.03)", borderColor: length === item.key ? ACCENT : "var(--line-soft)" }}>{item.label}</button>)}
        </div>}

        <label className="mt-3 block">
          <span className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>
            <Upload size={11} />{writing ? "Source material · optional" : "The script · optional"}
          </span>
          <textarea value={source} onChange={(event) => setSource(event.target.value)}
            placeholder={writing ? "Paste notes, a transcript, or an article this should be built from." : "Paste the script this storyboard should follow."}
            className="min-h-[76px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={FIELD} />
          <span className="mt-1 block text-[10px]" style={{ color: "var(--cream-mute)" }}>Passed as material you supplied. Nothing here is fetched, and the run is told not to claim otherwise.</span>
        </label>

        <button type="button" disabled={!ready || busy} onClick={() => void run()}
          className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40"
          style={{ background: ACCENT, color: "#07111d" }}>
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <FileText size={13} />}
          {busy ? "Queueing" : writing ? "Write the script" : "Build the storyboard"}
        </button>
      </section>

      {VIDEO_GATES.map((gate) => <section key={gate.title} className="panel flex items-start gap-2.5 p-3.5">
        <Info size={14} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          <span className="font-semibold" style={{ color: "var(--cream-soft)" }}>{gate.title}. </span>{gate.detail}
        </p>
      </section>)}
    </>}

    {tab === "library" && <section className="space-y-4">
      {library.length === 0 && executions.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>Nothing yet. Write a script or build a storyboard and it lands here.</div>}
      {([["Scripts", scripts], ["Storyboards", storyboards]] as const).map(([label, items]) => items.length > 0 && <div key={label}>
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>{label} · {items.length}</p>
        <div className="space-y-2">
          {items.map((execution) => <div key={execution.id} className="panel flex flex-wrap items-center justify-between gap-2 p-4">
            <div className="min-w-0">
              <p className="truncate text-[12px]" style={{ color: "var(--cream)" }}>{execution.title}</p>
              <p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{execution.createdAt ? new Date(execution.createdAt).toLocaleString() : ""}</p>
            </div>
            <button type="button" onClick={() => void download(execution.artifactId!)}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Download size={12} />Download</button>
          </div>)}
        </div>
      </div>)}
      {executions.filter((item) => !item.artifactId).map((execution) => <div key={execution.id} className="panel flex flex-wrap items-center justify-between gap-2 p-4">
        <div className="min-w-0">
          <p className="truncate text-[12px]" style={{ color: "var(--cream)" }}>{execution.title || "Video"}</p>
          <p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{execution.status}{execution.errorCode ? ` · ${execution.errorCode}` : ""}</p>
        </div>
        <span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{execution.status === "failed" ? "no artifact" : "working"}</span>
      </div>)}
    </section>}
  </div>;
}
