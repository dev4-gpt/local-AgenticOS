"use client";

// The hosted Integrations hub.
//
// Local `/integrations` is a hub: what this machine can do, which business
// adapters are connected, and which specialist roles are available. The hosted
// version had a single "plan an integration" brief screen, which kept the
// planning lane but lost the hub entirely — including seven curated role
// contracts that already reach client edition in the data layer and were
// rendered nowhere.
//
// Three tabs, matching what a client can actually be told: what is switched on
// for them, which roles exist and under what approval, and the planning lane.

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, Info, LoaderCircle, PlugZap, Shield, Sparkles } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import ClientSpendMeter from "@/components/ClientSpendMeter";

type Tab = "capabilities" | "roles" | "plan";
type Capability = { id: string; name: string; description: string; dataScope?: string; actionBoundary?: string };
type Role = {
  id: string; label: string; sourceRepository: string; sourceCommit: string; license: string;
  supportedSurfaces: string[]; allowedContext: string[]; allowedTools: string[];
  modelLane: string; budgetClass: string;
  deliverable: { kind: string; requiredFields: string[] };
  approval: string;
};
type Execution = { id: string; status: string; title: string | null; artifactId: string | null; errorCode: string | null };

const ACCENT = "#60a5fa";
const FIELD = { color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" } as const;
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "capabilities", label: "Capabilities" },
  { key: "roles", label: "Specialist roles" },
  { key: "plan", label: "Plan" },
];

// Stated in the client's terms rather than as raw enum values.
const APPROVAL_COPY: Record<string, string> = {
  none: "Runs without a review step",
  "review-before-apply": "A person reviews the result before anything is applied",
  "human-before-external-action": "A person approves before any external action",
};

export default function ClientIntegrationsWorkspace() {
  const [tab, setTab] = useState<Tab>("capabilities");
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [revision, setRevision] = useState("");
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [subject, setSubject] = useState("");
  const [direction, setDirection] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [capRes, skillRes, execRes] = await Promise.all([
      fetch("/api/capabilities", { cache: "no-store" }).catch(() => null),
      fetch("/api/client-runtime/skills", { cache: "no-store" }).catch(() => null),
      fetch("/api/client-runtime/executions?surface=integrations", { cache: "no-store" }).catch(() => null),
    ]);
    const capData = await capRes?.json().catch(() => null);
    if (capRes?.ok && Array.isArray(capData?.capabilities)) setCapabilities(capData.capabilities as Capability[]);
    const skillData = await skillRes?.json().catch(() => null);
    if (skillRes?.ok && Array.isArray(skillData?.roles)) { setRoles(skillData.roles as Role[]); setRevision(String(skillData.sourceRevision ?? "")); }
    const execData = await execRes?.json().catch(() => null);
    if (execRes?.ok && Array.isArray(execData?.executions)) setExecutions(execData.executions as Execution[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function plan() {
    if (busy || !subject.trim() || !direction.trim()) return;
    setBusy(true); setError("");
    const goal = [
      "Plan an integration: the data that moves, in which direction, on what trigger, and what happens when it fails.",
      `Systems: ${subject.trim()}`,
      `What it must do: ${direction.trim()}`,
      "No external account is contacted while planning this. Do not claim to have inspected an API, read documentation, or verified credentials.",
    ].join("\n\n").slice(0, 10_000);
    const response = await fetch("/api/client-runtime/executions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ surface: "integrations", title: `Integration · ${subject.trim().slice(0, 110)}`, goal, artifactIntent: "brief" }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(typeof data?.error === "string" ? data.error : "workspace_execution_queue_failed");
    else { setSubject(""); setDirection(""); await load(); }
    setBusy(false);
  }

  async function download(artifactId: string) {
    const response = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.downloadUrl !== "string") { setError(typeof data?.error === "string" ? data.error : "artifact_download_failed"); return; }
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  return <div className="space-y-5 pb-8">
    <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: ACCENT, borderColor: `${ACCENT}52`, background: `${ACCENT}1f` }}><PlugZap size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">V. Govern · Connections</p>
          <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>Integrations</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
            What is switched on for this client, which specialist roles are available and under what approval, and a place to plan a connection before anything touches an external account.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--line-soft)" }}>
        {TABS.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)}
          className="border-b-2 px-3 py-2 text-[11px] font-medium"
          style={{ borderColor: tab === item.key ? ACCENT : "transparent", color: tab === item.key ? "var(--cream)" : "var(--cream-mute)" }}>
          {item.label}{item.key === "roles" && roles.length ? ` · ${roles.length}` : ""}
        </button>)}
      </div>
    </section>

    {error && <ClientRuntimeNotice code={error} />}
    <ClientSpendMeter />

    {tab === "capabilities" && <section className="space-y-2">
      <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>{capabilities.length} enabled for this client</p>
      {capabilities.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>No capabilities are enabled yet.</div>}
      {capabilities.map((capability) => <article key={capability.id} className="panel p-4">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: "#5ab896" }} />
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold" style={{ color: "var(--cream)" }}>{capability.name}</p>
            <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{capability.description}</p>
            {capability.actionBoundary && <p className="mt-1.5 text-[10px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>
              <span style={{ color: "var(--cream-dim)" }}>Boundary: </span>{capability.actionBoundary}
            </p>}
          </div>
        </div>
      </article>)}
    </section>}

    {tab === "roles" && <section className="space-y-2">
      <section className="panel flex items-start gap-2.5 p-3.5">
        <Info size={14} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          Reviewed role contracts, not third-party prompt files. Each names the context and tools it may use, what it must produce, and the approval it requires{revision ? ` — curated at upstream revision ${revision}` : ""}.
        </p>
      </section>
      {roles.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>No specialist roles are published for this client.</div>}
      {roles.map((role) => <article key={role.id} className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <Sparkles size={14} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold" style={{ color: "var(--cream)" }}>{role.label}</p>
              <p className="mt-0.5 text-[10px]" style={{ color: "var(--cream-mute)" }}>
                produces <span style={{ color: "var(--cream-dim)" }}>{role.deliverable.kind}</span> · {role.modelLane} · {role.budgetClass} budget
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px]"
            style={{ borderColor: "rgba(90,184,150,0.32)", color: "#5ab896", background: "rgba(90,184,150,0.08)" }}>
            <Shield size={11} />{APPROVAL_COPY[role.approval] ?? role.approval}
          </span>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <Detail label="Runs on" values={role.supportedSurfaces} />
          <Detail label="May read" values={role.allowedContext} />
          <Detail label="May use" values={role.allowedTools} />
        </div>

        <p className="mt-2.5 text-[10px]" style={{ color: "var(--cream-mute)" }}>
          Must include: <span style={{ color: "var(--cream-dim)" }}>{role.deliverable.requiredFields.join(", ")}</span>
          {" · "}{role.license} · <span className="font-mono">{role.sourceCommit}</span>
        </p>
      </article>)}
    </section>}

    {tab === "plan" && <>
      <section className="panel flex items-start gap-2.5 p-3.5">
        <Info size={14} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          Planning only. No external account is contacted from this surface, and connecting one is a separate credentialed approval.
        </p>
      </section>
      <section className="panel p-4 md:p-5">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Systems to connect</span>
          <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Which systems, and in which direction?"
            className="w-full rounded-md border px-3 py-2.5 text-[12px]" style={FIELD} />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>What it must do</span>
          <textarea value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="The data, the trigger, and what should happen when it fails."
            className="min-h-[92px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={FIELD} />
        </label>
        <button type="button" disabled={busy || !subject.trim() || !direction.trim()} onClick={() => void plan()}
          className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40"
          style={{ background: ACCENT, color: "#07111d" }}>
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <FileText size={13} />}{busy ? "Queueing" : "Plan the integration"}
        </button>
      </section>
      <section className="space-y-2">
        {executions.map((execution) => <div key={execution.id} className="panel flex flex-wrap items-center justify-between gap-2 p-4">
          <div className="min-w-0">
            <p className="truncate text-[12px]" style={{ color: "var(--cream)" }}>{execution.title || "Integration plan"}</p>
            <p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{execution.status}{execution.errorCode ? ` · ${execution.errorCode}` : ""}</p>
          </div>
          {execution.artifactId && <button type="button" onClick={() => void download(execution.artifactId!)}
            className="rounded-md border px-3 py-1.5 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>Download</button>}
        </div>)}
      </section>
    </>}
  </div>;
}

function Detail({ label, values }: { label: string; values: string[] }) {
  return <div className="rounded-md border p-2.5" style={{ borderColor: "var(--line-soft)" }}>
    <p className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>{label}</p>
    <p className="mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{values.join(" · ")}</p>
  </div>;
}
