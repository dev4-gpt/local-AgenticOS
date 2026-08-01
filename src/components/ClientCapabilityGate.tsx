"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, LockKeyhole, ShieldCheck, XCircle } from "lucide-react";

interface CredentialStatus {
  key: string;
  label: string;
  connected: boolean;
}

const REQUIREMENTS: Record<string, string[]> = {
  "/claude": ["ANTHROPIC_API_KEY"],
  "/codex": ["OPENAI_API_KEY"],
  "/openclaw": ["OPENROUTER_API_KEY"],
  "/hermes": ["OPENROUTER_API_KEY"],
  "/antigravity": ["GEMINI_API_KEY"],
  "/kimi": ["MOONSHOT_API_KEY"],
  "/glm": ["GLM_API_KEY"],
  "/glm-code": ["GLM_API_KEY"],
  "/grok": ["XAI_API_KEY"],
  "/freeclaude": ["OPENROUTER_API_KEY"],
  "/fusion": ["OPENROUTER_API_KEY"],
  "/sakana": ["SAKANA_API_KEY"],
  "/video": ["HEYGEN_API_KEY"],
  "/music": ["SUNO_API_KEY"],
  "/web-studio": ["OPENAI_API_KEY"],
  "/flow-lab": ["FIRECRAWL_API_KEY"],
  "/leads": ["HUNTER_API_KEY"],
};

const LABELS: Record<string, string> = {
  "/paperclip": "Paperclip workspace",
  "/room": "AI Agent Mastermind",
  "/pipeline": "Pipeline workspace",
  "/agent-kanban": "Agent Kanban",
  "/loop": "Loop Engineering",
  "/ruflo": "Ruflo orchestration",
  "/goals": "Goals workspace",
  "/journal": "Journal workspace",
  "/seo": "SEO pipeline",
  "/opendesign": "Open Design",
  "/integrations": "Integrations",
  "/studio": "Agent Studio",
  "/openmontage": "OpenMontage",
  "/games": "Game Studio",
  "/thumbnails": "Thumbnail Studio",
  "/notebook": "Notebook",
  "/kanban": "Kanban",
  "/memory": "Memory workspace",
  "/radar": "Radar",
  "/guide": "Build Guide",
  "/local": "Local agent",
  "/engine": "Local Engine",
};

export default function ClientCapabilityGate({ pathname }: { pathname: string }) {
  const route = `/${pathname.split("/").filter(Boolean)[0] || ""}`;
  const [credentials, setCredentials] = useState<CredentialStatus[]>([]);
  const requiredKeys = REQUIREMENTS[route] ?? [];
  const title = LABELS[route] ?? route.replace(/^\//, "").replace(/-/g, " ");

  useEffect(() => {
    fetch("/api/client-runtime/credentials", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setCredentials(data?.credentials ?? []))
      .catch(() => undefined);
  }, []);

  const required = useMemo(() => requiredKeys.map((key) => {
    const item = credentials.find((credential) => credential.key === key);
    return { key, label: item?.label ?? key, connected: Boolean(item?.connected) };
  }), [credentials, requiredKeys]);
  const hasCredentialGate = required.length > 0;
  const dependencyTitle = hasCredentialGate ? "Provider API connection" : "Private operator dependency";
  const dependencyDescription = hasCredentialGate
    ? "This workspace can become client-safe through the listed provider APIs, but it is not enabled in this client manifest yet. Add the provider access, then Veloce can review the model, scope, budget, and approval policy before enabling it."
    : "This workspace currently depends on a local CLI, local filesystem, local vault, or operator service. Adding an API key alone will not make it client-safe; it needs a reviewed cloud adapter and tenant-scoped storage, or it remains operator-only.";

  return (
    <div className="pb-10">
      <section className="panel mx-auto max-w-3xl p-6 md:p-8">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa" }}><LockKeyhole size={20} /></div>
          <div>
            <div className="eyebrow">Client capability boundary</div>
            <h1 className="mt-1 text-2xl font-semibold" style={{ color: "var(--cream)" }}>Open {title}</h1>
            <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
              This workspace is part of the Veloce interface, but it is not enabled for this client runtime yet. The boundary below explains what is missing.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border p-4" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.025)" }}>
          <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--cream)" }}><KeyRound size={14} color="#60a5fa" /> {dependencyTitle}</div>
          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>{dependencyDescription}</p>
          {hasCredentialGate ? <div className="mt-3 space-y-2">
            {required.map((item) => <div key={item.key} className="flex items-center justify-between gap-3 text-[11px]" style={{ color: "var(--cream-dim)" }}><span>{item.label}</span><span className="inline-flex items-center gap-1.5 uppercase tracking-[0.12em]" style={{ color: item.connected ? "#34d399" : "var(--cream-mute)" }}>{item.connected ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{item.connected ? "Connected" : "Add credential"}</span></div>)}
          </div> : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {hasCredentialGate && <Link href="/credentials" className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold" style={{ background: "#60a5fa", color: "#07111d" }}><KeyRound size={13} /> Add credential</Link>}
          <Link href="/" className="inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><ArrowLeft size={13} /> Back to Mission Control</Link>
        </div>
        <div className="mt-6 flex items-start gap-2 border-t pt-4 text-[10px] leading-relaxed" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}><ShieldCheck size={14} color="#fbbf24" className="mt-0.5 shrink-0" /> Provider values are submitted to the client vault inbox. They are never shown again in the browser and remain subject to Veloce approval.</div>
      </section>
    </div>
  );
}
