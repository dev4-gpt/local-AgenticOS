"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, CheckCircle2, Clock3, Clipboard, KeyRound, LockKeyhole, Send, ShieldCheck, Trash2, XCircle } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";

type Message = { id: string; role: "user" | "assistant"; content: string; jobId?: string; createdAt: number };
type VisibleMessage = Message & { repeatCount: number };
type RuntimeStatus = { providerCallsEnabled?: boolean; clientEdition?: boolean };
type Credential = { key: string; label: string; connected: boolean };
type ReviewedPlan = {
  type?: string;
  tool?: string;
  plan?: {
    summary?: string;
    approvalRequired?: boolean;
    steps?: Array<{ title?: string; rationale?: string; owner?: string }>;
  };
};

const PROVIDER_REQUIREMENTS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  codex: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  openclaw: "OPENROUTER_API_KEY",
  hermes: "OPENROUTER_API_KEY",
  freeclaude: "OPENROUTER_API_KEY",
  fusion: "OPENROUTER_API_KEY",
  gemini: "GEMINI_API_KEY",
  antigravity: "GEMINI_API_KEY",
  moonshot: "MOONSHOT_API_KEY",
  kimi: "MOONSHOT_API_KEY",
  glm: "GLM_API_KEY",
  "glm-code": "GLM_API_KEY",
  xai: "XAI_API_KEY",
  grok: "XAI_API_KEY",
  sakana: "SAKANA_API_KEY",
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude API",
  openai: "Codex-compatible OpenAI API",
  codex: "Codex-compatible OpenAI API",
  openrouter: "OpenRouter API",
  openclaw: "OpenRouter API adapter for OpenClaw",
  hermes: "OpenRouter API adapter for Hermes",
  freeclaude: "OpenRouter free-model adapter",
  fusion: "OpenRouter API adapter for Fusion",
  gemini: "Gemini API",
  antigravity: "Gemini API adapter for Antigravity",
  moonshot: "Kimi API",
  kimi: "Kimi API",
  glm: "GLM API",
  "glm-code": "GLM API",
  xai: "Grok API",
  grok: "Grok API",
  sakana: "Sakana API",
};

export default function ClientProviderWorkspace({ provider, title }: { provider: string; title: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "queued" | "error">("loading");
  const [runtime, setRuntime] = useState<RuntimeStatus>({});
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [error, setError] = useState("");
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestRef = useRef<string | null>(null);
  const completedJobsRef = useRef<Set<string>>(new Set());
  const storageKey = `veloce-client-provider-chat:${provider}`;
  const requiredKey = PROVIDER_REQUIREMENTS[provider];
  const providerLabel = PROVIDER_LABELS[provider] ?? provider;
  const connected = useMemo(() => credentials.find((item) => item.key === requiredKey)?.connected === true, [credentials, requiredKey]);
  const visibleMessages = useMemo(() => collapseRepeatedMessages(messages), [messages]);

  useEffect(() => {
    let cancelled = false;
    setHydratedStorageKey(null);
    const stored = loadStoredMessages(storageKey);
    setMessages(stored);
    completedJobsRef.current = new Set(stored.map((message) => message.jobId).filter((jobId): jobId is string => Boolean(jobId)));
    setHydratedStorageKey(storageKey);
    Promise.all([
      fetch("/api/client-runtime/credentials", { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
      fetch(`/api/client-runtime/provider-history?provider=${encodeURIComponent(provider)}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
    ])
      .then(([credentialData, historyData]) => {
        if (cancelled) return;
        setRuntime(credentialData?.mode ?? {});
        setCredentials(credentialData?.credentials ?? []);
        if (Array.isArray(historyData?.messages)) {
          setMessages((current) => mergePersistentMessages(historyData.messages, current));
        }
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) { setStatus("error"); setError("runtime_status_unavailable"); } });
    return () => { cancelled = true; if (pollRef.current) clearTimeout(pollRef.current); activeRequestRef.current = null; };
  }, [storageKey]);

  useEffect(() => {
    if (hydratedStorageKey !== storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(messages.slice(-80))); } catch {}
  }, [hydratedStorageKey, messages, storageKey]);

  async function submit() {
    const value = prompt.trim();
    if (!value || status === "queued" || activeRequestRef.current) return;
    const requestId = crypto.randomUUID();
    activeRequestRef.current = requestId;
    setError("");
    setMessages((current) => [...current, { id: requestId, role: "user", content: value, createdAt: Date.now() }]);
    setPrompt("");
    setStatus("queued");
    const response = await fetch("/api/client-runtime/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, prompt: value, history: messages.slice(-12).map(({ role, content }) => ({ role, content })), idempotencyKey: requestId }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || !data?.jobId) {
      setStatus("error");
      setError(data?.error || "task_enqueue_failed");
      activeRequestRef.current = null;
      return;
    }
    setMessages((current) => current.map((message) => message.id === requestId ? { ...message, jobId: data.jobId } : message));
    poll(data.jobId, requestId);
  }

  function poll(jobId: string, requestId: string) {
    let attempts = 0;
    const tick = async () => {
      if (activeRequestRef.current !== requestId) return;
      attempts += 1;
      const response = await fetch(`/api/client-runtime/jobs/${jobId}`, { cache: "no-store" }).catch(() => null);
      const data = await response?.json().catch(() => null);
      const job = data?.job;
      if (job?.status === "succeeded") {
        const output = typeof job.output_metadata?.output === "string" ? job.output_metadata.output : "The provider completed without text output.";
        completedJobsRef.current.add(jobId);
        setMessages((current) => current.some((message) => message.jobId === jobId)
          ? current
          : [...current, { id: crypto.randomUUID(), role: "assistant", content: output, jobId, createdAt: Date.now() }]);
        setStatus("ready");
        activeRequestRef.current = null;
        if (pollRef.current) clearTimeout(pollRef.current);
      } else if (job?.status === "failed" || job?.status === "cancelled" || attempts >= 90) {
        setStatus("error");
        setError(job?.error_code || "provider_job_incomplete");
        activeRequestRef.current = null;
        if (pollRef.current) clearTimeout(pollRef.current);
      } else if (!completedJobsRef.current.has(jobId)) {
        pollRef.current = setTimeout(tick, 1100);
      }
    };
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = setTimeout(tick, 700);
  }

  function clearChat() {
    if (status === "queued") return;
    setMessages([]);
    setError("");
    try { localStorage.removeItem(storageKey); } catch {}
  }

  const blocked = !runtime.providerCallsEnabled || !connected;
  return (
    <div className="space-y-5">
      <section className="panel p-5 md:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.28)", color: "#60a5fa" }}><LockKeyhole size={18} /></div>
          <div className="min-w-0"><p className="eyebrow">Client API workspace</p><h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{title}</h1><p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>Tenant-scoped provider access through an approved API adapter. No local CLI, operator vault, or laptop filesystem is used.</p></div>
        </div>
      </section>

      <section className="panel p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap"><div className="flex items-center gap-2"><ShieldCheck size={15} color="#92400e" /><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Provider boundary</h2></div><span className="rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em]" style={{ color: runtime.providerCallsEnabled && connected ? "#047857" : "#92400e", background: runtime.providerCallsEnabled && connected ? "rgba(16,185,129,0.12)" : "rgba(251,191,36,0.14)", borderColor: runtime.providerCallsEnabled && connected ? "rgba(4,120,87,0.28)" : "rgba(146,64,14,0.28)" }}>{runtime.providerCallsEnabled && connected ? "Approved and connected" : "Not enabled"}</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 text-[11px]" style={{ color: "var(--cream-dim)" }}><div className="flex items-center gap-2">{connected ? <CheckCircle2 size={14} color="#047857" /> : <XCircle size={14} color="#991b1b" />} {providerLabel}: {connected ? "Connected" : "Not connected"}</div><div className="flex items-center gap-2"><Clock3 size={14} color="#1d4ed8" /> Long work uses the tenant queue</div></div>
        {(!runtime.providerCallsEnabled || !connected) && <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: "var(--cream-mute)" }}>{!connected && <Link href="/credentials" className="inline-flex items-center gap-2 rounded-md border px-3 py-2" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><KeyRound size={13} /> Manage credentials</Link>}<span>{!runtime.providerCallsEnabled ? "Provider calls require manual Veloce approval." : "Add the approved provider key to continue."}</span></div>}
      </section>

      <section className="panel p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>Provider thread</p>
          {messages.length > 0 && <button type="button" onClick={clearChat} disabled={status === "queued"} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Trash2 size={12} />Clear</button>}
        </div>
        <div className="min-h-[260px] space-y-4">
          {visibleMessages.length === 0 && <div className="grid min-h-[220px] place-items-center text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>Ask an approved question when this provider is enabled.</div>}
          {visibleMessages.map((message) => <ProviderMessage key={message.id} message={message} />)}
        </div>
        <div className="mt-4 flex items-end gap-2 border-t pt-4" style={{ borderColor: "var(--line-soft)" }}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={blocked || status === "queued"} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(); } }} className="min-h-[48px] flex-1 resize-y rounded-md border px-3 py-2 text-[12px] outline-none" style={{ background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)", color: "var(--cream)" }} placeholder={blocked ? "Provider access is awaiting approval" : "Ask the approved provider..."} /><button type="button" onClick={submit} disabled={blocked || !prompt.trim() || status === "queued"} className="inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-[11px] font-semibold" style={{ background: blocked ? "rgba(255,255,255,0.08)" : "#60a5fa", color: blocked ? "var(--cream-mute)" : "#07111d" }}><Send size={13} />{status === "queued" ? "Working" : "Send"}</button></div>
        {error && <ClientRuntimeNotice code={error} />}
      </section>
    </div>
  );
}

function ProviderMessage({ message }: { message: VisibleMessage }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const reviewedPlan = !isUser ? parseReviewedPlan(message.content) : null;
  async function copy() {
    await navigator.clipboard?.writeText(message.content).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <article
      className={`group max-w-[92%] rounded-lg border p-3 text-[13px] leading-relaxed shadow-sm ${isUser ? "ml-auto" : "mr-auto"}`}
      style={{
        borderColor: isUser ? "rgba(96,165,250,0.34)" : "rgba(15,23,42,0.12)",
        background: isUser ? "rgba(96,165,250,0.09)" : "rgba(255,255,255,0.72)",
        color: isUser ? "var(--cream)" : "#1f2937",
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: isUser ? "var(--cream-mute)" : "#64748b" }}>{isUser ? "Prompt" : "Result"}</span>
        <div className="flex items-center gap-2">
          {message.repeatCount > 1 && <span className="rounded-md border px-2 py-1 text-[10px]" style={{ borderColor: "rgba(245,158,11,0.35)", color: "#92400e", background: "rgba(245,158,11,0.12)" }}>{message.repeatCount} repeated</span>}
          <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] opacity-80 transition group-hover:opacity-100" style={{ borderColor: "rgba(100,116,139,0.22)", color: isUser ? "var(--cream-dim)" : "#475569" }}>{copied ? <Check size={11} /> : <Clipboard size={11} />}{copied ? "Copied" : "Copy"}</button>
        </div>
      </div>
      {reviewedPlan ? <ReviewedPlanCard value={reviewedPlan} /> : isUser ? <p className="whitespace-pre-wrap">{message.content}</p> : <ProviderMarkdown text={message.content} />}
    </article>
  );
}

function ProviderMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h1 className="text-[20px] font-semibold leading-tight text-slate-950" {...props} />,
          h2: (props) => <h2 className="mt-4 text-[17px] font-semibold leading-tight text-slate-900" {...props} />,
          h3: (props) => <h3 className="mt-3 text-[15px] font-semibold leading-tight text-slate-900" {...props} />,
          p: (props) => <p className="my-2 leading-7 text-slate-700" {...props} />,
          ul: (props) => <ul className="my-2 list-disc space-y-1 pl-5 text-slate-700" {...props} />,
          ol: (props) => <ol className="my-2 list-decimal space-y-1 pl-5 text-slate-700" {...props} />,
          li: (props) => <li className="leading-7" {...props} />,
          strong: (props) => <strong className="font-semibold text-slate-950" {...props} />,
          a: (props) => <a className="font-medium text-blue-700 underline underline-offset-2" target={props.href?.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" {...props} />,
          code: (props) => <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-800" {...props} />,
          pre: (props) => <pre className="my-3 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-[12px] leading-relaxed" {...props} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function ReviewedPlanCard({ value }: { value: ReviewedPlan }) {
  const plan = value.plan ?? {};
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-4 text-slate-800">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-700">Reviewed plan</p>
          <h3 className="mt-1 text-[16px] font-semibold text-slate-950">Human approval required</h3>
        </div>
        <span className="rounded-md border border-emerald-300 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Structured</span>
      </div>
      {plan.summary && <p className="mt-3 text-[13px] leading-7 text-slate-700">{plan.summary}</p>}
      {steps.length > 0 && <div className="mt-4 grid gap-3">{steps.map((step, index) => <div key={`${step.title}-${index}`} className="rounded-md border border-emerald-200 bg-white/70 p-3"><div className="flex items-start gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-emerald-100 text-[11px] font-semibold text-emerald-700">{index + 1}</span><div className="min-w-0"><p className="font-semibold text-slate-950">{step.title ?? "Untitled step"}</p>{step.owner && <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">Owner: {step.owner}</p>}{step.rationale && <p className="mt-2 text-[12px] leading-6 text-slate-700">{step.rationale}</p>}</div></div></div>)}</div>}
    </div>
  );
}

function parseReviewedPlan(content: string): ReviewedPlan | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as ReviewedPlan;
    return parsed?.type === "reviewed_plan" && parsed?.tool === "propose_reviewed_plan" ? parsed : null;
  } catch {
    return null;
  }
}

function collapseRepeatedMessages(messages: Message[]): VisibleMessage[] {
  const output: VisibleMessage[] = [];
  for (const message of messages) {
    const previous = output[output.length - 1];
    if (previous && previous.role === message.role && previous.content === message.content) {
      previous.repeatCount += 1;
      continue;
    }
    output.push({ ...message, repeatCount: 1 });
  }
  return output;
}

function mergePersistentMessages(serverMessages: Message[], localMessages: Message[]): Message[] {
  const server = serverMessages
    .filter((message) => (message?.role === "user" || message?.role === "assistant") && typeof message.content === "string")
    .map((message, index) => ({
      id: typeof message.id === "string" ? message.id : `server-${index}`,
      role: message.role,
      content: message.content,
      jobId: typeof message.jobId === "string" ? message.jobId : undefined,
      createdAt: typeof message.createdAt === "number" ? message.createdAt : Date.now(),
    }));
  const serverJobIds = new Set(server.map((message) => message.jobId).filter((jobId): jobId is string => Boolean(jobId)));
  const serverMessageKeys = new Set(server.map((message) => `${message.role}:${message.content}`));
  const pendingLocal = localMessages.filter((message) => {
    if (message.jobId && serverJobIds.has(message.jobId)) return false;
    return !serverMessageKeys.has(`${message.role}:${message.content}`);
  });
  return [...server, ...pendingLocal].sort((left, right) => left.createdAt - right.createdAt);
}

function loadStoredMessages(storageKey: string): Message[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as Partial<Message>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
      .map((item, index) => ({
        id: typeof item.id === "string" ? item.id : `stored-${index}-${Date.now()}`,
        role: item.role as "user" | "assistant",
        content: item.content ?? "",
        jobId: typeof item.jobId === "string" ? item.jobId : undefined,
        createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
      }));
  } catch {
    return [];
  }
}
