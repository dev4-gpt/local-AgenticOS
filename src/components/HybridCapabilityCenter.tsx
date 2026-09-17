"use client";

import { useState } from "react";
import { CheckCircle2, Cloud, Computer, Link2, LoaderCircle, LockKeyhole, Send, ShieldCheck } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import LocalWorkerBridgePanel from "@/components/LocalWorkerBridgePanel";
import { HYBRID_CAPABILITIES, type HybridCapability, type HybridCapabilityState } from "@/lib/hybridCapabilityCatalog";

const STATE: Record<HybridCapabilityState, { label: string; color: string; background: string }> = {
  available: { label: "Available now", color: "#34d399", background: "rgba(52,211,153,0.12)" },
  "setup-required": { label: "Local setup required", color: "#60a5fa", background: "rgba(96,165,250,0.12)" },
  controlled: { label: "Controlled activation", color: "#fbbf24", background: "rgba(251,191,36,0.12)" },
  future: { label: "Future release", color: "#94a3b8", background: "rgba(148,163,184,0.12)" },
};

function Location({ value }: { value: HybridCapability["executionLocation"] }) {
  if (value === "cloud") return <span className="inline-flex items-center gap-1"><Cloud size={12} />Cloud</span>;
  if (value === "local-worker") return <span className="inline-flex items-center gap-1"><Computer size={12} />Local Worker</span>;
  return <span className="inline-flex items-center gap-1"><Link2 size={12} />Hybrid</span>;
}

export default function HybridCapabilityCenter() {
  const [requested, setRequested] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function requestActivation(capability: HybridCapability) {
    if (busy || requested.includes(capability.id) || capability.state === "future") return;
    setBusy(capability.id); setError("");
    const response = await fetch("/api/client-runtime/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: capability.requestType,
        title: `Hybrid capability · ${capability.label}`,
        details: [
          `Request activation planning for ${capability.label}.`,
          `Execution location: ${capability.executionLocation}.`,
          `Customer controls: ${capability.userControls.join("; ")}.`,
          `Required before activation: ${capability.activationRequirement}`,
          "Do not submit credentials, source files, or an external action from this request.",
        ].join("\n"),
        fields: { capabilityId: capability.id, executionLocation: capability.executionLocation, requestedFrom: "hybrid-capability-center" },
      }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok) setRequested((current) => [...current, capability.id]);
    else setError(typeof data?.error === "string" ? data.error : "capability_request_failed");
    setBusy(null);
  }

  return <div className="space-y-5 pb-8">
    <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: "#5eead4", borderColor: "rgba(94,234,212,0.32)", background: "rgba(94,234,212,0.10)" }}><Link2 size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Veloce Hybrid Edition</p>
          <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>Your cloud control plane. Your local capability.</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>Start work and approve consequential actions here. When a task needs your files, local model, GPU, microphone, or development environment, a paired Local Worker performs only the scope you have granted.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3 text-[11px]" style={{ color: "var(--cream-dim)" }}>
        <div className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)" }}><Cloud size={14} color="#60a5fa" /><p className="mt-2 font-semibold" style={{ color: "var(--cream)" }}>Cloud controls</p><p className="mt-1">Identity, workflow, budgets, approvals, audit, and tenant data.</p></div>
        <div className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)" }}><Computer size={14} color="#5eead4" /><p className="mt-2 font-semibold" style={{ color: "var(--cream)" }}>Local execution</p><p className="mt-1">Selected local sources, models, tools, capture devices, and compute.</p></div>
        <div className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)" }}><ShieldCheck size={14} color="#fbbf24" /><p className="mt-2 font-semibold" style={{ color: "var(--cream)" }}>You stay in control</p><p className="mt-1">New scopes, paid calls, sharing, publishing, and destructive actions need approval.</p></div>
      </div>
    </section>

    {error && <ClientRuntimeNotice code={error} />}
    <LocalWorkerBridgePanel />
    <section className="grid gap-3 lg:grid-cols-2">
      {HYBRID_CAPABILITIES.map((capability) => {
        const status = STATE[capability.state];
        const complete = requested.includes(capability.id);
        return <article key={capability.id} className="panel flex min-h-[292px] flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{capability.label}</p><p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}><Location value={capability.executionLocation} /></p></div>
            <span className="rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: status.color, background: status.background, borderColor: `${status.color}44` }}>{status.label}</span>
          </div>
          <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{capability.summary}</p>
          <div className="mt-4 rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.02)" }}>
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--cream-mute)" }}>Your controls</p>
            <ul className="mt-2 space-y-1 text-[10.5px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{capability.userControls.map((control) => <li key={control}>• {control}</li>)}</ul>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed" style={{ color: "var(--cream-mute)" }}><LockKeyhole size={11} className="mr-1 inline" />{capability.activationRequirement}</p>
          <div className="mt-auto pt-4">
            {capability.state === "future" ? <span className="text-[10.5px]" style={{ color: "var(--cream-mute)" }}>Tracked for a future promotion packet.</span>
              : complete ? <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold" style={{ color: "#34d399" }}><CheckCircle2 size={14} />Activation plan requested</span>
                : <button type="button" onClick={() => void requestActivation(capability)} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-[10.5px] font-semibold disabled:opacity-45" style={{ color: "#07111d", background: "#5eead4" }}>{busy === capability.id ? <LoaderCircle size={13} className="animate-spin" /> : <Send size={13} />}{capability.state === "available" ? "Open capability" : "Request activation plan"}</button>}
          </div>
        </article>;
      })}
    </section>
  </div>;
}
