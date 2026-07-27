"use client";

import { useState } from "react";
import { CheckCircle2, FileText, LockKeyhole, Send, ShieldCheck } from "lucide-react";

export type ClientBriefSurface =
  | "opendesign" | "web-studio" | "flow-lab" | "studio" | "openmontage"
  | "games" | "thumbnails" | "integrations" | "leads" | "radar" | "guide";

const COPY: Record<ClientBriefSurface, { title: string; label: string; prompt: string }> = {
  opendesign: { title: "Open Design Brief", label: "Create", prompt: "Describe the interface, prototype, or design system to plan." },
  "web-studio": { title: "Web Studio Brief", label: "Create", prompt: "Describe the site, audience, offer, and implementation outcome." },
  "flow-lab": { title: "Flow Lab Brief", label: "Create", prompt: "Describe the authorized source material and original outcome to develop." },
  studio: { title: "Agent Studio Brief", label: "Create", prompt: "Describe the agent workflow and human review boundary to design." },
  openmontage: { title: "OpenMontage Brief", label: "Create", prompt: "Describe the approved video concept, scenes, and deliverables." },
  games: { title: "Game Studio Brief", label: "Create", prompt: "Describe the game loop, audience, platform, and prototype scope." },
  thumbnails: { title: "Thumbnail Studio Brief", label: "Create", prompt: "Describe the content, audience, and thumbnail directions to explore." },
  integrations: { title: "Integration Review", label: "Govern", prompt: "Describe the connector, data scope, and approval boundary to review." },
  leads: { title: "Lead Workflow Brief", label: "Deliver", prompt: "Describe the approved lead workflow and destination to review." },
  radar: { title: "Radar Brief", label: "Deliver", prompt: "Describe the market or signal research to request." },
  guide: { title: "Build Guide Request", label: "Govern", prompt: "Describe the implementation guidance and source material to prepare." },
};

export default function ClientBriefWorkspace({ surface }: { surface: ClientBriefSurface }) {
  const copy = COPY[surface];
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || title.trim().length < 3 || details.trim().length < 10) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/client-runtime/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "create",
        title: title.trim().slice(0, 180),
        details: details.trim().slice(0, 10000),
        fields: {
          surface,
          adapter: "tenant-brief",
          approvalRequired: true,
          providerExecution: "separate-approved-adapter",
        },
      }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(data?.error || "The request could not be recorded.");
    else { setSubmitted(true); setTitle(""); setDetails(""); }
    setBusy(false);
  }

  return <div className="space-y-5">
    <section className="panel p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(244,180,94,0.12)", border: "1px solid rgba(244,180,94,0.28)", color: "#f4b45e" }}><LockKeyhole size={18} /></div>
        <div><p className="eyebrow">{copy.label} · Client runtime</p><h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{copy.title}</h1><p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>Capture a tenant-owned brief for manual review and the appropriate hosted adapter. This workspace does not read local files, call localhost, or execute the private operator runtime.</p></div>
      </div>
    </section>
    <section className="panel p-5 md:p-6">
      <div className="flex items-center gap-2"><FileText size={15} color="#f4b45e" /><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>New approved request</h2></div>
      <label className="mt-4 block text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>Title<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} placeholder="Name this request" /></label>
      <label className="mt-4 block text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>{copy.prompt}<textarea value={details} onChange={(event) => setDetails(event.target.value)} className="mt-2 min-h-[170px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} placeholder="Include constraints, owned assets, intended audience, and the desired next step. Do not paste credentials." /></label>
      <button type="button" onClick={submit} disabled={busy || title.trim().length < 3 || details.trim().length < 10} className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold" style={{ background: busy ? "rgba(255,255,255,0.1)" : "#f4b45e", color: busy ? "var(--cream-mute)" : "#20150a" }}><Send size={13} />{busy ? "Recording" : "Submit for review"}</button>
      {error && <p className="mt-3 text-[11px]" style={{ color: "#fda4af" }}>{error}</p>}
      {submitted && <div className="mt-4 flex items-start gap-2 rounded-md border p-3 text-[11px]" style={{ borderColor: "rgba(52,211,153,0.25)", color: "#b9f6d5", background: "rgba(52,211,153,0.06)" }}><CheckCircle2 size={14} className="mt-0.5 shrink-0" />Request recorded in this tenant's review inbox. Provider execution, external delivery, and publishing remain separately approved.</div>}
    </section>
    <section className="panel p-4"><div className="flex items-start gap-2 text-[11px]" style={{ color: "var(--cream-mute)" }}><ShieldCheck size={14} color="#fbbf24" className="mt-0.5 shrink-0" />Only the current tenant can read this request. Raw keys, passwords, private vault paths, and local service addresses are rejected.</div></section>
  </div>;
}
