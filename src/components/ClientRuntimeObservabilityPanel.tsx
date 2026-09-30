"use client";

import Link from "next/link";
import { Activity, CheckCircle2, Clock3, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { usePollWhileVisible } from "@/lib/usePollWhileVisible";

type JobSummary = { total: number; succeeded: number; failed: number; active: number };
type RuntimeData = {
  windowHours: number;
  posthogConfigured: boolean;
  sample: { eventsLimited: boolean; jobsLimited: boolean; limit: number };
  counts: Record<string, number>;
  providerCounts: Record<string, JobSummary>;
  recentEvents: Array<{ event: string; createdAt: string | null; metadata: Record<string, string | number> }>;
  recentJobs: Array<{ id: string | null; provider: string | null; status: string | null; trace: { totalDurationMs: number; truncated: boolean; spans: Array<{ stage: string; durationMs: number; outcome: "ok" | "error" }> } | null }>;
};

const EVENT_LABELS: Array<[string, string]> = [
  ["client_runtime_provider_prompt_submitted", "Prompts"],
  ["client_runtime_provider_response_succeeded", "Responses"],
  ["client_runtime_provider_response_failed", "Failures"],
  ["client_runtime_provider_workspace_opened", "Workspaces"],
];

export default function ClientRuntimeObservabilityPanel() {
  const [data, setData] = useState<RuntimeData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  async function load() {
    setState("loading");
    const response = await fetch("/api/client-runtime/observability", { cache: "no-store" }).catch(() => null);
    const next = await response?.json().catch(() => null);
    if (response?.ok && next?.ok) {
      setData(next);
      setState("ready");
    } else {
      setState("unavailable");
    }
  }

  usePollWhileVisible(() => { void load(); }, 15000);

  const providers = useMemo(() => Object.entries(data?.providerCounts ?? {}).sort(([, a], [, b]) => b.total - a.total).slice(0, 4), [data]);
  if (state === "unavailable") return <section className="panel p-5 md:p-6" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--cream-dim)" }}><XCircle size={16} color="#fda4af" /><span>Runtime telemetry is unavailable.</span></div>
      <button type="button" onClick={() => void load()} title="Retry telemetry" aria-label="Retry telemetry" className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><RefreshCw size={13} /></button>
    </div>
  </section>;

  return (
    <section className="panel p-5 md:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(52,211,153,0.11)", border: "1px solid rgba(52,211,153,0.26)", color: "#34d399" }}><Activity size={18} /></div>
          <div>
            <p className="eyebrow">Runtime telemetry</p>
            <h2 className="mt-2 text-[21px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>Provider activity at a glance</h2>
            <p className="mt-1 text-[11px]" style={{ color: "var(--cream-mute)" }}>Redacted tenant events · last {data?.windowHours ?? 24} hours{data?.sample?.eventsLimited ? ` · latest ${data.sample.limit} events` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px]" style={{ color: data?.posthogConfigured ? "#047857" : "var(--cream-mute)", borderColor: data?.posthogConfigured ? "rgba(4,120,87,0.28)" : "var(--line-soft)", background: data?.posthogConfigured ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.04)" }}>
            {data?.posthogConfigured ? <CheckCircle2 size={12} /> : <XCircle size={12} />} PostHog {data?.posthogConfigured ? "connected" : "not configured"}
          </span>
          <button type="button" onClick={() => void load()} title="Refresh telemetry" aria-label="Refresh telemetry" className="grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><RefreshCw size={13} className={state === "loading" ? "animate-spin" : ""} /></button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
        {EVENT_LABELS.map(([event, label]) => <div key={event} className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.035)" }}><p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{label}{data?.sample?.eventsLimited ? " (sample)" : ""}</p><strong className="mt-1 block text-[22px]" style={{ color: "var(--cream)" }}>{data?.counts[event] ?? (state === "loading" ? "·" : 0)}</strong></div>)}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="flex items-center gap-2"><Clock3 size={14} color="#60a5fa" /><h3 className="text-[11px] font-semibold uppercase tracking-[0.13em]" style={{ color: "var(--cream-dim)" }}>Provider jobs{data?.sample?.jobsLimited ? " (recent sample)" : ""}</h3></div>
          <div className="mt-3 space-y-2">{providers.length === 0 && <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>No provider jobs recorded yet.</p>}{providers.map(([provider, summary]) => <div key={provider} className="flex items-center justify-between gap-3 text-[11px]"><span style={{ color: "var(--cream-dim)" }}>{provider}</span><span style={{ color: "var(--cream-mute)" }}>{summary.succeeded} ok · {summary.failed} failed · {summary.active} active</span></div>)}</div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Activity size={14} color="#34d399" /><h3 className="text-[11px] font-semibold uppercase tracking-[0.13em]" style={{ color: "var(--cream-dim)" }}>Recent signal</h3></div><Link href="/capabilities" className="inline-flex items-center gap-1 text-[10px]" style={{ color: "#047857" }}>Capabilities <ExternalLink size={11} /></Link></div>
          <div className="mt-3 space-y-2">{(data?.recentEvents ?? []).slice(0, 4).map((event, index) => <div key={`${event.event}-${event.createdAt}-${index}`} className="flex items-center justify-between gap-3 text-[11px]"><span className="truncate" style={{ color: "var(--cream-dim)" }}>{event.event.replace(/^client_runtime_/, "")}</span><time className="shrink-0" style={{ color: "var(--cream-mute)" }}>{formatTime(event.createdAt)}</time></div>)}{data?.recentEvents.length === 0 && <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>Telemetry will appear after the next client interaction.</p>}</div>
        </div>
      </div>
      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--line-soft)" }}>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.13em]" style={{ color: "var(--cream-dim)" }}>Recent job traces</h3>
        <div className="mt-3 space-y-2">
          {(data?.recentJobs ?? []).slice(0, 3).map((job, index) => <details key={job.id ?? index} className="rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "var(--line-soft)" }}>
            <summary className="flex cursor-pointer items-center justify-between gap-3" style={{ color: "var(--cream-dim)" }}><span className="min-w-0 truncate">{job.provider ?? "Runtime"} · {job.status ?? "pending"}</span><span className="shrink-0" style={{ color: "var(--cream-mute)" }}>{job.trace ? `${job.trace.totalDurationMs} ms` : "No trace"}</span></summary>
            <div className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: "var(--line-soft)" }}>{job.trace?.spans.map((span, spanIndex) => <div key={`${span.stage}-${spanIndex}`} className="flex justify-between gap-3"><span style={{ color: span.outcome === "error" ? "#fda4af" : "var(--cream-mute)" }}>{span.stage.replaceAll("_", " ")}</span><span className="shrink-0" style={{ color: "var(--cream-mute)" }}>{span.durationMs} ms</span></div>)}{!job.trace && <p style={{ color: "var(--cream-mute)" }}>No stage trace was recorded for this job.</p>}{job.trace?.truncated && <p style={{ color: "var(--cream-mute)" }}>Additional stages were omitted.</p>}</div>
          </details>)}
          {data?.recentJobs.length === 0 && <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>No recent jobs.</p>}
        </div>
      </div>
    </section>
  );
}

function formatTime(value: string | null) {
  if (!value) return "—";
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? "—" : time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
