"use client";

import { useState } from "react";
import { ArrowUpRight, CheckCircle2, Clipboard, FileText, FileUp, Globe2, Layers3, Loader2, Palette, ShieldCheck, Sparkles } from "lucide-react";
import { DESIGN_PROFILES, type DesignProfileId } from "@/lib/designIntelligence";

type ReferenceType = "website" | "repository" | "screen-recording" | "video";
type Permission = "owned" | "authorized" | "public-reference";
type AssetMode = "interactive-scene" | "svg-sequence" | "frame-sequence" | "motion-study";
type Workflow = "original-study" | "owned-site-recovery";
type RecoveryTemplate = "modernize" | "faithful-rebuild" | "component-extraction";
interface FlowCapture {
  sourceUrl: string;
  capturedAt: string;
  viewport: { width: number; height: number };
  inventory: { scrollDepth: number; chapterBands: number; headings: number; navigation: number; fixedOrSticky: number; interactiveControls: number; images: number; videos: number; canvases: number; animatedElements: number };
  observations: string[];
  veloceAssetDirections: string[];
  implementationPlan: string[];
  constraints: string[];
}

const fieldStyle = { background: "var(--bg-deep, rgba(0,0,0,0.35))", border: "1px solid var(--panel-border)", color: "var(--fg)" };

export default function FlowLab() {
  const [projectName, setProjectName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [referenceType, setReferenceType] = useState<ReferenceType>("website");
  const [permission, setPermission] = useState<Permission>("public-reference");
  const [assetMode, setAssetMode] = useState<AssetMode>("interactive-scene");
  const [frameCount, setFrameCount] = useState(96);
  const [frameFormat, setFrameFormat] = useState<"webp" | "avif">("webp");
  const [sequenceAspect, setSequenceAspect] = useState("16:9");
  const [scrollScreens, setScrollScreens] = useState(4);
  const [designProfile, setDesignProfile] = useState<DesignProfileId>("conversion-editorial");
  const [workflow, setWorkflow] = useState<Workflow>("original-study");
  const [recoveryTemplate, setRecoveryTemplate] = useState<RecoveryTemplate>("modernize");
  const [ownershipAttestation, setOwnershipAttestation] = useState(false);
  const [analysis, setAnalysis] = useState<FlowCapture | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [notes, setNotes] = useState("");
  const [localReference, setLocalReference] = useState("");
  const [brief, setBrief] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);

  async function run(save = false) {
    setWorking(true); setNotice("");
    try {
      const response = await fetch("/api/flow-lab/brief", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectName, sourceUrl, referenceType, permission, assetMode, designProfile, workflow,
          recoveryTemplate, ownershipAttestation, notes, save,
          sequencePlan: assetMode === "frame-sequence" ? { frameCount, frameFormat, aspectRatio: sequenceAspect, scrollScreens } : undefined,
        }),
      });
      const data = await response.json();
      if (!data.ok) { setNotice(data.error || "Flow Lab could not create a brief."); return; }
      setBrief(data.brief.markdown);
      setNotice(data.savedPath ? `Brief saved to ${data.savedPath}.` : `${workflow === "owned-site-recovery" ? "Owned Site Recovery" : "Original design"} brief created. Review it before saving or building.`);
    } catch { setNotice("Flow Lab could not reach the local API."); }
    finally { setWorking(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(brief); setNotice("Brief copied."); }
    catch { setNotice("Clipboard access was blocked. Select the brief and copy it manually."); }
  }

  async function copySequenceRecipe() {
    const recipe = `Use the Veloce owned-frame sequence workflow.

- Input: ${frameCount} numbered ${frameFormat.toUpperCase()} frames at ${sequenceAspect}
- Scroll distance: ${scrollScreens} viewport heights
- Render on a sticky HTML canvas; map normalized scroll progress to frame index
- Preload frame 0, the final frame, and a small moving lead window around the current frame
- Keep semantic copy and CTAs in the DOM, never inside canvas
- Provide a poster fallback, a loading state, and a prefers-reduced-motion path
- Preserve aspect ratio on desktop and mobile; do not trap or hijack scrolling
- Use only owned, generated, or explicitly licensed frames

Start from skills/veloce-asset-sequencing/assets/ScrollFrameSequence.tsx and adapt it to the target project.`;
    try { await navigator.clipboard.writeText(recipe); setNotice("Frame-sequence implementation recipe copied."); }
    catch { setNotice("Clipboard access was blocked. Create the brief and copy the sequence contract from there."); }
  }

  async function openHandoff(destination: "web-studio" | "opendesign") {
    if (!brief) return;
    const handoff = { projectName, brief, designProfile, createdAt: new Date().toISOString() };
    try {
      window.localStorage.setItem("veloce.flow-lab-handoff", JSON.stringify(handoff));
      await navigator.clipboard.writeText(brief);
      setNotice(destination === "web-studio" ? "Flow brief loaded for Web Studio. It is also copied as a backup." : "Flow brief copied. Paste it into Open Design's Studio prompt to create a visual concept pass.");
      window.open(destination === "web-studio" ? "/web-studio?from=flow-lab" : "/opendesign", "_blank", "noopener");
    } catch {
      setNotice("Could not prepare the handoff automatically. Use the copy icon, then paste the brief into the next workspace.");
    }
  }

  async function analyze() {
    if (!sourceUrl.trim()) { setNotice("Add the public reference URL first."); return; }
    if (permission !== "public-reference") { setNotice("Reference Flow Capture is for public-reference studies. Use Authorized Site Replication for owned materials."); return; }
    setAnalyzing(true); setNotice("");
    try {
      const response = await fetch("/api/flow-lab/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceUrl, permission }) });
      const data = await response.json();
      if (!data.ok) { setNotice(data.error || "Flow Capture could not analyze this reference."); return; }
      setAnalysis(data.result);
      setNotice("Reference flow captured. Review the original Veloce directions below.");
    } catch { setNotice("Flow Capture could not reach the local API."); }
    finally { setAnalyzing(false); }
  }

  function useAnalysisInBrief() {
    if (!analysis) return;
    const summary = `Reference Flow Capture (patterns only)\n- Scroll depth: ${Math.round(analysis.inventory.scrollDepth / 1_000)}k px; estimated chapter bands: ${analysis.inventory.chapterBands}\n- Observations: ${analysis.observations.join(" ")}\n- Original Veloce asset roles: ${analysis.veloceAssetDirections.join(" ")}`;
    setNotes((current) => current ? `${current}\n\n${summary}` : summary);
    setNotice("Capture summary added to the Flow Workstation brief notes.");
  }

  function selectLocalReference(file: File | undefined) {
    if (!file) return;
    const label = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
    setLocalReference(label);
    setSourceUrl((current) => current || `Local reference: ${label}`);
    if (referenceType === "website" || referenceType === "repository") setReferenceType("screen-recording");
  }

  return <div className="pb-6 space-y-4">
    <div className="flex items-start gap-3 flex-wrap">
      <div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.32)", color: "#fbbf24" }}><Sparkles size={18} /></div>
      <div><div className="text-[16px] font-semibold" style={{ color: "var(--cream)" }}>Flow Workstation</div><div className="text-[11.5px] mt-0.5" style={{ color: "var(--cream-mute)" }}>Original reference study or authorized site replication → documented build handoff</div></div>
      <div className="ml-auto inline-flex items-center gap-1.5 text-[10.5px]" style={{ color: "var(--cream-mute)" }}><ShieldCheck size={14} color="#34d399" /> Local-only analysis. Replication uses client-provided materials only.</div>
    </div>

    <section className="panel p-4">
      <div className="flex items-center gap-2 mb-3"><Globe2 size={15} color="#fbbf24" /><span className="text-[13px] font-medium" style={{ color: "var(--cream)" }}>Workflow declaration</span></div>
      <div className="mb-3 inline-flex p-1 rounded-lg border" style={{ borderColor: "var(--line-soft)", background: "var(--bg-deep, rgba(0,0,0,0.22))" }} role="tablist" aria-label="Flow Workstation mode">
        <button role="tab" aria-selected={workflow === "original-study"} onClick={() => setWorkflow("original-study")} className="px-3 py-1.5 rounded-md text-[11px] font-medium" style={{ color: workflow === "original-study" ? "#111827" : "var(--cream-dim)", background: workflow === "original-study" ? "#fbbf24" : "transparent" }}>Original design study</button>
        <button role="tab" aria-selected={workflow === "owned-site-recovery"} onClick={() => setWorkflow("owned-site-recovery")} className="px-3 py-1.5 rounded-md text-[11px] font-medium" style={{ color: workflow === "owned-site-recovery" ? "#111827" : "var(--cream-dim)", background: workflow === "owned-site-recovery" ? "#fbbf24" : "transparent" }}>Authorized site replication</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-2.5">
        <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Client or project name" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} />
        <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://reference.example or local-file label" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} />
        <select value={referenceType} onChange={(event) => setReferenceType(event.target.value as ReferenceType)} className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle}><option value="website">Website</option><option value="repository">Repository</option><option value="screen-recording">Screen recording</option><option value="video">Video</option></select>
        <select value={permission} onChange={(event) => setPermission(event.target.value as Permission)} className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle}><option value="owned">I own this reference</option><option value="authorized">I have client/owner authorization</option><option value="public-reference">Public reference, patterns only</option></select>
        {workflow === "owned-site-recovery" && <select value={recoveryTemplate} onChange={(event) => setRecoveryTemplate(event.target.value as RecoveryTemplate)} className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} aria-label="Authorized replication template"><option value="modernize">Modernize owned site</option><option value="faithful-rebuild">Faithful authorized replication</option><option value="component-extraction">Extract owned component system</option></select>}
        <select value={designProfile} onChange={(event) => setDesignProfile(event.target.value as DesignProfileId)} className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} aria-label="Veloce design profile">{DESIGN_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select>
        <select value={assetMode} onChange={(event) => setAssetMode(event.target.value as AssetMode)} className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} aria-label="Original asset implementation"><option value="interactive-scene">Original interactive node scene</option><option value="svg-sequence">Original SVG path sequence</option><option value="frame-sequence">Owned frame sequence</option><option value="motion-study">Owned motion study</option></select>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What is worth studying? For example: chapter pacing, evidence rhythm, clear handoffs, or motion restraint. Do not paste protected copy or assets." className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none min-h-28 resize-y sm:col-span-2" style={fieldStyle} />
      </div>
      {assetMode === "frame-sequence" && <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "rgba(240,168,104,0.28)", background: "rgba(240,168,104,0.045)" }}>
        <div className="flex items-center gap-2 flex-wrap"><Layers3 size={14} color="#f0a868" /><span className="text-[12px] font-medium" style={{ color: "var(--cream)" }}>Owned frame-sequence contract</span><span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>Scroll-linked canvas · selective preload · static fallback</span></div>
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="text-[10px]" style={{ color: "var(--cream-mute)" }}>Frames<input aria-label="Frame count" type="number" min={24} max={120} value={frameCount} onChange={(event) => setFrameCount(Math.min(120, Math.max(24, Number(event.target.value) || 24)))} className="mt-1 w-full rounded-md px-2.5 py-2 text-[12px] outline-none" style={fieldStyle} /></label>
          <label className="text-[10px]" style={{ color: "var(--cream-mute)" }}>Format<select aria-label="Frame format" value={frameFormat} onChange={(event) => setFrameFormat(event.target.value as "webp" | "avif")} className="mt-1 w-full rounded-md px-2.5 py-2 text-[12px] outline-none" style={fieldStyle}><option value="webp">WebP</option><option value="avif">AVIF</option></select></label>
          <label className="text-[10px]" style={{ color: "var(--cream-mute)" }}>Aspect<select aria-label="Sequence aspect ratio" value={sequenceAspect} onChange={(event) => setSequenceAspect(event.target.value)} className="mt-1 w-full rounded-md px-2.5 py-2 text-[12px] outline-none" style={fieldStyle}><option value="16:9">16:9 landscape</option><option value="4:3">4:3 editorial</option><option value="1:1">1:1 square</option><option value="9:16">9:16 vertical</option></select></label>
          <label className="text-[10px]" style={{ color: "var(--cream-mute)" }}>Scroll screens<input aria-label="Scroll screen count" type="number" min={2} max={8} value={scrollScreens} onChange={(event) => setScrollScreens(Math.min(8, Math.max(2, Number(event.target.value) || 2)))} className="mt-1 w-full rounded-md px-2.5 py-2 text-[12px] outline-none" style={fieldStyle} /></label>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap text-[10.5px] leading-relaxed" style={{ color: "var(--cream-mute)" }}><span>Generate matching start/end frames, animate the transition, export a numbered sequence, compress it, then wire the owned frames to scroll.</span><button type="button" onClick={copySequenceRecipe} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5" style={{ borderColor: "rgba(240,168,104,0.38)", color: "#f0a868" }}><Clipboard size={12} /> Copy recipe</button></div>
      </div>}
      {workflow === "owned-site-recovery" && <label className="mt-2.5 flex items-start gap-2 text-[10.5px] cursor-pointer" style={{ color: "var(--cream-dim)" }}><input checked={ownershipAttestation} onChange={(event) => setOwnershipAttestation(event.target.checked)} type="checkbox" className="mt-0.5 accent-amber-400" /><span>I confirm that I own this site or have written authorization to replicate it. I will provide the repository, export, asset archive, or authorized source package. Flow Workstation will not scrape or download a live site.</span></label>}
      <label className="mt-2.5 inline-flex items-center gap-2 text-[10.5px] cursor-pointer" style={{ color: "var(--cream-mute)" }}><FileUp size={13} color="#72d8c0" />
        <span>{localReference ? `Private reference selected: ${localReference}` : "Select a local screen recording or video label"}</span>
        <input type="file" accept="video/*,.mov,.mp4,.webm" className="sr-only" onChange={(event) => selectLocalReference(event.target.files?.[0])} />
      </label>
      {localReference && <p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>The media file stays on this Mac. Flow Lab sends only its label and your declared observations to the local brief generator.</p>}
      <div className="mt-3 p-3 rounded-lg text-[10.5px] leading-relaxed" style={{ background: "rgba(52,211,153,0.06)", color: "var(--cream-mute)", border: "1px solid rgba(52,211,153,0.16)" }}>{workflow === "owned-site-recovery" ? "Authorized Site Replication is operator-only. It produces a provenance-tracked modernization, replication, or component-system brief from client-provided materials; it never scrapes or downloads a live site." : "Flow Lab extracts high-level narrative and interaction principles only. It never downloads a reference, copies its source, or creates a cloneable layout. Any motion asset must be original, owned, or authorized; frame sequences are capped and always need a static fallback."}</div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">{workflow === "original-study" && <button onClick={analyze} disabled={analyzing} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11.5px] font-semibold disabled:opacity-50" style={{ borderColor: "rgba(56,189,248,0.48)", color: "#7dd3fc" }}>{analyzing ? <Loader2 size={13} className="animate-spin" /> : <Globe2 size={13} />}{analyzing ? "Analyzing flow…" : "Analyze reference"}</button>}<button onClick={() => run(false)} disabled={working} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11.5px] font-semibold disabled:opacity-50" style={{ background: "#fbbf24", color: "#17120a" }}>{working ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{workflow === "owned-site-recovery" ? "Prepare recovery brief" : "Create original brief"}</button>{brief && <button onClick={() => run(true)} disabled={working} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11.5px] disabled:opacity-50" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><FileText size={13} /> Save to vault</button>}{notice && <span className="text-[10.5px]" style={{ color: "var(--cream-mute)" }}>{notice}</span>}</div>
    </section>

    {analysis && <section className="panel p-4 space-y-3"><div className="flex items-center gap-2 flex-wrap"><Globe2 size={15} color="#7dd3fc" /><span className="text-[13px] font-medium" style={{ color: "var(--cream)" }}>Reference Flow Capture</span><span className="text-[10.5px]" style={{ color: "var(--cream-mute)" }}>{analysis.viewport.width}×{analysis.viewport.height} · patterns only</span><button onClick={useAnalysisInBrief} className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[10.5px]" style={{ borderColor: "rgba(125,211,252,0.35)", color: "#7dd3fc" }}><Clipboard size={12} /> Use in brief</button></div><div className="grid sm:grid-cols-3 gap-2"><div className="rounded-lg p-3" style={{ background: "var(--bg-deep, rgba(0,0,0,0.2))" }}><div className="text-[10px]" style={{ color: "var(--cream-mute)" }}>Narrative scale</div><div className="text-[16px] mt-1 font-semibold" style={{ color: "var(--cream)" }}>{Math.round(analysis.inventory.scrollDepth / 1_000)}k px</div><div className="text-[10px] mt-1" style={{ color: "var(--cream-mute)" }}>{analysis.inventory.chapterBands} estimated scroll bands</div></div><div className="rounded-lg p-3" style={{ background: "var(--bg-deep, rgba(0,0,0,0.2))" }}><div className="text-[10px]" style={{ color: "var(--cream-mute)" }}>Interaction inventory</div><div className="text-[16px] mt-1 font-semibold" style={{ color: "var(--cream)" }}>{analysis.inventory.interactiveControls}</div><div className="text-[10px] mt-1" style={{ color: "var(--cream-mute)" }}>{analysis.inventory.fixedOrSticky} fixed/sticky · {analysis.inventory.animatedElements} motion states</div></div><div className="rounded-lg p-3" style={{ background: "var(--bg-deep, rgba(0,0,0,0.2))" }}><div className="text-[10px]" style={{ color: "var(--cream-mute)" }}>Visual surfaces</div><div className="text-[16px] mt-1 font-semibold" style={{ color: "var(--cream)" }}>{analysis.inventory.images + analysis.inventory.videos + analysis.inventory.canvases}</div><div className="text-[10px] mt-1" style={{ color: "var(--cream-mute)" }}>image/video/canvas roles; none retained</div></div></div><div className="grid lg:grid-cols-3 gap-3 text-[10.5px] leading-relaxed"><div><div className="mb-1.5 font-medium" style={{ color: "var(--cream)" }}>Flow observations</div>{analysis.observations.map((item) => <p key={item} className="mb-1.5" style={{ color: "var(--cream-mute)" }}>• {item}</p>)}</div><div><div className="mb-1.5 font-medium" style={{ color: "var(--cream)" }}>Original Veloce assets</div>{analysis.veloceAssetDirections.map((item) => <p key={item} className="mb-1.5" style={{ color: "var(--cream-mute)" }}>• {item}</p>)}</div><div><div className="mb-1.5 font-medium" style={{ color: "var(--cream)" }}>Build translation</div>{analysis.implementationPlan.map((item) => <p key={item} className="mb-1.5" style={{ color: "var(--cream-mute)" }}>• {item}</p>)}</div></div></section>}

    <section className="panel overflow-hidden min-h-[360px] flex flex-col"><div className="px-4 py-3 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: "var(--line-soft)" }}><FileText size={14} color="#fbbf24" /><span className="text-[12.5px] font-medium" style={{ color: "var(--cream)" }}>Original build brief</span>{brief && <div className="ml-auto flex items-center gap-1.5"><button onClick={() => openHandoff("web-studio")} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10.5px]" style={{ borderColor: "rgba(125,211,252,0.35)", color: "#7dd3fc" }}><Layers3 size={11} /> Use in Web Studio</button><button onClick={() => openHandoff("opendesign")} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10.5px]" style={{ borderColor: "rgba(232,121,249,0.35)", color: "#f0abfc" }}><Palette size={11} /> Concept pass</button><button onClick={copy} title="Copy brief" className="p-1.5 rounded-md" style={{ color: "var(--cream-mute)" }}><Clipboard size={13} /></button></div>}</div>{brief ? <><pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)", fontFamily: "'JetBrains Mono', monospace" }}>{brief}</pre><div className="px-4 py-2.5 border-t text-[10.5px] flex items-center gap-1.5" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}><ArrowUpRight size={12} color="#fbbf24" /> Flow Lab defines the story and interaction constraints. A concept pass explores visual direction; Web Studio keeps the full brief in the production handoff.</div></> : <div className="p-4 text-[11.5px]" style={{ color: "var(--cream-mute)" }}><CheckCircle2 size={14} className="inline mr-2" color="#34d399" />Declare the reference basis, then create a brief. It will be ready for Web Studio, Claude, Open Design, or a human design review.</div>}</section>
  </div>;
}
