"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Database, Gauge, RadioTower, RefreshCw, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { CLIENT_AGENT_CATALOG } from "@/lib/clientAgentCatalog";

type Credential = { key: string; connected: boolean };
type ProviderStat = { total?: number; succeeded?: number; failed?: number; active?: number; averageLatencyMs?: number | null; lastModel?: string | null };
type JobTrace = { totalDurationMs: number; truncated: boolean; spans: Array<{ stage: string; durationMs: number; outcome: "ok" | "error" }> };
type RuntimeData = {
  posthogCaptureEnabled?: boolean;
  sample?: { jobsLimited?: boolean };
  providerCounts?: Record<string, ProviderStat>;
  monthlyUsage?: { totalCostMicros?: number; inputTokens?: number; outputTokens?: number; byProvider?: Record<string, { costMicros?: number; inputTokens?: number; outputTokens?: number; model?: string | null }> };
  recentEvents?: Array<{ event?: string; createdAt?: string | null; metadata?: Record<string, string | number> }>;
  recentJobs?: Array<{ provider?: string | null; model?: string | null; status?: string | null; createdAt?: string | null; finishedAt?: string | null; errorCode?: string | null; trace?: JobTrace | null }>;
};

type DashboardState = { credentials: Credential[]; runtime: RuntimeData; runtimeAvailable: boolean; loading: boolean };

async function readDashboardData(): Promise<DashboardState> {
  const [credentialResponse, runtimeResponse] = await Promise.all([
    fetch("/api/client-runtime/credentials", { cache: "no-store" }).catch(() => null),
    fetch("/api/client-runtime/observability", { cache: "no-store" }).catch(() => null),
  ]);
  const [credentialData, runtimeData] = await Promise.all([
    credentialResponse?.json().catch(() => null),
    runtimeResponse?.json().catch(() => null),
  ]);
  const runtimeAvailable = runtimeResponse?.ok === true && runtimeData?.ok === true;
  return {
    credentials: Array.isArray(credentialData?.credentials) ? credentialData.credentials : [],
    runtime: runtimeAvailable ? runtimeData : {},
    runtimeAvailable,
    loading: false,
  };
}

export default function ClientRuntimeDashboard() {
  const [dashboard, setDashboard] = useState<DashboardState>({ credentials: [], runtime: {}, runtimeAvailable: false, loading: true });
  const { credentials, runtime, runtimeAvailable, loading } = dashboard;

  useEffect(() => {
    let active = true;
    void readDashboardData().then((result) => { if (active) setDashboard(result); });
    return () => { active = false; };
  }, []);

  function refresh() {
    setDashboard((current) => ({ ...current, loading: true }));
    void readDashboardData().then(setDashboard);
  }
  const agents = useMemo(() => [...CLIENT_AGENT_CATALOG].sort((a, b) => a.title.localeCompare(b.title)), []);
  const monthly = runtime.monthlyUsage;
  const activity = useMemo(() => [
    ...(runtime.recentJobs ?? []).map((job) => ({
      label: `${job.provider ?? "provider"} · ${job.status ?? "queued"}`,
      detail: job.errorCode || job.model || "Hosted provider job",
      createdAt: job.finishedAt ?? job.createdAt ?? null,
      tone: job.status === "failed" ? "#fda4af" : job.status === "succeeded" ? "#34d399" : "#fbbf24",
      trace: job.trace ?? null,
    })),
    ...(runtime.recentEvents ?? []).map((event) => ({
      label: (event.event ?? "runtime.event").replace(/^client_runtime_/, "").replaceAll("_", " "),
      detail: typeof event.metadata?.result === "string" ? event.metadata.result : "Tenant runtime event",
      createdAt: event.createdAt ?? null,
      tone: "#60a5fa",
      trace: null,
    })),
  ].sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? "")).slice(0, 12), [runtime]);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="eyebrow">Hosted runtime evidence</p><h2 className="mt-1 text-[21px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>Command telemetry</h2></div>
      <div className="flex items-center gap-2">
        <span className="text-[11px]" style={{ color: runtimeAvailable ? "var(--cream-dim)" : "var(--cream-mute)" }}>PostHog {runtimeAvailable ? runtime.posthogCaptureEnabled ? "on" : "off" : "unknown"}</span>
        <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><RefreshCw size={13} className={loading ? "animate-spin" : ""} />Refresh</button>
      </div>
    </div>

    <section className="grid gap-3 xl:grid-cols-3">
      <Summary icon={<WalletCards size={16} />} label="Monthly budget usage" value={runtimeAvailable ? formatUsd(monthly?.totalCostMicros ?? 0) : "Unavailable"} detail={runtimeAvailable ? monthly?.totalCostMicros ? "Reserved or settled provider ledger entries" : "No provider budget entries have been recorded" : "Budget evidence could not be loaded"} color="#f0c94a" />
      <Summary icon={<Database size={16} />} label="Provider-reported tokens" value={runtimeAvailable ? formatNumber((monthly?.inputTokens ?? 0) + (monthly?.outputTokens ?? 0)) : "Unavailable"} detail={runtimeAvailable ? `${formatNumber(monthly?.inputTokens ?? 0)} input · ${formatNumber(monthly?.outputTokens ?? 0)} output` : "Usage evidence could not be loaded"} color="#60a5fa" />
      <Summary icon={<ShieldCheck size={16} />} label="Telemetry read" value={runtimeAvailable ? "Available" : "Unavailable"} detail={runtimeAvailable ? "Tenant-scoped audit and job summary" : "Current runtime activity could not be confirmed"} color="#34d399" />
    </section>

    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--line-soft)" }}>
        <div className="flex items-center gap-2"><Gauge size={15} color="#60a5fa" /><h3 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Agent health</h3></div>
        <p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>Latency is calculated only from completed Cloud Tasks jobs{runtime.sample?.jobsLimited ? " in the recent sample" : ""}.</p>
      </div>
      <div className="grid divide-y md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-3" style={{ borderColor: "var(--line-soft)" }}>
        {agents.map((agent) => {
          const stat = runtime.providerCounts?.[agent.provider];
          const connected = credentials.some((credential) => credential.key === agent.credentialKey && credential.connected);
          return <div key={agent.route} className="min-w-0 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[12px] font-semibold" style={{ color: "var(--cream)" }}>{agent.title}</p><p className="mt-1 truncate text-[10px]" style={{ color: "var(--cream-mute)" }}>{stat?.lastModel || agent.model}</p></div><span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" title={connected ? "Credential connected" : "Credential not connected"} style={{ background: connected ? "#34d399" : "#fbbf24" }} /></div><div className="mt-4 flex items-center justify-between text-[10px]"><span style={{ color: "var(--cream-mute)" }}>{stat?.averageLatencyMs ? `${Math.round(stat.averageLatencyMs)} ms` : "No completed job"}</span><span style={{ color: stat?.failed ? "#fda4af" : "var(--cream-dim)" }}>{stat?.total ?? 0} runs</span></div></div>;
        })}
      </div>
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--line-soft)" }}><div className="flex items-center gap-2"><RadioTower size={15} color="#f0c94a" /><h3 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>V-Live activity</h3></div><span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>Cloud Run workers and approved provider jobs</span></div>
        <div className="max-h-[310px] divide-y overflow-y-auto" style={{ borderColor: "var(--line-soft)" }}>
          {activity.length === 0 ? <p className="p-5 text-[11px]" style={{ color: "var(--cream-mute)" }}>No hosted activity yet. Provider requests and queued workflows will appear here after they are submitted.</p> : activity.map((item, index) => <div key={`${item.label}-${index}`} className="flex items-start gap-3 px-5 py-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: item.tone }} /><div className="min-w-0 flex-1"><p className="capitalize text-[11px]" style={{ color: "var(--cream-dim)" }}>{item.label}</p><p className="mt-1 truncate text-[10px]" style={{ color: "var(--cream-mute)" }}>{item.detail}</p>{item.trace && <details className="mt-2 text-[10px]"><summary className="cursor-pointer" style={{ color: "var(--cream-dim)" }}>Job trace · {item.trace.totalDurationMs} ms</summary><ol className="mt-2 space-y-1" aria-label="Job stages">{item.trace.spans.map((span, spanIndex) => <li key={`${span.stage}-${spanIndex}`} className="flex justify-between gap-3"><span style={{ color: span.outcome === "error" ? "#fda4af" : "var(--cream-mute)" }}>{span.stage.replaceAll("_", " ")} · {span.outcome}</span><span className="shrink-0" style={{ color: "var(--cream-mute)" }}>{span.durationMs} ms</span></li>)}</ol>{item.trace.truncated && <p className="mt-1" style={{ color: "var(--cream-mute)" }}>Additional stages were omitted.</p>}</details>}</div><time className="shrink-0 text-[10px]" style={{ color: "var(--cream-mute)" }}>{relativeTime(item.createdAt)}</time></div>)}
        </div>
      </div>
      <div className="panel p-5"><div className="flex items-center gap-2"><Sparkles size={15} color="#c4b5fd" /><h3 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Usage by provider</h3></div><div className="mt-4 space-y-3">{Object.entries(monthly?.byProvider ?? {}).length === 0 ? <p className="text-[11px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>Usage appears only when an enabled provider returns metering data. Subscription plans are not estimated or invented.</p> : Object.entries(monthly?.byProvider ?? {}).map(([provider, usage]) => <div key={provider} className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.025)" }}><div className="flex justify-between gap-2"><span className="text-[11px]" style={{ color: "var(--cream)" }}>{provider}</span><span className="text-[11px]" style={{ color: "#f0c94a" }}>{formatUsd(usage.costMicros ?? 0)}</span></div><p className="mt-1 truncate text-[10px]" style={{ color: "var(--cream-mute)" }}>{usage.model || "Provider metering"} · {formatNumber((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0))} tokens</p></div>)}</div></div>
    </section>
  </div>;
}

function Summary({ icon, label, value, detail, color }: { icon: ReactNode; label: string; value: string; detail: string; color: string }) {
  return <div className="panel p-4"><div className="flex items-center gap-2" style={{ color }}>{icon}<span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--cream-mute)" }}>{label}</span></div><p className="mt-4 text-[24px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{value}</p><p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>{detail}</p></div>;
}

function formatNumber(value: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value); }
function formatUsd(micros: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(micros / 1_000_000); }
function relativeTime(value: string | null) { const ms = Date.parse(value ?? ""); if (!Number.isFinite(ms)) return "pending"; const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000)); return minutes < 1 ? "now" : minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`; }
