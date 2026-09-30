"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, Bot, CheckCircle2, Code2, FileText, FolderOpen, Gauge, Layers, LockKeyhole, MessageSquare, Mic, PackageOpen, PanelTop, Radar, Settings2, ShieldCheck, Sparkles, Terminal, XCircle } from "lucide-react";
import ClientProviderWorkspace from "@/components/ClientProviderWorkspace";
import ClientAgentTabSurface from "@/components/ClientAgentTabSurface";
import VoiceButton from "@/components/VoiceButton";
import type { ClientAgentDefinition } from "@/lib/clientAgentCatalog";

type Credential = { key: string; connected: boolean };
type Runtime = { providerCallsEnabled?: boolean; approvalsRequired?: boolean };
type Artifact = { id: string; original_name?: string; content_type?: string; byte_size?: number; status?: string; created_at?: string };
type Observability = { providerCounts?: Record<string, { total?: number; succeeded?: number; failed?: number; active?: number; averageLatencyMs?: number; lastModel?: string | null }>; artifacts?: { total?: number }; sample?: { jobsLimited?: boolean; limit?: number } };

export default function ClientAgentConsole({ agent }: { agent: ClientAgentDefinition }) {
  const [tab, setTab] = useState(agent.tabs[0]?.id ?? "chat");
  const [mode, setMode] = useState(agent.modes?.[0] ?? "");
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [runtime, setRuntime] = useState<Runtime>({});
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [observability, setObservability] = useState<Observability>({});
  const [voiceDraft, setVoiceDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/client-runtime/credentials", { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
      fetch("/api/client-runtime/artifacts", { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
      fetch("/api/client-runtime/observability", { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
    ]).then(([credentialData, artifactData, telemetryData]) => {
      if (cancelled) return;
      setCredentials(Array.isArray(credentialData?.credentials) ? credentialData.credentials : []);
      setRuntime(credentialData?.mode ?? {});
      setArtifacts(Array.isArray(artifactData?.artifacts) ? artifactData.artifacts : []);
      setObservability(telemetryData ?? {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [agent.provider]);

  useEffect(() => { setTab(agent.tabs[0]?.id ?? "chat"); setMode(agent.modes?.[0] ?? ""); setVoiceDraft(""); }, [agent]);

  const connected = credentials.some((credential) => credential.key === agent.credentialKey && credential.connected);
  const providerStats = observability.providerCounts?.[agent.provider];
  const canCaptureVoice = ["talk", "factory", "build"].includes(tab);
  const chatTab = tab === "chat";
  const selectedTab = useMemo(() => agent.tabs.find((item) => item.id === tab) ?? agent.tabs[0], [agent.tabs, tab]);

  return (
    <div className="space-y-5">
      <section className="panel p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ color: agent.accent, background: `${agent.accent}1c`, border: `1px solid ${agent.accent}44` }}><Bot size={18} /></div>
            <div className="min-w-0">
              <p className="eyebrow">Hosted agent workspace</p>
              <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{agent.title}</h1>
              <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{agent.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-[10px] uppercase tracking-[0.12em]" style={{ color: connected ? "#34d399" : "#fbbf24", borderColor: connected ? "rgba(52,211,153,0.32)" : "rgba(251,191,36,0.34)", background: connected ? "rgba(52,211,153,0.08)" : "rgba(251,191,36,0.08)" }}>
            {connected ? <CheckCircle2 size={13} /> : <LockKeyhole size={13} />}{connected && runtime.providerCallsEnabled ? "Approved and connected" : "Visible, awaiting provider"}
          </div>
        </div>
        <div className="mt-5 grid gap-2 text-[11px] sm:grid-cols-3">
          <Metric label="Model lane" value={providerStats?.lastModel || agent.model} icon={<Sparkles size={13} />} accent={agent.accent} />
          <Metric label="Hosted latency" value={providerStats?.averageLatencyMs ? `${Math.round(providerStats.averageLatencyMs)} ms` : "No completed hosted job yet"} icon={<Gauge size={13} />} accent={agent.accent} />
          <Metric label="Tenant outputs" value={`${artifacts.length || providerStats?.total || 0} visible`} icon={<PackageOpen size={13} />} accent={agent.accent} />
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-2" aria-label={`${agent.title} workspace sections`}>
        {agent.tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[11px] font-medium" style={{ color: tab === item.id ? "#08111d" : "var(--cream-dim)", background: tab === item.id ? agent.accent : "rgba(255,255,255,0.035)", borderColor: tab === item.id ? agent.accent : "var(--line-soft)" }}><TabIcon id={item.id} size={13} />{item.label}</button>)}
        {agent.modes?.length ? <span className="ml-auto flex flex-wrap items-center gap-1 rounded-md border p-1" style={{ borderColor: "var(--line-soft)" }}>{agent.modes.map((item) => <button key={item} type="button" onClick={() => setMode(item)} className="rounded px-2 py-1 text-[10px]" style={{ color: mode === item ? "#08111d" : "var(--cream-mute)", background: mode === item ? agent.accent : "transparent" }}>{item}</button>)}</span> : null}
      </section>

      {chatTab ? <ClientProviderWorkspace provider={agent.provider} title={agent.title} initialPrompt={voiceDraft} compact /> : <ClientAgentTabSurface agent={agent} tab={selectedTab} connected={connected} artifacts={artifacts} providerStats={providerStats} onOpenChat={(prompt) => { if (prompt) setVoiceDraft(prompt); setTab("chat"); }} />}
      {observability.sample?.jobsLimited ? <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>Run counts show only the latest {observability.sample.limit ?? 250} tenant jobs.</p> : null}
    </div>
  );
}

function HostedAgentSurface({ agent, tab, connected, artifacts, providerStats, voiceDraft, setVoiceDraft, canCaptureVoice, onOpenChat }: { agent: ClientAgentDefinition; tab: { id: string; label: string; description: string }; connected: boolean; artifacts: Artifact[]; providerStats?: { total?: number; succeeded?: number; failed?: number; active?: number }; voiceDraft: string; setVoiceDraft: (value: string) => void; canCaptureVoice: boolean; onOpenChat: () => void }) {
  const isWorkspace = tab.id === "workspace" || tab.id === "artifacts" || tab.id === "preview";
  const isBoardroom = tab.id === "boardroom";
  return (
    <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md" style={{ color: agent.accent, background: `${agent.accent}18`, border: `1px solid ${agent.accent}35` }}><TabIcon id={tab.id} size={16} /></div>
          <div><p className="eyebrow">{agent.title} · {tab.label}</p><h2 className="mt-2 text-[20px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{tab.description}</h2></div>
        </div>
        <span className="rounded-md border px-2.5 py-1.5 text-[10px]" style={{ color: connected ? "#34d399" : "#fbbf24", borderColor: connected ? "rgba(52,211,153,0.32)" : "rgba(251,191,36,0.34)" }}>{connected ? "Provider ready" : "Credential needed"}</span>
      </div>

      {canCaptureVoice && <div className="mt-5 flex flex-wrap items-center gap-3 rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.025)" }}>
        <VoiceButton size={36} onTranscript={(transcript, options) => { if (options.final) setVoiceDraft(`${voiceDraft} ${transcript}`.trim()); }} />
        <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold" style={{ color: "var(--cream)" }}>Browser voice input</p><p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>Speech stays in this browser until you open the approved provider chat.</p>{voiceDraft && <div className="mt-2 truncate text-[11px]" style={{ color: "var(--cream-dim)" }}>{voiceDraft}</div>}</div>
        <button type="button" onClick={onOpenChat} disabled={!voiceDraft} className="rounded-md px-3 py-2 text-[11px] font-semibold disabled:opacity-40" style={{ color: "#08111d", background: agent.accent }}>Use in chat</button>
      </div>}

      {isBoardroom && <div className="mt-5"><p className="text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>A panel deliberates with approved providers and a final verdict is stored in the tenant workspace. Full panels can take 30 to 90 seconds after the provider lane is enabled.</p><div className="mt-4 flex flex-wrap gap-2">{(agent.quickPrompts ?? []).map((prompt) => <button key={prompt} type="button" onClick={onOpenChat} className="rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>{prompt}</button>)}</div></div>}

      {isWorkspace ? <div className="mt-5 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]"><div className="rounded-md border p-4" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.025)" }}><div className="flex items-center gap-2"><Activity size={14} color={agent.accent} /><h3 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Hosted run state</h3></div><dl className="mt-4 space-y-2 text-[11px]"><Stat label="Queued or running" value={String(providerStats?.active ?? 0)} /><Stat label="Completed" value={String(providerStats?.succeeded ?? 0)} /><Stat label="Failed" value={String(providerStats?.failed ?? 0)} /></dl><p className="mt-4 text-[10px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>Jobs run through Cloud Tasks. There is no Cloud Run shell, local CLI, or laptop workspace behind this surface.</p></div><div className="rounded-md border" style={{ borderColor: "var(--line-soft)" }}><div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}><FolderOpen size={14} color={agent.accent} /><h3 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Tenant artifacts</h3></div><div className="max-h-[270px] overflow-y-auto p-2">{artifacts.length === 0 ? <p className="p-3 text-[11px]" style={{ color: "var(--cream-mute)" }}>No tenant artifacts yet. Hosted outputs will appear here with signed access after a job succeeds.</p> : artifacts.map((artifact) => <div key={artifact.id} className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-[11px]"><span className="min-w-0 truncate" style={{ color: "var(--cream-dim)" }}>{artifact.original_name || artifact.id}</span><span className="shrink-0" style={{ color: "var(--cream-mute)" }}>{artifact.status || artifact.content_type || "stored"}</span></div>)}</div></div></div> : <div className="mt-5 grid gap-3 md:grid-cols-3"><Feature label="Hosted boundary" value="Tenant scoped" /><Feature label="Execution" value={connected ? "Approval and queue controlled" : "Visible until credential approval"} /><Feature label="Persistence" value="Supabase records and Cloud Storage artifacts" /></div>}

      {!isWorkspace && <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4 text-[11px]" style={{ borderColor: "var(--line-soft)" }}><ShieldCheck size={14} color="#34d399" /><span style={{ color: "var(--cream-dim)" }}>This surface is part of the hosted product baseline. It becomes executable only when its provider, budget, and approval conditions are satisfied.</span><button type="button" onClick={onOpenChat} className="ml-auto inline-flex items-center gap-2 rounded-md px-3 py-2 font-semibold" style={{ color: "#08111d", background: agent.accent }}><MessageSquare size={13} />Open chat</button></div>}
    </section>
  );
}

function Metric({ label, value, icon, accent }: { label: string; value: string; icon: ReactNode; accent: string }) {
  return <div className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-2.5" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.03)" }}><span style={{ color: accent }}>{icon}</span><div className="min-w-0"><p className="text-[9px] uppercase tracking-[0.12em]" style={{ color: "var(--cream-mute)" }}>{label}</p><p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--cream-dim)" }}>{value}</p></div></div>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3"><dt style={{ color: "var(--cream-mute)" }}>{label}</dt><dd style={{ color: "var(--cream)" }}>{value}</dd></div>; }
function Feature({ label, value }: { label: string; value: string }) { return <div className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.025)" }}><p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--cream-mute)" }}>{label}</p><p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{value}</p></div>; }

function TabIcon({ id, size }: { id: string; size: number }) {
  if (["chat", "boardroom"].includes(id)) return <MessageSquare size={size} />;
  if (["workspace", "artifacts", "preview"].includes(id)) return <FolderOpen size={size} />;
  if (["terminal", "ant", "control"].includes(id)) return <Terminal size={size} />;
  if (["studio", "factory", "ultracode"].includes(id)) return <Sparkles size={size} />;
  if (["talk", "jarvis"].includes(id)) return <Mic size={size} />;
  if (["radar", "sessions"].includes(id)) return <Radar size={size} />;
  if (["manage", "mcps", "agents", "goal", "goals"].includes(id)) return <Settings2 size={size} />;
  if (id === "build") return <Code2 size={size} />;
  return <PanelTop size={size} />;
}
