"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Check, Download, GitBranch, LoaderCircle, Pin, PinOff, Play, Plus, RotateCw, Trash2, TriangleAlert, X,
} from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import { localPipelineArtifactUrl, localPipelineItem, pipelineRequest, type PipelineTarget } from "@/lib/pipelineTransport";
import {
  PIPELINE_COLUMNS, pipelineCanBuild, pipelineCanShape, pipelineColumnItems, pipelineCounts,
  pipelineStatusLabel, pipelineTimeAgo, type PipelineItem,
} from "@/lib/clientPipelineAdapter";

const ACCENT = "#60a5fa";
const ROUTE_COLOR: Record<string, string> = {
  project: "#60a5fa", action: "#5ab896", idea: "#fbbf24", reference: "#c4b5fd", escalate: "#fca5a5",
};

export default function ClientPipelineWorkspace({ target = "cloud" }: { target?: PipelineTarget }) {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composer, setComposer] = useState(false);
  const [idea, setIdea] = useState("");
  const [view, setView] = useState<"board" | "artifacts">("board");
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);

  const load = useCallback(async () => {
    const response = await fetch(target === "cloud" ? "/api/client-runtime/pipeline" : "/api/pipeline", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) { setError(typeof data?.error === "string" ? data.error : "pipeline_read_failed"); return; }
    if (data?.configured === false || data?.available === false) { setConfigured(false); setError("pipeline_unavailable"); return; }
    setConfigured(true);
    setError("");
    const next: PipelineItem[] = Array.isArray(data?.items) ? (target === "local" ? data.items.map(localPipelineItem) : data.items) : [];
    setItems(next);
    setSelectedId((current) => current && next.some((item) => item.id === current) ? current : null);
  }, [target]);

  // load awaits the network response before updating state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // Poll only while a shaping or build job is genuinely in flight.
  const inFlight = items.some((item) => item.executionState === "queued" || item.executionState === "running");
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => { void load(); }, 3000);
    return () => window.clearInterval(timer);
  }, [inFlight, load]);

  async function call(init: RequestInit, key: string, query = "") {
    if (activeRequest.current) return null;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(key);
    setError("");
    const request = pipelineRequest(target, { ...init, signal: controller.signal }, query);
    const response = await fetch(request.url, request.init).catch(() => null);
    const data = await response?.json().catch(() => null);
    activeRequest.current = null;
    setBusy("");
    if (controller.signal.aborted) { await load(); setError("Request stopped. Refresh to check whether the operation completed."); return null; }
    if (!response?.ok || data?.ok === false) { setError(typeof data?.error === "string" ? data.error : "pipeline_request_failed"); return null; }
    await load();
    return data as Record<string, unknown>;
  }

  const json = (body: Record<string, unknown>, method = "POST"): RequestInit =>
    ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  async function openArtifact(artifactId: string) {
    if (target === "local") {
      try { window.open(localPipelineArtifactUrl(artifactId), "_blank", "noopener,noreferrer"); }
      catch { setError("artifact_path_invalid"); }
      return;
    }
    const response = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.downloadUrl !== "string") { setError(typeof data?.error === "string" ? data.error : "artifact_download_failed"); return; }
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  const counts = useMemo(() => pipelineCounts(items), [items]);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const rejected = items.filter((item) => item.stage === "rejected");

  if (!configured) return <div className="space-y-5 pb-8">
    <Header counts={{}} />
    <section className="panel p-6 text-center">
      <TriangleAlert size={24} className="mx-auto" style={{ color: "#fbbf24" }} />
      <h2 className="mt-3 text-[14px] font-semibold" style={{ color: "var(--cream)" }}>Pipeline storage needs setup</h2>
      <p className="mx-auto mt-2 max-w-[520px] text-[11.5px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>
        {target === "local" ? "Connect your local workspace, then reload the pipeline." : "Your cloud workspace needs its pipeline storage configured. Contact your workspace administrator, then reload."}
      </p>
    </section>
  </div>;

  return <div className="space-y-5 pb-8">
    <Header counts={counts} />

    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
        <div className="flex items-center gap-2">
          <GitBranch size={14} color={ACCENT} />
          <h2 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Idea funnel</h2>
          <span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{items.length} items</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setView(view === "board" ? "artifacts" : "board")} className="rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>{view === "board" ? "Artifact gallery" : "Pipeline board"}</button>
          <button type="button" onClick={() => void load()} title="Refresh pipeline" className="p-1.5" style={{ color: "var(--cream-mute)" }}><RotateCw size={13} /></button>
          <button type="button" onClick={() => setComposer((value) => !value)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-semibold" style={{ background: ACCENT, color: "#07111d" }}><Plus size={12} />Capture idea</button>
        </div>
      </div>
      {composer && <div className="border-b p-4" style={{ borderColor: "var(--line-soft)", background: "rgba(96,165,250,0.05)" }}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold" style={{ color: "#bfdbfe" }}>Capture</p>
          <button type="button" onClick={() => setComposer(false)} title="Close" style={{ color: "var(--cream-mute)" }}><X size={14} /></button>
        </div>
        <textarea value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="Raw input — no structure required. Shaping decides what it is."
          className="mt-3 min-h-[92px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed"
          style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>Saved to {target === "local" ? "this device" : "your cloud workspace"}. Shape and review before building.</p>
          <button type="button" disabled={!idea.trim() || busy === "capture"} onClick={async () => { if (await call(json({ action: "capture", idea: idea.trim() }), "capture")) { setIdea(""); setComposer(false); } }}
            className="inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold disabled:opacity-40" style={{ background: ACCENT, color: "#07111d" }}>
            {busy === "capture" ? <LoaderCircle size={12} className="animate-spin" /> : <Plus size={12} />}Capture
          </button>
        </div>
      </div>}

      {view === "artifacts" ? <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.filter((item) => item.buildArtifactId).map((item) => <Card key={item.id} item={item} selected={item.id === selectedId} onSelect={() => setSelectedId(item.id)} />)}
        {!items.some((item) => item.buildArtifactId) && <p className="text-sm" style={{ color: "var(--cream-mute)" }}>Completed artifacts will appear here.</p>}
      </div> : <div className="overflow-x-auto p-4">
        <div className="grid min-w-[1000px] grid-cols-5 gap-3">
          {PIPELINE_COLUMNS.map((column) => {
            const columnItems = pipelineColumnItems(items, column.key);
            return <div key={column.key}>
              <div className="mb-2 px-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--cream-dim)" }}>{column.label}</span>
                  <span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{columnItems.length}</span>
                </div>
                <p className="mt-0.5 text-[9.5px] leading-tight" style={{ color: "var(--cream-mute)" }}>{column.blurb}</p>
              </div>
              <div className="min-h-[160px] space-y-2 rounded-md border p-2" style={{ borderColor: column.key === "review" ? "rgba(251,191,36,0.3)" : "var(--line-soft)", background: column.key === "review" ? "rgba(251,191,36,0.04)" : "rgba(255,255,255,0.018)" }}>
                {columnItems.map((item) => <Card key={item.id} item={item} selected={item.id === selectedId} onSelect={() => setSelectedId(item.id)} />)}
                {columnItems.length === 0 && <p className="px-1 py-4 text-center text-[10px]" style={{ color: "var(--cream-mute)" }}>Empty</p>}
              </div>
            </div>;
          })}
        </div>
      </div>}
      {rejected.length > 0 && <div className="border-t px-4 py-2.5 text-[10.5px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}>
        {rejected.length} rejected at the gate · {rejected.slice(0, 4).map((item) => item.title).join(" · ")}
      </div>}
    </section>

    {busy && target === "local" && <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => activeRequest.current?.abort()}>Stop waiting for {busy}</button>}
    <fieldset disabled={Boolean(busy)} className="min-w-0">
    <Detail item={selected} busy={busy}
      onShape={() => selected && void call(json({ action: "shape", id: selected.id }), "shape")}
      onDecide={(decision) => selected && void call(json({ id: selected.id, decision }, "PATCH"), decision)}
      onBuild={() => selected && void call(json({ action: "build", id: selected.id }), "build")}
      onPin={() => selected && void call(json({ id: selected.id, pinned: !selected.pinned }, "PATCH"), "pin")}
      onDelete={() => { if (selected) { setSelectedId(null); void call({ method: "DELETE" }, "delete", `?id=${encodeURIComponent(selected.id)}`); } }}
      onOpenArtifact={openArtifact} />
    </fieldset>

    {error && <ClientRuntimeNotice code={error} />}
  </div>;
}

function Header({ counts }: { counts: Record<string, number> }) {
  return <section className="panel p-5 md:p-6">
    <div className="flex flex-wrap items-start gap-4">
      <div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: ACCENT, borderColor: "rgba(96,165,250,0.32)", background: "rgba(96,165,250,0.12)" }}><GitBranch size={18} /></div>
      <div className="min-w-0 flex-1">
        <p className="eyebrow">III. Orchestrate · Delivery flow</p>
        <h2 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>Idea to delivery</h2>
        <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          Capture an idea, shape a plan, review it, and build an artifact. Market-facing plans include a GTM scenario test with evidence-gathering and human review.
        </p>
      </div>
      <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: "rgba(90,184,150,0.28)", color: "#5ab896", background: "rgba(90,184,150,0.1)" }}>Human gate enforced</div>
    </div>
    {Object.keys(counts).length > 0 && <div className="mt-4 flex flex-wrap gap-2">
      {PIPELINE_COLUMNS.map((column) => <span key={column.key} className="rounded-md border px-2.5 py-1.5 text-[10.5px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>
        {column.label} · {counts[column.key] ?? 0}
      </span>)}
    </div>}
  </section>;
}

function Card({ item, selected, onSelect }: { item: PipelineItem; selected: boolean; onSelect: () => void }) {
  const running = item.executionState === "queued" || item.executionState === "running";
  return <motion.button layout type="button" onClick={onSelect} className="w-full rounded-md border p-2.5 text-left"
    style={{ borderColor: selected ? "rgba(96,165,250,0.5)" : "var(--line-soft)", background: selected ? "rgba(96,165,250,0.08)" : "var(--panel)" }}>
    <div className="flex items-start gap-1.5">
      {item.pinned && <Pin size={10} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />}
      <p className="line-clamp-2 flex-1 text-[11.5px] font-medium leading-snug" style={{ color: "var(--cream)" }}>{item.title}</p>
    </div>
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[9.5px]" style={{ color: "var(--cream-mute)" }}>
      {item.route && <span className="rounded px-1.5 py-0.5" style={{ background: `${ROUTE_COLOR[item.route]}1e`, color: ROUTE_COLOR[item.route] }}>{item.route}</span>}
      {item.confidence !== null && <span>{Math.round(item.confidence * 100)}%</span>}
      {item.buildArtifactId && <span style={{ color: "#5ab896" }}>artifact</span>}
      <span>{pipelineTimeAgo(item.createdAt)}</span>
    </div>
    {running && <p className="mt-1.5 flex items-center gap-1 text-[9.5px]" style={{ color: "#fbbf24" }}><LoaderCircle size={9} className="animate-spin" />{item.executionState}</p>}
    {item.executionState === "failed" && <p className="mt-1.5 text-[9.5px]" style={{ color: "#fca5a5" }}>{item.executionError ?? "failed"}</p>}
  </motion.button>;
}

function Detail({ item, busy, onShape, onDecide, onBuild, onPin, onDelete, onOpenArtifact }: {
  item: PipelineItem | null; busy: string;
  onShape: () => void; onDecide: (decision: "approve" | "reject") => void; onBuild: () => void;
  onPin: () => void; onDelete: () => void; onOpenArtifact: (id: string) => void;
}) {
  if (!item) return <section className="panel grid min-h-[140px] place-items-center p-6 text-center">
    <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>Select an item to shape it, decide at the gate, or build it.</p>
  </section>;

  const running = item.executionState === "queued" || item.executionState === "running";
  return <section className="panel overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{item.title}</p>
        <p className="mt-0.5 text-[10px]" style={{ color: "var(--cream-mute)" }}>{pipelineStatusLabel(item)} · {item.slug}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={onPin} title={item.pinned ? "Unpin" : "Pin"} className="rounded-md border p-1.5" style={{ borderColor: "var(--line-soft)", color: item.pinned ? "#fbbf24" : "var(--cream-mute)" }}>
          {item.pinned ? <PinOff size={12} /> : <Pin size={12} />}
        </button>
        <button type="button" onClick={onDelete} title="Delete item" className="rounded-md border p-1.5" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}><Trash2 size={12} /></button>
      </div>
    </div>

    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3">
        <Block label="Idea">{item.idea}</Block>
        {item.classification && <Block label="Classification">{item.classification}</Block>}
        {item.plan && <Block label="Proposed plan" mono>{item.plan}</Block>}
        {item.tasks && <Block label="Tasks" mono>{item.tasks}</Block>}
        {item.buildPreviewHtml && <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Sandboxed deliverable preview</p>
          <iframe title={`${item.title} deliverable`} sandbox="" referrerPolicy="no-referrer" srcDoc={sandboxed(item.buildPreviewHtml)} className="h-[260px] w-full rounded-md border bg-white" style={{ borderColor: "var(--line-soft)" }} />
        </div>}
      </div>

      <aside className="space-y-2">
        {pipelineCanShape(item) && <Action label={busy === "shape" ? "Queueing" : "Shape it"} hint="Classify, plan, and prepare for the gate" busy={busy === "shape"} onClick={onShape} color={ACCENT} />}
        {item.stage === "review" && <>
          <Action label="Approve" hint="Send to Execute" busy={busy === "approve"} onClick={() => onDecide("approve")} color="#5ab896" icon={<Check size={12} />} />
          <Action label="Reject" hint="Close it out" busy={busy === "reject"} onClick={() => onDecide("reject")} color="#fca5a5" icon={<X size={12} />} />
        </>}
        {pipelineCanBuild(item) && <Action label={busy === "build" ? "Starting" : "Build it"} hint="Run the approved plan" busy={busy === "build"} onClick={onBuild} color={ACCENT} icon={<Play size={12} />} />}
        {running && <p className="rounded-md border p-2.5 text-[10.5px]" style={{ borderColor: "var(--line-soft)", color: "#fbbf24" }}>Runner is {item.executionState}. Controls return when it settles.</p>}
        {item.buildArtifactId && <button type="button" onClick={() => onOpenArtifact(item.buildArtifactId!)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-[10.5px]" style={{ borderColor: "rgba(96,165,250,0.35)", color: "#93c5fd" }}><Download size={11} />Open artifact</button>}
        {item.tags.length > 0 && <div className="flex flex-wrap gap-1.5 pt-1">
          {item.tags.map((tag) => <span key={tag} className="rounded px-1.5 py-0.5 text-[9.5px]" style={{ background: "rgba(255,255,255,0.05)", color: "var(--cream-mute)" }}>{tag}</span>)}
        </div>}
      </aside>
    </div>
  </section>;
}

function Block({ label, children, mono }: { label: string; children: string; mono?: boolean }) {
  return <div>
    <p className="mb-1 text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>{label}</p>
    <p className={`whitespace-pre-wrap rounded-md border p-2.5 text-[11.5px] leading-relaxed ${mono ? "font-mono text-[10.5px]" : ""}`}
      style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.018)", color: "var(--cream-dim)" }}>{children}</p>
  </div>;
}

function Action({ label, hint, busy, onClick, color, icon }: { label: string; hint: string; busy: boolean; onClick: () => void; color: string; icon?: React.ReactNode }) {
  return <button type="button" disabled={busy} onClick={onClick} className="w-full rounded-md px-3 py-2.5 text-left disabled:opacity-40" style={{ background: `${color}1e`, border: `1px solid ${color}55` }}>
    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color }}>
      {busy ? <LoaderCircle size={12} className="animate-spin" /> : icon}{label}
    </span>
    <span className="mt-0.5 block text-[9.5px]" style={{ color: "var(--cream-mute)" }}>{hint}</span>
  </button>;
}

// Deliverables are provider-generated HTML: scripts stripped, restrictive CSP,
// rendered only inside a sandboxed frame.
function sandboxed(html: string) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;">`;
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<head([^>]*)>/i, `<head$1>${policy}`);
}
