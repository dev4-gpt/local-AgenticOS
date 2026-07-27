"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, KeyRound, LockKeyhole, Send, ShieldCheck, XCircle } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };
type RuntimeStatus = { providerCallsEnabled?: boolean; clientEdition?: boolean };
type Credential = { key: string; label: string; connected: boolean };

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requiredKey = PROVIDER_REQUIREMENTS[provider];
  const providerLabel = PROVIDER_LABELS[provider] ?? provider;
  const connected = useMemo(() => credentials.find((item) => item.key === requiredKey)?.connected === true, [credentials, requiredKey]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/client-runtime/credentials", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (cancelled) return;
        setRuntime(data?.mode ?? {});
        setCredentials(data?.credentials ?? []);
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) { setStatus("error"); setError("Runtime status could not be loaded."); } });
    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function submit() {
    const value = prompt.trim();
    if (!value || status === "queued") return;
    setError("");
    setMessages((current) => [...current, { role: "user", content: value }]);
    setPrompt("");
    setStatus("queued");
    const response = await fetch("/api/client-runtime/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, prompt: value, history: messages.slice(-12) }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || !data?.jobId) {
      setStatus("error");
      setError(data?.error === "provider_calls_require_approval" ? "Provider calls are awaiting Veloce approval." : data?.error || "The request could not be queued.");
      return;
    }
    poll(data.jobId);
  }

  function poll(jobId: string) {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      const response = await fetch(`/api/client-runtime/jobs/${jobId}`, { cache: "no-store" }).catch(() => null);
      const data = await response?.json().catch(() => null);
      const job = data?.job;
      if (job?.status === "succeeded") {
        const output = typeof job.output_metadata?.output === "string" ? job.output_metadata.output : "The provider completed without text output.";
        setMessages((current) => [...current, { role: "assistant", content: output }]);
        setStatus("ready");
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (job?.status === "failed" || job?.status === "cancelled" || attempts >= 90) {
        setStatus("error");
        setError(job?.error_code || "The provider job did not complete.");
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 1000);
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
        <div className="flex items-center justify-between gap-3 flex-wrap"><div className="flex items-center gap-2"><ShieldCheck size={15} color="#fbbf24" /><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Provider boundary</h2></div><span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: runtime.providerCallsEnabled && connected ? "#34d399" : "var(--cream-mute)" }}>{runtime.providerCallsEnabled && connected ? "Approved and connected" : "Not enabled"}</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 text-[11px]" style={{ color: "var(--cream-dim)" }}><div className="flex items-center gap-2">{connected ? <CheckCircle2 size={14} color="#34d399" /> : <XCircle size={14} color="#fda4af" />} {providerLabel}: {connected ? "Connected" : "Not connected"}</div><div className="flex items-center gap-2"><Clock3 size={14} color="#60a5fa" /> Long work uses the tenant queue</div></div>
        {(!runtime.providerCallsEnabled || !connected) && <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: "var(--cream-mute)" }}>{!connected && <Link href="/credentials" className="inline-flex items-center gap-2 rounded-md border px-3 py-2" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><KeyRound size={13} /> Manage credentials</Link>}<span>{!runtime.providerCallsEnabled ? "Provider calls require manual Veloce approval." : "Add the approved provider key to continue."}</span></div>}
      </section>

      <section className="panel p-5">
        <div className="min-h-[260px] space-y-3">{messages.length === 0 && <div className="grid min-h-[220px] place-items-center text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>Ask an approved question when this provider is enabled.</div>}{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`max-w-[88%] rounded-lg border p-3 text-[12px] leading-relaxed ${message.role === "user" ? "ml-auto" : "mr-auto"}`} style={{ borderColor: message.role === "user" ? "rgba(96,165,250,0.3)" : "var(--line-soft)", background: message.role === "user" ? "rgba(96,165,250,0.08)" : "rgba(255,255,255,0.025)", color: "var(--cream-dim)" }}>{message.content}</div>)}</div>
        <div className="mt-4 flex items-end gap-2 border-t pt-4" style={{ borderColor: "var(--line-soft)" }}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={blocked || status === "queued"} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(); } }} className="min-h-[48px] flex-1 resize-y rounded-md border px-3 py-2 text-[12px] outline-none" style={{ background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)", color: "var(--cream)" }} placeholder={blocked ? "Provider access is awaiting approval" : "Ask the approved provider..."} /><button type="button" onClick={submit} disabled={blocked || !prompt.trim() || status === "queued"} className="inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-[11px] font-semibold" style={{ background: blocked ? "rgba(255,255,255,0.08)" : "#60a5fa", color: blocked ? "var(--cream-mute)" : "#07111d" }}><Send size={13} />{status === "queued" ? "Working" : "Send"}</button></div>
        {error && <p className="mt-3 text-[11px]" style={{ color: "#fda4af" }}>{error}</p>}
      </section>
    </div>
  );
}
