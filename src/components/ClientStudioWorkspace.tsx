"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, FileText, Info, LoaderCircle, Play, RotateCw, Sparkles, Terminal } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import ClientSpendMeter from "@/components/ClientSpendMeter";
import { studioGoal, studioSurface } from "@/lib/clientStudioSurfaces";
import type { ClientTerminalEvent, ClientWorkspaceSurface } from "@/lib/clientWorkspaceExecution";

type Execution = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  provider: string | null;
  model: string | null;
  errorCode: string | null;
  createdAt: string | null;
  finishedAt: string | null;
  title: string | null;
  artifactIntent: "preview" | "brief" | null;
  artifactId: string | null;
  previewHtml: string | null;
  terminalEvents: ClientTerminalEvent[];
};

export default function ClientStudioWorkspace({ surface }: { surface: ClientWorkspaceSurface }) {
  const config = studioSurface(surface);
  const [tab, setTab] = useState<"build" | "gallery">("build");
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/client-runtime/executions?surface=${encodeURIComponent(surface)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) { setError(typeof data?.error === "string" ? data.error : "workspace_execution_read_failed"); return; }
    setError("");
    const next = Array.isArray(data?.executions) ? data.executions as Execution[] : [];
    setExecutions(next);
    setSelectedId((current) => current && next.some((item) => item.id === current) ? current : (next[0]?.id ?? null));
  }, [surface]);

  useEffect(() => { setValues({}); setTab("build"); void load(); }, [surface, load]);

  const inFlight = executions.some((item) => item.status === "queued" || item.status === "running");
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [inFlight, load]);

  async function run() {
    if (!config || busy) return;
    const title = values.title?.trim();
    const goal = values.goal?.trim();
    if (!title || !goal) return;
    setBusy(true); setError("");
    const response = await fetch("/api/client-runtime/executions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        surface, title,
        goal: studioGoal({ goal, reference: values.reference }),
        artifactIntent: config.artifactIntent,
      }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(typeof data?.error === "string" ? data.error : "workspace_execution_queue_failed");
    else {
      setValues({});
      await load();
      if (typeof data?.jobId === "string") setSelectedId(data.jobId);
    }
    setBusy(false);
  }

  async function download(artifactId: string) {
    const response = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.downloadUrl !== "string") { setError(typeof data?.error === "string" ? data.error : "artifact_download_failed"); return; }
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  const selected = useMemo(() => executions.find((item) => item.id === selectedId) ?? null, [executions, selectedId]);
  const shipped = useMemo(() => executions.filter((item) => item.artifactId), [executions]);

  if (!config) return <ClientRuntimeNotice code="capability_not_enabled" />;
  const ready = Boolean(values.title?.trim() && values.goal?.trim());

  return <div className="space-y-5 pb-8">
    <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: config.accent, borderColor: `${config.accent}52`, background: `${config.accent}1f` }}><Sparkles size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{config.eyebrow}</p>
          <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{config.title}</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{config.description}</p>
        </div>
        <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: "rgba(90,184,150,0.28)", color: "#5ab896", background: "rgba(90,184,150,0.1)" }}>Tenant artifact</div>
      </div>
      <div className="mt-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--line-soft)" }}>
        {(["build", "gallery"] as const).map((item) => <button key={item} type="button" onClick={() => setTab(item)}
          className="border-b-2 px-3 py-2 text-[11px] font-medium capitalize"
          style={{ borderColor: tab === item ? config.accent : "transparent", color: tab === item ? "var(--cream)" : "var(--cream-mute)" }}>
          {item === "gallery" ? `${config.outputNoun} · ${shipped.length}` : config.action}
        </button>)}
      </div>
    </section>

    <ClientSpendMeter />

    {config.pendingCapability && <section className="panel flex items-start gap-2.5 p-3.5">
      <Info size={14} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
      <p className="text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{config.pendingCapability}</p>
    </section>}

    {tab === "build" ? <section className="panel p-4 md:p-5">
      <div className="flex flex-wrap gap-2">
        {config.presets.map((preset) => <button key={preset.label} type="button"
          onClick={() => setValues({ title: preset.title, goal: preset.goal })}
          className="rounded-md border px-3 py-2 text-[11px]"
          style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)", background: "rgba(255,255,255,0.025)" }}>{preset.label}</button>)}
      </div>

      <div className="mt-4 space-y-2.5">
        {config.fields.map((field) => field.multiline
          ? <label key={field.key} className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>{field.label}{field.optional ? " · optional" : ""}</span>
              <textarea value={values[field.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                placeholder={field.placeholder} className="min-h-[96px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={fieldStyle} />
            </label>
          : <label key={field.key} className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>{field.label}{field.optional ? " · optional" : ""}</span>
              <input value={values[field.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                placeholder={field.placeholder} className="w-full rounded-md border px-3 py-2.5 text-[12px]" style={fieldStyle} />
            </label>)}
      </div>

      <button type="button" disabled={!ready || busy} onClick={() => void run()}
        className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40"
        style={{ background: config.accent, color: "#07111d" }}>
        {busy ? <LoaderCircle size={13} className="animate-spin" /> : config.artifactIntent === "preview" ? <Play size={13} /> : <FileText size={13} />}
        {busy ? "Queueing" : config.action}
      </button>
    </section> : <section className="panel p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Everything shipped from this surface</p>
        <button type="button" onClick={() => void load()} title="Refresh" className="p-1.5" style={{ color: "var(--cream-mute)" }}><RotateCw size={13} /></button>
      </div>
      {shipped.length === 0 ? <p className="py-8 text-center text-[11.5px]" style={{ color: "var(--cream-mute)" }}>
        No {config.outputNoun} yet. Anything you {config.action.toLowerCase()} lands here with a signed download.
      </p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shipped.map((item) => <motion.div key={item.id} layout className="flex flex-col overflow-hidden rounded-xl border" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.025)" }}>
          {item.previewHtml ? <button type="button" onClick={() => void download(item.artifactId!)} className="relative block aspect-[16/10] w-full overflow-hidden" style={{ background: "#05080d" }}>
            <iframe title={`${item.title ?? "Output"} preview`} sandbox="" referrerPolicy="no-referrer" srcDoc={sandboxed(item.previewHtml)} aria-hidden="true" tabIndex={-1}
              className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white" style={{ width: "250%", height: "250%", transform: "scale(0.4)" }} />
          </button> : <div className="grid aspect-[16/10] place-items-center" style={{ background: "rgba(255,255,255,0.02)", color: "var(--cream-mute)" }}><FileText size={20} /></div>}
          <div className="flex flex-1 flex-col gap-2 p-3">
            <p className="text-[12px] font-medium leading-snug" style={{ color: "var(--cream)" }}>{item.title ?? "Untitled"}</p>
            <p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{item.model ?? item.provider ?? ""}</p>
            <button type="button" onClick={() => void download(item.artifactId!)} className="mt-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium" style={{ background: `${config.accent}26`, color: config.accent }}>
              <Download size={11} />Signed download
            </button>
          </div>
        </motion.div>)}
      </div>}
    </section>}

    <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
          <h2 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Run history</h2>
          <button type="button" onClick={() => void load()} title="Refresh history" className="p-1.5" style={{ color: "var(--cream-mute)" }}><RotateCw size={13} /></button>
        </div>
        <div className="max-h-[380px] overflow-y-auto p-2">
          {executions.length === 0 && <p className="p-4 text-[11px]" style={{ color: "var(--cream-mute)" }}>Nothing run here yet.</p>}
          {executions.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}
            className="mb-2 w-full rounded-md border p-2.5 text-left"
            style={{ borderColor: item.id === selectedId ? `${config.accent}80` : "var(--line-soft)", background: item.id === selectedId ? `${config.accent}14` : "transparent" }}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11.5px] font-medium" style={{ color: "var(--cream)" }}>{item.title ?? "Untitled"}</span>
              <Status status={item.status} />
            </div>
            {item.errorCode && <p className="mt-1 text-[10px]" style={{ color: "#fca5a5" }}>{item.errorCode}</p>}
          </button>)}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
          <Terminal size={14} color={config.accent} />
          <h2 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Run detail</h2>
        </div>
        {selected ? <>
          <pre className="max-h-[200px] min-h-[120px] overflow-auto p-4 text-[11px] leading-6" style={{ color: "var(--cream-dim)" }}>
            {selected.terminalEvents.length ? selected.terminalEvents.map((event) => `${event.stream === "stderr" ? "!" : ">"} ${event.message}`).join("\n") : "Awaiting worker events."}
          </pre>
          {selected.previewHtml && <div className="border-t p-3" style={{ borderColor: "var(--line-soft)" }}>
            <iframe title={`${selected.title ?? "Output"} preview`} sandbox="" referrerPolicy="no-referrer" srcDoc={sandboxed(selected.previewHtml)} className="h-[280px] w-full rounded-md border bg-white" style={{ borderColor: "var(--line-soft)" }} />
          </div>}
          {selected.artifactId && <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}>
            <span>Retained in tenant storage.</span>
            <button type="button" onClick={() => void download(selected.artifactId!)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5" style={{ borderColor: `${config.accent}59`, color: config.accent }}><Download size={11} />Signed download</button>
          </div>}
        </> : <p className="p-4 text-[11px]" style={{ color: "var(--cream-mute)" }}>Select a run to see its trail and output.</p>}
      </div>
    </section>

    {error && <ClientRuntimeNotice code={error} />}
  </div>;
}

function Status({ status }: { status: Execution["status"] }) {
  const color = status === "succeeded" ? "#5ab896" : status === "failed" || status === "cancelled" ? "#fca5a5" : "#fbbf24";
  return <span className="shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em]" style={{ color, borderColor: `${color}55`, background: `${color}12` }}>{status}</span>;
}

const fieldStyle = { color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" } as const;

function sandboxed(html: string) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;">`;
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<head([^>]*)>/i, `<head$1>${policy}`);
}
