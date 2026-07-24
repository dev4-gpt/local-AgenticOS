"use client";

import { useEffect, useState } from "react";
import { Bot, CheckCircle2, AlertCircle, Loader2, FileText, Code2, ClipboardPaste } from "lucide-react";

interface CrawlerResult { name: string; agent: string; allowed: boolean; }
interface AEOResult {
  site: string;
  robotsChecked: boolean;
  crawlers: CrawlerResult[];
  llmsTxt: { present: boolean; url: string };
  structuredData: { present: boolean };
  fetchedAt: string;
}

export default function AEOPanel({ sites }: { sites: string[] }) {
  const [site, setSite] = useState(sites[0] ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AEOResult | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);

  // `sites` arrives async (fetched by the parent after this panel already
  // mounted with an empty list), so the useState initializer above can miss
  // it - sync the default once it shows up, without stomping a manual pick.
  useEffect(() => {
    if (!site && sites.length) setSite(sites[0]);
  }, [sites, site]);

  async function runCheck() {
    const target = site.trim();
    if (!target || loading) return;
    setLoading(true); setError(null); setResult(null); setDraft(null);
    try {
      const res = await fetch(`/api/seo/aeo?site=${encodeURIComponent(target)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AEO check failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function generateDraft() {
    const target = site.trim();
    if (!target || drafting) return;
    setDrafting(true); setError(null);
    try {
      const res = await fetch("/api/seo/aeo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft failed");
      setDraft(data.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDrafting(false);
    }
  }

  const blockedCount = result?.crawlers.filter((c) => !c.allowed).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="panel p-4 flex items-center gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-[rgba(163,230,53,0.14)]">
          <Bot size={17} className="text-[#4d7c0f]" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium">Agent / Answer Engine Optimization</span>
          <p className="text-[11px] text-[var(--fg-dim)] max-w-xl mt-0.5">
            Checks whether AI crawlers (ChatGPT, Claude, Perplexity, Google AI) can actually reach the site, whether it publishes an <code className="metric">llms.txt</code>, and whether the homepage exposes structured data. Read-only — nothing is changed on the live site.
          </p>
        </div>
      </div>

      <div className="panel p-4 flex items-end gap-3 flex-wrap">
        <div className="min-w-[220px]">
          <label className="text-[11px] text-[var(--fg-dim)]">Site</label>
          {sites.length ? (
            <select value={site} onChange={(e) => setSite(e.target.value)} className="mt-1 w-full bg-[rgba(38,33,28,.06)] border border-[var(--panel-border)] rounded-lg px-3 h-[38px] text-sm outline-none focus:border-[var(--panel-border-hot)] text-[var(--fg)]">
              {sites.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="example.com" className="mt-1 w-full bg-[rgba(38,33,28,.06)] border border-[var(--panel-border)] rounded-lg px-3 h-[38px] text-sm outline-none focus:border-[var(--panel-border-hot)] text-[var(--fg)]" />
          )}
        </div>
        <button onClick={runCheck} disabled={loading || !site.trim()} className="flex items-center gap-2 px-4 h-[38px] rounded-lg border text-sm font-medium transition disabled:opacity-50 border-[rgba(163,230,53,0.4)] bg-[rgba(163,230,53,0.14)] text-lime-800 hover:bg-[rgba(163,230,53,0.2)]">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />} Run AEO check
        </button>
      </div>

      {error && (
        <div className="panel p-3 flex items-center gap-2 text-sm text-red-800 border-red-400/30 bg-[rgba(248,113,113,0.08)]">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="panel p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium">AI crawler access</span>
              {blockedCount === 0 ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(163,230,53,0.16)] text-lime-800 inline-flex items-center gap-1"><CheckCircle2 size={10} /> ALL ALLOWED</span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(251,191,36,0.16)] text-amber-800 inline-flex items-center gap-1"><AlertCircle size={10} /> {blockedCount} BLOCKED</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {result.crawlers.map((c) => (
                <div key={c.agent} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--panel-border)] text-[12.5px]">
                  <span className="text-[var(--fg-dim)]">{c.name} <code className="metric text-[10px]">{c.agent}</code></span>
                  {c.allowed ? (
                    <span className="text-lime-800 inline-flex items-center gap-1 shrink-0"><CheckCircle2 size={12} /> allowed</span>
                  ) : (
                    <span className="text-red-800 inline-flex items-center gap-1 shrink-0"><AlertCircle size={12} /> blocked</span>
                  )}
                </div>
              ))}
            </div>
            {!result.robotsChecked && (
              <p className="text-[11px] text-[var(--fg-dimmer)] mt-2">No robots.txt found or reachable — crawlers default to allowed with nothing to explicitly block them.</p>
            )}
          </div>

          <div className="panel p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <FileText size={16} className={result.llmsTxt.present ? "text-lime-700" : "text-[var(--fg-dim)]"} />
              <div>
                <span className="text-sm font-medium">llms.txt</span>
                <p className="text-[11px] text-[var(--fg-dim)]">{result.llmsTxt.present ? "Published — LLM crawlers can read a direct summary of the site." : "Not found at " + result.llmsTxt.url}</p>
              </div>
            </div>
            {result.llmsTxt.present ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(163,230,53,0.16)] text-lime-800 inline-flex items-center gap-1"><CheckCircle2 size={10} /> PRESENT</span>
            ) : (
              <button onClick={generateDraft} disabled={drafting} className="flex items-center gap-2 px-3 h-[34px] rounded-lg border text-[12.5px] font-medium transition disabled:opacity-50 border-[var(--panel-border)] hover:border-[rgba(163,230,53,0.4)]">
                {drafting ? <Loader2 size={13} className="animate-spin" /> : <ClipboardPaste size={13} />} Generate starter draft
              </button>
            )}
          </div>

          {draft && (
            <div className="panel p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Starter llms.txt draft</span>
                <button
                  onClick={() => navigator.clipboard.writeText(draft).catch(() => {})}
                  className="text-[11px] text-[var(--fg-dim)] hover:text-[var(--fg)] flex items-center gap-1"
                >
                  <ClipboardPaste size={12} /> Copy
                </button>
              </div>
              <p className="text-[11px] text-[var(--fg-dimmer)] mb-2">Template-filled from the site's own title/description — review, fill in the bracketed sections, and publish it at {result.llmsTxt.url} yourself.</p>
              <pre className="text-[11.5px] leading-relaxed whitespace-pre-wrap bg-[rgba(38,33,28,.06)] border border-[var(--panel-border)] rounded-lg p-3 max-h-[320px] overflow-auto">{draft}</pre>
            </div>
          )}

          <div className="panel p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Code2 size={16} className={result.structuredData.present ? "text-lime-700" : "text-[var(--fg-dim)]"} />
              <div>
                <span className="text-sm font-medium">Structured data (JSON-LD)</span>
                <p className="text-[11px] text-[var(--fg-dim)]">{result.structuredData.present ? "Found on the homepage — helps AI systems parse what the page actually is." : "None found on the homepage."}</p>
              </div>
            </div>
            {result.structuredData.present ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(163,230,53,0.16)] text-lime-800 inline-flex items-center gap-1"><CheckCircle2 size={10} /> PRESENT</span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(251,191,36,0.16)] text-amber-800 inline-flex items-center gap-1"><AlertCircle size={10} /> MISSING</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
