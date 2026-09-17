"use client";

import Link from "next/link";
import EccLearningPanel from "@/components/EccLearningPanel";
import EccWorkflowsPanel from "@/components/EccWorkflowsPanel";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, CheckCircle2, ClipboardList, FileText, GitBranch, KeyRound, Link2, MessageSquareText, PackageCheck, Send, ShieldCheck, Sparkles } from "lucide-react";

type Surface = "command" | "context" | "orchestrate" | "create" | "deliver";

const SURFACES: Record<Surface, {
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof ClipboardList;
  accent: string;
  options: Array<{ label: string; value: string }>;
  optionLabel: string;
  fieldLabel: string;
  fieldPlaceholder: string;
}> = {
  command: {
    eyebrow: "Client command",
    title: "Start a request",
    description: "Put the next important outcome in one place. Veloce will shape it into an approved work item.",
    icon: MessageSquareText,
    accent: "#a855f7",
    options: [
      { label: "Research or decision", value: "research" },
      { label: "Website or product", value: "website" },
      { label: "Content or campaign", value: "content" },
      { label: "Asset or production", value: "asset" },
    ],
    optionLabel: "Request type",
    fieldLabel: "Desired outcome",
    fieldPlaceholder: "What should be true when this request is complete?",
  },
  context: {
    eyebrow: "Client context",
    title: "Add project context",
    description: "Capture the notes, decisions, references, and source material Veloce may use for this project.",
    icon: FileText,
    accent: "#22d3ee",
    options: [
      { label: "Project brief", value: "brief" },
      { label: "Decision or constraint", value: "decision" },
      { label: "Reference or source", value: "reference" },
      { label: "Brand or product note", value: "brand" },
    ],
    optionLabel: "Context type",
    fieldLabel: "Context",
    fieldPlaceholder: "Paste the useful context, decision, or observation here.",
  },
  orchestrate: {
    eyebrow: "Client orchestration",
    title: "Request a workflow",
    description: "Describe the outcome and the important constraints. Veloce will return a reviewable sequence of work.",
    icon: GitBranch,
    accent: "#5ab896",
    options: [
      { label: "Plan a project", value: "plan" },
      { label: "Research and recommend", value: "research" },
      { label: "Build and review", value: "build" },
      { label: "Improve an existing asset", value: "improve" },
    ],
    optionLabel: "Workflow type",
    fieldLabel: "Outcome and constraints",
    fieldPlaceholder: "What needs to happen, who is involved, and what must be protected?",
  },
  create: {
    eyebrow: "Client creation",
    title: "Create a production brief",
    description: "Give the production team a focused brief for the next website, content, design, video, or campaign asset.",
    icon: Sparkles,
    accent: "#f0a868",
    options: [
      { label: "Website or landing page", value: "website" },
      { label: "Brand or design system", value: "design" },
      { label: "Content or campaign", value: "content" },
      { label: "Video or motion asset", value: "video" },
    ],
    optionLabel: "Deliverable",
    fieldLabel: "Brief",
    fieldPlaceholder: "Describe the audience, message, references, and success signal.",
  },
  deliver: {
    eyebrow: "Client delivery",
    title: "Request delivery review",
    description: "Tell Veloce what is ready, where it should go, and what needs human approval before release.",
    icon: PackageCheck,
    accent: "#c084fc",
    options: [
      { label: "Review a preview", value: "review" },
      { label: "Prepare a handoff", value: "handoff" },
      { label: "Request a release", value: "release" },
      { label: "Record a delivery", value: "record" },
    ],
    optionLabel: "Delivery action",
    fieldLabel: "Delivery details",
    fieldPlaceholder: "What is ready, what remains, and what approval should Veloce seek?",
  },
};

const SURFACE_LINKS: Array<{ href: string; label: string; description: string; icon: typeof ClipboardList; accent: string }> = [
  { href: "/context", label: "Context", description: "Notes, decisions, and references", icon: FileText, accent: "#22d3ee" },
  { href: "/orchestrate", label: "Orchestrate", description: "Shape the next workflow", icon: GitBranch, accent: "#5ab896" },
  { href: "/create", label: "Create", description: "Prepare a production brief", icon: Sparkles, accent: "#f0a868" },
  { href: "/capabilities", label: "Govern", description: "Review enabled boundaries", icon: ShieldCheck, accent: "#a3e635" },
  { href: "/hybrid", label: "Hybrid", description: "Choose cloud and local execution", icon: Link2, accent: "#5eead4" },
  { href: "/deliver", label: "Deliver", description: "Review the next handoff", icon: PackageCheck, accent: "#c084fc" },
  { href: "/credentials", label: "Credentials", description: "Manage provider access", icon: KeyRound, accent: "#60a5fa" },
];

export default function ClientWorkspaceView({ surface }: { surface: Surface }) {
  const config = SURFACES[surface];
  const Icon = config.icon;
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState(config.options[0].value);
  const [details, setDetails] = useState("");
  const [link, setLink] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    const response = await fetch("/api/client-runtime/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: surface, title, details, fields: { kind, link } }),
    }).catch(() => null);
    setStatus(response?.ok ? "sent" : "error");
    if (response?.ok) {
      setTitle("");
      setDetails("");
      setLink("");
    }
  }

  return (
    <div className="min-h-full px-5 py-8 md:px-10 md:py-10">
      <div className="mx-auto max-w-6xl">
        <section className="panel p-5 md:p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: `${config.accent}18`, border: `1px solid ${config.accent}42`, color: config.accent }}><Icon size={19} /></div>
            <div>
              <p className="eyebrow">{config.eyebrow}</p>
              <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{config.title}</h1>
              <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{config.description}</p>
            </div>
          </div>
        </section>

        {surface === "context" && <EccLearningPanel />}
        {surface === "orchestrate" && <EccWorkflowsPanel />}
        {surface === "command" && (
          <section className="mt-4 grid gap-3 md:grid-cols-3">
            {SURFACE_LINKS.map((item) => {
              const ItemIcon = item.icon;
              return <Link key={item.href} href={item.href} className="panel panel-hover p-4" style={{ borderTop: `2px solid ${item.accent}88` }}>
                <div className="flex items-center justify-between gap-2"><ItemIcon size={16} color={item.accent} /><ArrowUpRight size={14} color="var(--cream-mute)" /></div>
                <h2 className="mt-4 text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{item.label}</h2>
                <p className="mt-1 text-[11px]" style={{ color: "var(--cream-mute)" }}>{item.description}</p>
              </Link>;
            })}
          </section>
        )}

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <form onSubmit={submit} className="panel p-5 md:p-6">
            <div className="flex items-center gap-2"><ClipboardList size={15} color={config.accent} /><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{config.title}</h2></div>
            <label className="mt-5 block text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>Title
              <input required minLength={3} maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-md border px-3 py-2.5 text-[12px] outline-none" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} placeholder="Name this request" />
            </label>
            <label className="mt-4 block text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>{config.optionLabel}
              <select value={kind} onChange={(event) => setKind(event.target.value)} className="runtime-request-select mt-2 w-full rounded-md border px-3 py-2.5 text-[12px] outline-none" style={{ borderColor: "var(--line-soft)" }}>
                {config.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="mt-4 block text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>{config.fieldLabel}
              <textarea required minLength={10} maxLength={10000} value={details} onChange={(event) => setDetails(event.target.value)} className="mt-2 min-h-[150px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed outline-none" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} placeholder={config.fieldPlaceholder} />
            </label>
            <label className="mt-4 block text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>Optional link
              <input value={link} onChange={(event) => setLink(event.target.value)} className="mt-2 w-full rounded-md border px-3 py-2.5 text-[12px] outline-none" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} placeholder="Preview, document, or reference URL" />
            </label>
            <div className="mt-5 flex items-center gap-3">
              <button type="submit" disabled={status === "sending"} className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold" style={{ color: "#111827", background: config.accent }}><Send size={13} />{status === "sending" ? "Sending" : "Submit for review"}</button>
              {status === "sent" && <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "#34d399" }}><CheckCircle2 size={14} />Received by Veloce</span>}
              {status === "error" && <span className="text-[11px]" style={{ color: "#fda4af" }}>Could not submit. Try again.</span>}
            </div>
          </form>

          <aside className="panel h-fit p-5">
            <div className="flex items-center gap-2"><ShieldCheck size={15} color="#fbbf24" /><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Review boundary</h2></div>
            <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>Your request is recorded in the client inbox. Veloce reviews scope, cost, provider access, and the proposed next step before any external action.</p>
            <div className="mt-5 space-y-3 border-t pt-4 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}>
              <p><span style={{ color: "#34d399" }}>01</span> Request received</p>
              <p><span style={{ color: "#fbbf24" }}>02</span> Scope and capability review</p>
              <p><span style={{ color: "#c084fc" }}>03</span> Human-approved work begins</p>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
