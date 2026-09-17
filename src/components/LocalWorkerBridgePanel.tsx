"use client";

import { useState } from "react";
import { CheckCircle2, Computer, Copy, KeyRound, LoaderCircle, Search, Send, Sparkles } from "lucide-react";

type Grant = { id: string; kind: string; label: string };
type WorkerStatus = { version: string; paired: boolean; grants: Grant[]; allowedOrigin: string };

const FIELD = { color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" } as const;

export default function LocalWorkerBridgePanel() {
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:43851");
  const [pairingCode, setPairingCode] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [scopeId, setScopeId] = useState("");
  const [query, setQuery] = useState("");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shared, setShared] = useState(false);

  function url(path: string) {
    return `${baseUrl.replace(/\/$/, "")}${path}`;
  }

  async function checkStatus() {
    setBusy(true); setError("");
    const response = await fetch(url("/v1/status"), { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || !data?.ok) setError(typeof data?.error === "string" ? data.error : "local_worker_unavailable");
    else { setStatus(data as WorkerStatus); setScopeId((current) => current || data.grants?.[0]?.id || ""); }
    setBusy(false);
  }

  async function pair() {
    if (!pairingCode.trim()) return;
    setBusy(true); setError("");
    const response = await fetch(url("/v1/pair"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: pairingCode.trim() }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || !data?.ok || typeof data.sessionToken !== "string") setError(typeof data?.error === "string" ? data.error : "local_pairing_failed");
    else { setSessionToken(data.sessionToken); setPairingCode(""); await checkStatus(); }
    setBusy(false);
  }

  async function runJob(body: Record<string, unknown>) {
    if (!sessionToken) { setError("local_worker_pairing_required"); return null; }
    setBusy(true); setError(""); setShared(false);
    const response = await fetch(url("/v1/jobs"), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${sessionToken}` }, body: JSON.stringify(body) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || !data?.ok) { setError(typeof data?.error === "string" ? data.error : "local_job_failed"); setBusy(false); return null; }
    setResult(data.result); setBusy(false); return data.result;
  }

  async function listModels() {
    const local = await runJob({ type: "list-local-models" }) as { models?: string[] } | null;
    if (local?.models) { setModels(local.models); setModel((current) => current || local.models?.[0] || ""); }
  }

  async function shareResult() {
    if (!result) return;
    setBusy(true); setError("");
    const details = JSON.stringify(result, null, 2).slice(0, 9_000);
    const response = await fetch("/api/client-runtime/requests", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "context", title: "Selected result from Local Worker", details: `The customer explicitly chose to share this Local Worker result with the tenant runtime.\n\n${details}`, fields: { source: "local-worker", explicitShare: true } }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(typeof data?.error === "string" ? data.error : "local_result_share_failed");
    else setShared(true);
    setBusy(false);
  }

  const paired = Boolean(sessionToken);
  return <section className="panel p-5 md:p-6">
    <div className="flex flex-wrap items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: "#5eead4", borderColor: "rgba(94,234,212,0.32)", background: "rgba(94,234,212,0.1)" }}><Computer size={18} /></div><div className="min-w-0 flex-1"><p className="eyebrow">Paired Local Worker</p><h2 className="mt-1 text-[20px] font-semibold" style={{ color: "var(--cream)" }}>Use your selected local sources and models.</h2><p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>The worker is loopback-only. Results stay on this device until you explicitly choose to share one with the tenant runtime.</p></div></div>
    <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]"><label><span className="mb-1 block text-[9px] uppercase tracking-[0.12em]" style={{ color: "var(--cream-mute)" }}>Local Worker address</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} className="w-full rounded-md border px-3 py-2 text-[11px]" style={FIELD} /></label><button type="button" onClick={() => void checkStatus()} disabled={busy} className="self-end rounded-md px-3 py-2 text-[10.5px] font-semibold disabled:opacity-50" style={{ color: "#07111d", background: "#5eead4" }}>{busy ? <LoaderCircle size={13} className="animate-spin" /> : "Check local worker"}</button></div>
    {status && <p className="mt-3 text-[10.5px]" style={{ color: "var(--cream-mute)" }}>Worker {status.version} · {status.grants.length} local scopes · allows {status.allowedOrigin}</p>}
    {!paired && <div className="mt-4 rounded-md border p-3" style={{ borderColor: "var(--line-soft)" }}><p className="text-[11px]" style={{ color: "var(--cream-dim)" }}><KeyRound size={12} className="mr-1 inline" />Start the Local Worker on this device, then paste the one-time code shown in its terminal.</p><div className="mt-3 flex gap-2"><input value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} placeholder="One-time pairing code" className="min-w-0 flex-1 rounded-md border px-3 py-2 text-[11px]" style={FIELD} /><button type="button" onClick={() => void pair()} disabled={busy || !pairingCode.trim()} className="rounded-md border px-3 py-2 text-[10.5px] font-semibold disabled:opacity-50" style={{ borderColor: "rgba(94,234,212,0.4)", color: "#5eead4" }}>Pair</button></div></div>}
    {paired && <div className="mt-4 space-y-4"><div className="grid gap-3 md:grid-cols-[1fr_auto]"><label><span className="mb-1 block text-[9px] uppercase tracking-[0.12em]" style={{ color: "var(--cream-mute)" }}>Approved local scope</span><select value={scopeId} onChange={(event) => setScopeId(event.target.value)} className="w-full rounded-md border px-3 py-2 text-[11px]" style={FIELD}><option value="">Choose a configured scope</option>{status?.grants.map((grant) => <option key={grant.id} value={grant.id}>{grant.label} · {grant.kind}</option>)}</select></label><div className="self-end"><button type="button" onClick={() => void listModels()} disabled={busy} className="rounded-md border px-3 py-2 text-[10.5px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>Discover Ollama models</button></div></div>
      <div className="grid gap-3 md:grid-cols-2"><div className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)" }}><p className="text-[11px] font-semibold" style={{ color: "var(--cream)" }}><Search size={12} className="mr-1 inline" />Search selected sources</p><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the approved scope" className="mt-3 w-full rounded-md border px-3 py-2 text-[11px]" style={FIELD} /><button type="button" onClick={() => void runJob({ type: "search-selected-sources", scopeId, query })} disabled={busy || !scopeId || !query.trim()} className="mt-3 rounded-md px-3 py-2 text-[10.5px] font-semibold disabled:opacity-50" style={{ color: "#07111d", background: "#5eead4" }}>Search locally</button></div>
        <div className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)" }}><p className="text-[11px] font-semibold" style={{ color: "var(--cream)" }}><Sparkles size={12} className="mr-1 inline" />Run a local Ollama model</p><select value={model} onChange={(event) => setModel(event.target.value)} className="mt-3 w-full rounded-md border px-3 py-2 text-[11px]" style={FIELD}><option value="">Discover and choose a model</option>{models.map((item) => <option key={item} value={item}>{item}</option>)}</select><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Prompt stays local unless you share its result" className="mt-3 min-h-[70px] w-full rounded-md border px-3 py-2 text-[11px]" style={FIELD} /><button type="button" onClick={() => void runJob({ type: "run-local-model", model, prompt })} disabled={busy || !model || !prompt.trim()} className="mt-3 rounded-md px-3 py-2 text-[10.5px] font-semibold disabled:opacity-50" style={{ color: "#07111d", background: "#5eead4" }}>Run locally</button></div></div>
    </div>}
    {error && <p className="mt-4 text-[10.5px]" style={{ color: "#fda4af" }}>{error}</p>}
    {result !== null && <div className="mt-4 rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.02)" }}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] font-semibold" style={{ color: "var(--cream)" }}>Local result</p>{shared ? <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "#34d399" }}><CheckCircle2 size={12} />Shared by you</span> : <button type="button" onClick={() => void shareResult()} disabled={busy} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px]" style={{ borderColor: "rgba(94,234,212,0.4)", color: "#5eead4" }}><Send size={11} />Share selected result to cloud</button>}</div><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{JSON.stringify(result, null, 2)}</pre></div>}
  </section>;
}
