"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, ExternalLink, FileAudio, FileVideo, LockKeyhole, Send, ShieldCheck, XCircle } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";

type Kind = "orchestration" | "media" | "seo";
type Job = { status?: string; error_code?: string; output_metadata?: Record<string, unknown> };
type WorkflowStep = { title?: string; result?: string; status?: string };

const CAPABILITY_LABELS: Record<Kind, string> = {
  orchestration: "Tenant Workflow Board",
  media: "Tenant Media Adapter",
  seo: "Tenant SEO Research",
};

export default function ClientHostedWorkspace({ kind, title, pathname: _pathname, provider = "elevenlabs" }: { kind: Kind; title: string; pathname: string; provider?: "elevenlabs" | "heygen" | "suno" }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [goal, setGoal] = useState("");
  const [operation, setOperation] = useState("plan");
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [url, setUrl] = useState("");
  const [focus, setFocus] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/capabilities", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!cancelled) setEnabled(Array.isArray(data?.capabilities) && data.capabilities.some((item: { id?: string }) => item.id === kind));
      })
      .catch(() => { if (!cancelled) setEnabled(false); });
    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
  }, [kind]);

  async function submit() {
    setError("");
    setJob(null);
    const input = kind === "orchestration" ? { goal, operation } : kind === "media" ? { text, voiceId, ...(provider === "heygen" ? { avatarId } : {}) } : { url, focus };
    const response = await fetch("/api/client-runtime/hosted-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capability: kind, provider: kind === "media" ? provider : kind === "seo" ? "firecrawl" : undefined, input }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || !data?.jobId) {
      setError(data?.error || "task_enqueue_failed");
      return;
    }
    poll(data.jobId);
  }

  function poll(jobId: string) {
    let attempts = 0;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      attempts += 1;
      const response = await fetch(`/api/client-runtime/jobs/${jobId}`, { cache: "no-store" }).catch(() => null);
      const data = await response?.json().catch(() => null);
      const nextJob = data?.job as Job | undefined;
      if (nextJob) setJob(nextJob);
      if (nextJob?.status === "succeeded" || nextJob?.status === "failed" || nextJob?.status === "cancelled" || attempts >= 90) {
        if (pollRef.current) clearInterval(pollRef.current);
        if (attempts >= 90 && nextJob?.status === "queued") setError("hosted_job_still_queued");
      }
    }, 1000);
  }

  if (enabled === false) {
    return <section className="panel mx-auto max-w-3xl p-6 md:p-8"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa" }}><LockKeyhole size={20} /></div><div><div className="eyebrow">Client capability boundary</div><h1 className="mt-1 text-2xl font-semibold" style={{ color: "var(--cream)" }}>Open {title}</h1><p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>This hosted adapter is not enabled in this client manifest yet. Veloce must approve its provider, budget, data scope, and output policy first.</p></div></div><div className="mt-6 rounded-lg border p-4" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.025)" }}><div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--cream)" }}><ShieldCheck size={14} color="#fbbf24" /> {CAPABILITY_LABELS[kind]}</div><p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>No local CLI, laptop filesystem, operator vault, or loopback service is used by this boundary.</p></div><Link href="/capabilities" className="mt-6 inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><ArrowLeft size={13} /> Review capabilities</Link></section>;
  }

  const output = job?.output_metadata ?? {};
  const working = job?.status === "queued" || job?.status === "running";
  return <div className="space-y-5">
    <section className="panel p-5 md:p-6"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.28)", color: "#60a5fa" }}><ShieldCheck size={18} /></div><div><p className="eyebrow">Hosted client adapter</p><h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{title}</h1><p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>Tenant-scoped work runs through an approved server-side adapter and durable queue. Results stay inside this client runtime.</p></div></div></section>
    <section className="panel p-5"><div className="flex items-center gap-2"><LockKeyhole size={15} color="#92400e" /><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Capability boundary</h2><span className="ml-auto rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em]" style={{ color: enabled ? "#047857" : "var(--cream-mute)", background: enabled ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)", borderColor: enabled ? "rgba(4,120,87,0.28)" : "var(--line-soft)" }}>{enabled ? "Enabled" : "Checking"}</span></div><div className="mt-3 grid gap-3 sm:grid-cols-3 text-[11px]" style={{ color: "var(--cream-dim)" }}><div className="flex items-center gap-2"><CheckCircle2 size={14} color="#047857" /> Tenant-scoped records</div><div className="flex items-center gap-2"><Clock3 size={14} color="#1d4ed8" /> Queue-backed work</div><div className="flex items-center gap-2"><ShieldCheck size={14} color="#92400e" /> Approval boundary</div></div></section>
    <section className="panel p-5 md:p-6">
      {kind === "orchestration" && <><label className="block text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>Outcome<input value={goal} onChange={(event) => setGoal(event.target.value)} className="mt-2 w-full rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} placeholder="What should this workflow achieve?" /></label><label className="mt-4 block text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>Operation<select value={operation} onChange={(event) => setOperation(event.target.value)} className="runtime-request-select mt-2 w-full rounded-md border px-3 py-2.5 text-[12px]" style={{ borderColor: "var(--line-soft)" }}><option value="plan">Plan a project</option><option value="review">Review an existing workflow</option><option value="handoff">Prepare a handoff</option></select></label></>}
      {kind === "media" && <><label className="block text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>{provider === "heygen" ? "Video script" : "Narration text"}<textarea value={text} onChange={(event) => setText(event.target.value)} className="mt-2 min-h-[160px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} placeholder={provider === "heygen" ? "Script for an approved client video..." : "Text for an approved client narration..."} /></label><label className="mt-4 block text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>Voice ID (optional)<input value={voiceId} onChange={(event) => setVoiceId(event.target.value)} className="mt-2 w-full rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} placeholder="Use the approved default voice" /></label>{provider === "heygen" && <label className="mt-4 block text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>Avatar ID (optional)<input value={avatarId} onChange={(event) => setAvatarId(event.target.value)} className="mt-2 w-full rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} placeholder="Use the approved default avatar" /></label>}</>}
      {kind === "seo" && <><label className="block text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>Allowlisted website URL<input value={url} onChange={(event) => setUrl(event.target.value)} className="mt-2 w-full rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} placeholder="https://client.example" /></label><label className="mt-4 block text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>Research focus<textarea value={focus} onChange={(event) => setFocus(event.target.value)} className="mt-2 min-h-[100px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} placeholder="What should the review look for?" /></label></>}
      <div className="mt-5 flex items-center gap-3"><button type="button" onClick={submit} disabled={working || (kind === "orchestration" ? !goal.trim() : kind === "media" ? !text.trim() : !url.trim())} className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold" style={{ background: working ? "rgba(255,255,255,0.1)" : "#60a5fa", color: working ? "var(--cream-mute)" : "#07111d" }}><Send size={13} />{working ? "Working" : "Submit hosted job"}</button>{job?.status === "succeeded" && <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px]" style={{ color: "#047857", background: "rgba(16,185,129,0.12)", borderColor: "rgba(4,120,87,0.28)" }}><CheckCircle2 size={14} />Complete</span>}{job?.status === "failed" && <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px]" style={{ color: "#991b1b", background: "rgba(248,113,113,0.14)", borderColor: "rgba(153,27,27,0.32)" }}><XCircle size={14} />Failed</span>}</div>
      {job?.status === "failed" && <ClientRuntimeNotice code={job.error_code || "hosted_job_failed"} />}
      {error && <ClientRuntimeNotice code={error} />}
    </section>
    {job?.status === "succeeded" && <section className="panel p-5"><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Hosted result</h2>{kind === "media" && typeof output.artifactId === "string" && <a href={`/api/client-runtime/artifacts/${output.artifactId}/download`} className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-2.5 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>{provider === "heygen" ? <FileVideo size={14} /> : <FileAudio size={14} />} Open tenant {provider === "heygen" ? "video" : "audio"} artifact <ExternalLink size={13} /></a>}{kind === "seo" && <pre className="mt-4 max-h-[440px] overflow-auto whitespace-pre-wrap rounded-md border p-4 text-[11px] leading-relaxed" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)", background: "rgba(255,255,255,0.025)" }}>{String(output.markdown ?? "No report returned.")}</pre>}{kind === "orchestration" && <div className="mt-4 grid gap-2 sm:grid-cols-2">{Array.isArray(output.steps) && (output.steps as WorkflowStep[]).map((step, index) => <div key={`${String(step.title)}-${index}`} className="rounded-md border p-3 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><div className="flex items-center gap-2"><CheckCircle2 size={13} color="#34d399" />{String(index + 1).padStart(2, "0")} · {String(step.title ?? "Completed step")}</div><p className="mt-2 leading-relaxed" style={{ color: "var(--cream-mute)" }}>{String(step.result ?? "Completed")}</p></div>)}</div>}</section>}
  </div>;
}
