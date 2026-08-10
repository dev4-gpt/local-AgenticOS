"use client";

// Renders the multi-mode hosted surfaces (Video, Radar, Leads).
//
// Each surface has several genuinely different modes plus named blocked
// capabilities, which the single-purpose Batch A screen could not express.
// See clientDeepSurfaces.ts for why the blocked parts are stated rather than
// mimicked.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText, Info, LoaderCircle, Sparkles, Upload } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import ClientSpendMeter from "@/components/ClientSpendMeter";
import { deepGoal, deepMode, deepSurface } from "@/lib/clientDeepSurfaces";

type Execution = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  errorCode: string | null;
  createdAt: string | null;
  title: string | null;
  artifactId: string | null;
};

const FIELD = { color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" } as const;

export default function ClientDeepWorkspace({ surfaceKey }: { surfaceKey: string }) {
  const config = deepSurface(surfaceKey);
  const [modeKey, setModeKey] = useState(config?.modes[0]?.key ?? "");
  const [showLibrary, setShowLibrary] = useState(false);
  const [subject, setSubject] = useState("");
  const [direction, setDirection] = useState("");
  const [source, setSource] = useState("");
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!config) return;
    const response = await fetch(`/api/client-runtime/executions?surface=${encodeURIComponent(config.surface)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) { setError(typeof data?.error === "string" ? data.error : "workspace_execution_read_failed"); return; }
    setError("");
    setExecutions(Array.isArray(data?.executions) ? data.executions as Execution[] : []);
  }, [config]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    // The generation control is driven by the tenant's real capability list, so
    // the same build plans for one client and generates for another.
    (async () => {
      const response = await fetch("/api/capabilities", { cache: "no-store" }).catch(() => null);
      const data = await response?.json().catch(() => null);
      setCapabilities(response?.ok && Array.isArray(data?.capabilities) ? data.capabilities.map((item: { id: string }) => item.id) : []);
    })();
  }, []);

  const inFlight = executions.some((item) => item.status === "queued" || item.status === "running");
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [inFlight, load]);

  const shipped = useMemo(() => executions.filter((item) => item.artifactId), [executions]);

  async function run() {
    if (!config || busy || !subject.trim() || !direction.trim()) return;
    const mode = deepMode(config, modeKey);
    setBusy(true); setError("");
    const response = await fetch("/api/client-runtime/executions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        surface: config.surface,
        title: `${mode.label} · ${subject.trim().slice(0, 120)}`,
        goal: deepGoal({ mode, subject, direction, source }),
        artifactIntent: mode.artifactIntent,
      }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(typeof data?.error === "string" ? data.error : "workspace_execution_queue_failed");
    else { setSource(""); await load(); setShowLibrary(true); }
    setBusy(false);
  }

  /** Runs the surface's generation lane on the text already written here. */
  async function generate() {
    if (!config?.generation || generating) return;
    const material = [subject.trim(), direction.trim(), source.trim()].filter(Boolean).join("\n\n");
    if (!material) return;
    setGenerating(true); setError(""); setGenerated(null);
    const payload = config.generation.inputKind === "image"
      ? { prompt: material.slice(0, 4_000), size: "1024x1024", quality: "medium" }
      : { text: material.slice(0, 4_000) };
    const response = await fetch("/api/client-runtime/hosted-jobs", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ capability: config.generation.capability, provider: config.generation.provider, input: payload }),
    }).catch(() => null);
    const queued = await response?.json().catch(() => null);
    if (!response?.ok || typeof queued?.jobId !== "string") {
      setError(typeof queued?.error === "string" ? queued.error : "generation_queue_failed");
      setGenerating(false);
      return;
    }
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const poll = await fetch(`/api/client-runtime/jobs/${queued.jobId}`, { cache: "no-store" }).catch(() => null);
      const job = (await poll?.json().catch(() => null))?.job;
      if (job?.status === "succeeded") {
        const artifactId = typeof job.output_metadata?.artifactId === "string" ? job.output_metadata.artifactId : null;
        setGenerated(artifactId);
        if (!artifactId) setError("generation_produced_no_artifact");
        break;
      }
      if (job?.status === "failed" || job?.status === "cancelled") { setError(job.error_code || "generation_failed"); break; }
      if (attempt === 89) setError("generation_timed_out");
    }
    setGenerating(false);
    await load();
  }

  async function download(artifactId: string) {
    const response = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.downloadUrl !== "string") { setError(typeof data?.error === "string" ? data.error : "artifact_download_failed"); return; }
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  if (!config) return <ClientRuntimeNotice code="capability_not_enabled" />;
  const mode = deepMode(config, modeKey);
  const ready = Boolean(subject.trim() && direction.trim());

  return <div className="space-y-5 pb-8">
    <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: config.accent, borderColor: `${config.accent}52`, background: `${config.accent}1f` }}><Sparkles size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{config.eyebrow}</p>
          <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{config.title}</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{config.description}</p>
        </div>
        <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: `${config.accent}47`, color: config.accent, background: `${config.accent}1a` }}>Tenant artifact</div>
      </div>
      <div className="mt-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--line-soft)" }}>
        {config.modes.map((item) => <button key={item.key} type="button" onClick={() => { setModeKey(item.key); setShowLibrary(false); }}
          className="border-b-2 px-3 py-2 text-[11px] font-medium"
          style={{ borderColor: !showLibrary && modeKey === item.key ? config.accent : "transparent", color: !showLibrary && modeKey === item.key ? "var(--cream)" : "var(--cream-mute)" }}>{item.label}</button>)}
        <button type="button" onClick={() => setShowLibrary(true)}
          className="border-b-2 px-3 py-2 text-[11px] font-medium"
          style={{ borderColor: showLibrary ? config.accent : "transparent", color: showLibrary ? "var(--cream)" : "var(--cream-mute)" }}>
          {config.outputNoun} · {shipped.length}
        </button>
      </div>
    </section>

    <ClientSpendMeter />
    {error && <ClientRuntimeNotice code={error} />}

    {!showLibrary && <>
      <section className="panel p-4 md:p-5">
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{mode.description}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {mode.presets.map((preset) => <button key={preset.label} type="button" onClick={() => setDirection(preset.direction)}
            className="rounded-md border px-3 py-2 text-[11px]"
            style={{ borderColor: direction === preset.direction ? config.accent : "var(--line-soft)", color: direction === preset.direction ? config.accent : "var(--cream-dim)", background: "rgba(255,255,255,0.025)" }}>{preset.label}</button>)}
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>{mode.subjectLabel}</span>
          <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder={mode.subjectPlaceholder}
            className="w-full rounded-md border px-3 py-2.5 text-[12px]" style={FIELD} />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>{mode.directionLabel}</span>
          <textarea value={direction} onChange={(event) => setDirection(event.target.value)} placeholder={mode.directionPlaceholder}
            className="min-h-[92px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={FIELD} />
        </label>

        {mode.sourceLabel && <label className="mt-3 block">
          <span className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}><Upload size={11} />{mode.sourceLabel}</span>
          <textarea value={source} onChange={(event) => setSource(event.target.value)} placeholder={mode.sourcePlaceholder}
            className="min-h-[76px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={FIELD} />
          <span className="mt-1 block text-[10px]" style={{ color: "var(--cream-mute)" }}>Passed as material you supplied. Nothing here is fetched, and the run is told not to claim otherwise.</span>
        </label>}

        <button type="button" disabled={!ready || busy} onClick={() => void run()}
          className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40"
          style={{ background: config.accent, color: "#07111d" }}>
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <FileText size={13} />}{busy ? "Queueing" : mode.action}
        </button>
      </section>

      {config.generation && (capabilities?.includes(config.generation.capability)
        ? <section className="panel p-4 md:p-5">
            <p className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>{config.generation.action}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
              Runs the approved {config.generation.provider} lane on what you have written above. {config.generation.costHint}
            </p>
            <button type="button" disabled={generating || !subject.trim()} onClick={() => void generate()}
              className="mt-3 inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40"
              style={{ borderColor: `${config.accent}70`, color: config.accent, background: `${config.accent}14` }}>
              {generating ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {generating ? "Generating" : config.generation.action}
            </button>
            {generated && <button type="button" onClick={() => void download(generated)}
              className="mt-3 ml-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[10px]"
              style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Download size={12} />Download what it made</button>}
          </section>
        : null)}

      {config.gates.map((gate) => <section key={gate.title} className="panel flex items-start gap-2.5 p-3.5">
        <Info size={14} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          <span className="font-semibold" style={{ color: "var(--cream-soft)" }}>{gate.title}. </span>{gate.detail}
        </p>
      </section>)}
    </>}

    {showLibrary && <section className="space-y-2">
      {executions.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>Nothing yet. Anything you make lands here as a tenant artifact.</div>}
      {executions.map((execution) => <div key={execution.id} className="panel flex flex-wrap items-center justify-between gap-2 p-4">
        <div className="min-w-0">
          <p className="truncate text-[12px]" style={{ color: "var(--cream)" }}>{execution.title || config.title}</p>
          <p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>
            {execution.status}{execution.errorCode ? ` · ${execution.errorCode}` : ""}{execution.createdAt ? ` · ${new Date(execution.createdAt).toLocaleString()}` : ""}
          </p>
        </div>
        {execution.artifactId
          ? <button type="button" onClick={() => void download(execution.artifactId!)}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Download size={12} />Download</button>
          : <span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{execution.status === "failed" ? "no artifact" : "working"}</span>}
      </div>)}
    </section>}
  </div>;
}
