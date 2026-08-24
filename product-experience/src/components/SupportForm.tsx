"use client";

import { useState } from "react";

const managedProviders = [
  ["OPENAI_API_KEY", "OpenAI"], ["ANTHROPIC_API_KEY", "Anthropic"], ["OPENROUTER_API_KEY", "OpenRouter"],
  ["GEMINI_API_KEY", "Google Gemini"], ["MOONSHOT_API_KEY", "Moonshot / Kimi"], ["GLM_API_KEY", "GLM / Z.ai"],
  ["XAI_API_KEY", "xAI / Grok"], ["SAKANA_API_KEY", "Sakana Fugu"], ["GROQ_API_KEY", "Groq Speech-to-Text"],
  ["ELEVENLABS_API_KEY", "ElevenLabs"], ["ELEVENLABS_MUSIC_API_KEY", "ElevenLabs Music"], ["HEYGEN_API_KEY", "HeyGen"],
  ["SUNO_API_KEY", "Suno"], ["FIRECRAWL_API_KEY", "Firecrawl"], ["BRAVE_API_KEY", "Brave Search"], ["HUNTER_API_KEY", "Hunter"],
] as const;

export function SupportForm() {
  const [notice, setNotice] = useState("We will return a request ID after the message is recorded.");
  const [busy, setBusy] = useState(false);
  const [requestType, setRequestType] = useState("general");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(data.entries())) }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setBusy(false);
    if (response?.ok && body?.requestId) { event.currentTarget.reset(); setNotice(`Support request ${String(body.requestId).slice(0, 8)}… received. Check your email for acknowledgement.`); return; }
    setNotice(body?.error === "secret_like_content" ? "Remove credentials or tokens from the message." : "Support is temporarily unavailable. Please try again shortly.");
  }
  return <form onSubmit={submit} className="grid gap-4">
    <input name="email" required type="email" placeholder="you@company.com" className="rounded-lg border border-[var(--g5)]/18 bg-white/70 px-4 py-3 text-sm" />
    <label className="grid gap-2 text-sm font-semibold">What do you need?
      <select name="requestType" value={requestType} onChange={(event) => setRequestType(event.target.value)} className="rounded-lg border border-[var(--g5)]/18 bg-white/70 px-4 py-3 text-sm font-normal">
        <option value="general">General support</option>
        <option value="managed_provider_access">Ask Veloce to manage a provider for me</option>
      </select>
    </label>
    {requestType === "managed_provider_access" && <div className="grid gap-3 rounded-xl border border-amber-700/20 bg-amber-50/60 p-4 text-sm">
          <p className="leading-relaxed text-[var(--g5)]/68">This sends a request to the Veloce team. It does not activate a provider or charge you. OpenRouter is the first managed route; other providers require separate promotion review. If approved, Veloce would pay the provider and use your Veloce wallet for governed usage.</p>
      <label className="grid gap-2 font-semibold">Provider
        <select name="providerKey" required className="rounded-lg border border-[var(--g5)]/18 bg-white/70 px-4 py-3 font-normal">
          <option value="">Choose a provider</option>
          {managedProviders.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label className="grid gap-2 font-semibold">Requested monthly budget (USD)
        <input name="requestedBudgetUsd" required min="1" max="100000" step="0.01" type="number" placeholder="25.00" className="rounded-lg border border-[var(--g5)]/18 bg-white/70 px-4 py-3 font-normal" />
      </label>
    </div>}
    <input name="subject" required placeholder="Subject" className="rounded-lg border border-[var(--g5)]/18 bg-white/70 px-4 py-3 text-sm" />
    <input name="requestId" placeholder="Request or tenant ID (optional)" className="rounded-lg border border-[var(--g5)]/18 bg-white/70 px-4 py-3 text-sm" />
    <textarea name="message" required rows={7} placeholder="Describe the issue or intended provider use without secrets..." className="rounded-lg border border-[var(--g5)]/18 bg-white/70 px-4 py-3 text-sm" />
    <div className="flex items-center justify-between gap-4"><p aria-live="polite" className="text-xs leading-relaxed text-[var(--g5)]/62">{notice}</p><button disabled={busy} className="rounded-full bg-[var(--g5)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Sending…" : "Contact support"}</button></div>
  </form>;
}
