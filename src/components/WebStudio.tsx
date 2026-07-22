"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, BriefcaseBusiness, CheckCircle2, Clipboard, Code2, Copy, FileText, FolderPlus, Globe2, Layers3, Loader2, Sparkles, TerminalSquare } from "lucide-react";
import { DESIGN_PROFILES, designProfilePrompt, getDesignProfile, type DesignProfileId } from "@/lib/designIntelligence";
import { IMMERSIVE_SCROLL_PROVIDER_PROMPT, immersiveScrollSkillApplies } from "@/lib/immersiveScrollSkill";
import { ADVANCED_WEBSITE_STANDARD, WEB_PROMPT_LIBRARY, type WebPromptTemplateId, promptLibraryMarkdown } from "@/lib/webPromptLibrary";

const ACCENT = "#38bdf8";
type SiteType = "SaaS" | "Agency" | "Personal brand" | "Ecommerce" | "Course / community";
interface Project { id: string; name: string; path: string; business: string; goal: string; createdAt: number }

const fieldStyle = { background: "var(--bg-deep, rgba(0,0,0,0.35))", border: "1px solid var(--panel-border)", color: "var(--fg)" };
const defaults = {
  name: "", business: "", type: "SaaS" as SiteType, audience: "", offer: "", goal: "Lead generation",
  story: "Problem → solution → proof → call to action", pages: "Home, About, Services, Contact",
  style: "Modern, confident, editorial, high-contrast", proof: "", cta: "Book a strategy call",
  designProfile: "conversion-editorial" as DesignProfileId, flowContext: "",
};

function buildBrief(v: typeof defaults) {
  const profile = getDesignProfile(v.designProfile);
  return `# ${v.name || "Website project"}\n\n## Client\n${v.business || "Business to be defined"}\n\n## Site Type\n${v.type}\n\n## Target Audience\n${v.audience || "Define the primary buyer and their context."}\n\n## Offer\n${v.offer || "Define the outcome, service, or product being sold."}\n\n## Primary Goal\n${v.goal}\n\n## Conversion Story\n${v.story}\n\n## Required Pages\n${v.pages}\n\n## Visual Direction\n${v.style}\n\n${v.flowContext ? `## Flow Lab Context\n${v.flowContext}\n\n` : ""}## Veloce Design Intelligence\n- Profile: ${profile.label}\n- Intent: ${profile.intent}\n- Composition: ${profile.composition}\n- Motion: ${profile.motion}\n- Constraints: ${profile.constraints}\n\n## Proof to Feature\n${v.proof || "Case studies, outcomes, testimonials, recognisable clients, or founder credibility."}\n\n## Primary CTA\n${v.cta}\n\n## Delivery Runbook\n1. Research the market, audience language, competing offers, and proof available.\n2. Shape the message before layout: promise, stakes, differentiator, proof, and CTA.\n3. Design the information hierarchy around the conversion story.\n4. Build responsive components, real interactions, and intentional motion.\n5. Test the first viewport, every CTA, forms, mobile layout, keyboard navigation, and performance.\n`;
}

function buildPrompt(v: typeof defaults, brief: string, templateId: WebPromptTemplateId) {
  const template = WEB_PROMPT_LIBRARY.find((item) => item.id === templateId) ?? WEB_PROMPT_LIBRARY[0];
  const immersiveSkill = immersiveScrollSkillApplies({ templateId, designProfile: v.designProfile }) ? `\n\n${IMMERSIVE_SCROLL_PROVIDER_PROMPT}` : "";
  return `# ${template.label}: ${v.name || "Build this website"}\n\nRead \`site-brief.md\` first. Build the actual ${v.type.toLowerCase()} website in this directory, not a mockup or a marketing explanation.\n\n## Template Intent\n${template.prompt}\n\n## Outcome\nCreate a production-quality, responsive website for ${v.business || "the client"}. The primary conversion action is: ${v.cta}.\n\n## Client Direction\n- Target audience: ${v.audience || "Use the audience described in the brief."}\n- Offer: ${v.offer || "Use the offer described in the brief."}\n- Storyline: ${v.story}.\n- Pages or key sections: ${v.pages}.\n- Visual direction: ${v.style}.\n\n${designProfilePrompt(v.designProfile)}${immersiveSkill}\n\n${ADVANCED_WEBSITE_STANDARD}\n\n## Client brief\n\n${brief}`;
}

export default function WebStudio() {
  const [v, setV] = useState(defaults);
  const [projects, setProjects] = useState<Project[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [notice, setNotice] = useState("");
  const [templateId, setTemplateId] = useState<WebPromptTemplateId>("golden");
  const brief = useMemo(() => buildBrief(v), [v]);
  const prompt = useMemo(() => buildPrompt(v, brief, templateId), [v, brief, templateId]);
  const library = useMemo(() => promptLibraryMarkdown(), []);
  const set = (key: keyof typeof defaults, value: string) => setV((prev) => ({ ...prev, [key]: value }));

  const refresh = useCallback(async () => {
    try { const j = await (await fetch("/api/web-studio/projects", { cache: "no-store" })).json(); setProjects(j.projects ?? []); } catch { /* Keep the editor usable offline. */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("veloce.flow-lab-handoff");
      if (!raw) return;
      const handoff = JSON.parse(raw) as { projectName?: string; brief?: string; designProfile?: DesignProfileId };
      if (!handoff.brief) return;
      const flowContext = handoff.brief;
      setV((previous) => ({
        ...previous,
        name: previous.name || handoff.projectName || "Veloce AgenticOS Edition",
        business: previous.business || "Veloce AgenticOS",
        type: "Agency",
        designProfile: handoff.designProfile || previous.designProfile,
        goal: previous.goal === defaults.goal ? "Create qualified discovery conversations" : previous.goal,
        story: previous.story === defaults.story ? "Fragmented work → operational world → evidence → human boundary → measurable outcome → CTA" : previous.story,
        flowContext,
      }));
      window.localStorage.removeItem("veloce.flow-lab-handoff");
      setNotice("Flow Lab brief loaded. Complete the client details, then save the production handoff.");
    } catch { /* An invalid local handoff should not block the studio. */ }
  }, []);

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); setTimeout(() => setNotice(""), 2600); }
    catch { setNotice("Clipboard access was blocked. Select and copy the text below."); }
  }

  function applyTemplate(id: WebPromptTemplateId) {
    const template = WEB_PROMPT_LIBRARY.find((item) => item.id === id);
    if (!template) return;
    setTemplateId(id);
    setV((prev) => ({ ...prev, type: template.type, goal: template.goal, pages: template.pages, style: template.style, story: template.story, cta: template.cta }));
    setNotice(`${template.label} applied to the brief.`);
  }

  async function syncLibrary() {
    setSyncingLibrary(true); setNotice("");
    try {
      const r = await fetch("/api/web-studio/library", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: library }) });
      const j = await r.json();
      setNotice(j.ok ? "Prompt library synced to Obsidian." : (j.error || "Could not sync the prompt library."));
    } catch { setNotice("Could not reach the Obsidian sync endpoint."); }
    finally { setSyncingLibrary(false); }
  }

  async function saveProject(andOpen?: "claude" | "design") {
    if (!v.name.trim() || !v.business.trim()) { setNotice("Add the project name and client/business first."); return; }
    setSaving(true); setNotice("");
    try {
      const r = await fetch("/api/web-studio/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: v.name, business: v.business, goal: v.goal, brief, prompt }) });
      const j = await r.json();
      if (!j.ok) { setNotice(j.error || "Could not save the project."); return; }
      await refresh();
      const command = `cd ${JSON.stringify(j.project.path)} && claude "Read CLAUDE.md and build this website."`;
      if (andOpen === "design") {
        await navigator.clipboard.writeText(prompt).catch(() => {});
        setNotice(`Saved in ${j.project.path}. Build prompt copied for Open Design.`);
        window.open("/opendesign", "_blank", "noopener");
      } else {
        await navigator.clipboard.writeText(command).catch(() => {});
        setNotice(`Saved in ${j.project.path}. Claude command copied.`);
        if (andOpen === "claude") window.open("/claude", "_blank", "noopener");
      }
    } catch { setNotice("Could not reach Web Studio."); }
    finally { setSaving(false); }
  }

  return (
    <div className="pb-6 space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: "rgba(56,189,248,0.14)", border: "1px solid rgba(56,189,248,0.35)", color: ACCENT }}><Globe2 size={18} /></div>
        <div className="min-w-0">
          <div className="text-[16px] font-semibold" style={{ color: "var(--cream)" }}>Web Studio</div>
          <div className="text-[11.5px] mt-0.5" style={{ color: "var(--cream-mute)" }}>Client brief → conversion story → build handoff → delivery workspace</div>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <button onClick={syncLibrary} disabled={syncingLibrary} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11.5px] disabled:opacity-50" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><BookOpen size={13} /> {syncingLibrary ? "Syncing…" : "Sync prompt library"}</button>
          <button onClick={() => copy(prompt, "Build prompt")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11.5px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Copy size={13} /> Copy prompt</button>
          <button onClick={() => saveProject("claude")} disabled={saving} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11.5px] font-semibold disabled:opacity-50" style={{ background: ACCENT, color: "#07131a" }}>{saving ? <Loader2 size={13} className="animate-spin" /> : <Code2 size={13} />} Save + open Claude</button>
        </div>
      </div>

      <section className="panel p-4">
        <div className="flex items-center gap-2 mb-3"><BookOpen size={15} style={{ color: ACCENT }} /><span className="text-[13px] font-medium" style={{ color: "var(--cream)" }}>Website prompt library</span><span className="text-[10.5px]" style={{ color: "var(--cream-mute)" }}>each prompt includes structure, storyline, animation, conversion, and delivery standards</span></div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-2">
          {WEB_PROMPT_LIBRARY.map((item) => {
            const active = item.id === templateId;
            return <button key={item.id} onClick={() => applyTemplate(item.id)} className="text-left border rounded-lg p-3 transition" style={{ borderColor: active ? `${ACCENT}aa` : "var(--line-soft)", background: active ? "rgba(56,189,248,0.09)" : "var(--bg-deep, rgba(0,0,0,0.14))" }}>
              <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: active ? ACCENT : "var(--cream)" }}>{active && <CheckCircle2 size={12} />}{item.label}</div>
              <div className="text-[10.5px] leading-relaxed mt-1" style={{ color: "var(--cream-mute)" }}>{item.description}</div>
            </button>;
          })}
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap text-[10.5px]" style={{ color: "var(--cream-mute)" }}>
          <span>Toolchain: Veloce Design Intelligence, Framer Motion, Three.js, and reviewed component research.</span>
          <button onClick={() => copy(library, "Prompt library")} className="inline-flex items-center gap-1" style={{ color: ACCENT }}><Copy size={11} /> Copy library</button>
          {notice && <span>{notice}</span>}
        </div>
      </section>

      <div className="grid xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] gap-4">
        <section className="panel p-4">
          <div className="flex items-center gap-2 mb-3"><BriefcaseBusiness size={15} style={{ color: ACCENT }} /><span className="text-[13px] font-medium" style={{ color: "var(--cream)" }}>Client intake</span><span className="text-[10.5px]" style={{ color: "var(--cream-mute)" }}>the brief drives the build, not the other way around</span></div>
          <div className="grid sm:grid-cols-2 gap-2.5">
            <input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Project name" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} />
            <input value={v.business} onChange={(e) => set("business", e.target.value)} placeholder="Client or business" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} />
            <select value={v.type} onChange={(e) => set("type", e.target.value)} className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle}>{(["SaaS", "Agency", "Personal brand", "Ecommerce", "Course / community"] as SiteType[]).map((x) => <option key={x}>{x}</option>)}</select>
            <input value={v.goal} onChange={(e) => set("goal", e.target.value)} placeholder="Primary goal" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} />
            <label className="sm:col-span-2 grid gap-1.5 text-[10.5px]" style={{ color: "var(--cream-mute)" }}>
              Veloce design profile
              <select value={v.designProfile} onChange={(e) => set("designProfile", e.target.value)} className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} aria-label="Veloce design profile">{DESIGN_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select>
            </label>
            {immersiveScrollSkillApplies({ templateId, designProfile: v.designProfile }) && <div className="sm:col-span-2 flex items-center gap-1.5 text-[10.5px]" style={{ color: "#7dd3fc" }}><Sparkles size={12} /> Immersive Scroll Site is included in this provider-ready handoff: original depth, DOM artifacts, and fallback checks.</div>}
            <textarea value={v.audience} onChange={(e) => set("audience", e.target.value)} placeholder="Who is the primary buyer? What situation are they in?" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none min-h-20 resize-y" style={fieldStyle} />
            <textarea value={v.offer} onChange={(e) => set("offer", e.target.value)} placeholder="What are we offering, and what outcome does it create?" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none min-h-20 resize-y" style={fieldStyle} />
            <input value={v.pages} onChange={(e) => set("pages", e.target.value)} placeholder="Pages or key sections" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none sm:col-span-2" style={fieldStyle} />
            <input value={v.style} onChange={(e) => set("style", e.target.value)} placeholder="Visual direction" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none sm:col-span-2" style={fieldStyle} />
            <textarea value={v.proof} onChange={(e) => set("proof", e.target.value)} placeholder="Proof: results, testimonials, clients, founder story, credentials" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none min-h-16 resize-y sm:col-span-2" style={fieldStyle} />
            {v.flowContext && <label className="sm:col-span-2 grid gap-1.5 text-[10.5px]" style={{ color: "var(--cream-mute)" }}>Flow Lab context <span>Loaded from Flow Workstation and included in the build handoff.</span><textarea value={v.flowContext} onChange={(e) => set("flowContext", e.target.value)} className="rounded-lg px-3 py-2.5 text-[11px] outline-none min-h-28 resize-y" style={fieldStyle} /></label>}
            <input value={v.cta} onChange={(e) => set("cta", e.target.value)} placeholder="Primary CTA" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} />
            <input value={v.story} onChange={(e) => set("story", e.target.value)} placeholder="Conversion story" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} />
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button onClick={() => saveProject()} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11.5px] disabled:opacity-50" style={{ borderColor: `${ACCENT}66`, color: ACCENT }}><FolderPlus size={13} /> Save client kit</button>
            <button onClick={() => saveProject("design")} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11.5px] disabled:opacity-50" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Layers3 size={13} /> Save + open Open Design</button>
          </div>
        </section>

        <section className="panel overflow-hidden flex flex-col min-h-[460px]">
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--line-soft)" }}><Sparkles size={14} style={{ color: ACCENT }} /><span className="text-[12.5px] font-medium" style={{ color: "var(--cream)" }}>Production build handoff</span><button onClick={() => copy(prompt, "Build prompt")} title="Copy" className="ml-auto p-1.5 rounded-md" style={{ color: "var(--cream-mute)" }}><Clipboard size={13} /></button></div>
          <pre className="flex-1 min-h-0 overflow-auto whitespace-pre-wrap p-4 text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)", fontFamily: "'JetBrains Mono', monospace" }}>{prompt}</pre>
        </section>
      </div>

      <section className="panel p-4">
        <div className="flex items-center gap-2 mb-3"><FileText size={14} style={{ color: ACCENT }} /><span className="text-[12.5px] font-medium" style={{ color: "var(--cream)" }}>Website projects</span><span className="text-[10.5px]" style={{ color: "var(--cream-mute)" }}>saved under Documents/Codex/Projects/Websites</span></div>
        {projects.length === 0 ? <div className="text-[11.5px]" style={{ color: "var(--cream-mute)" }}>Your first saved client kit will appear here with a site brief and a Claude-ready build instruction.</div> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{projects.map((p) => <div key={p.id} className="border rounded-lg px-3 py-2.5" style={{ borderColor: "var(--line-soft)", background: "var(--bg-deep, rgba(0,0,0,0.16))" }}><div className="text-[12px] font-medium truncate" style={{ color: "var(--cream)" }}>{p.name}</div><div className="text-[10.5px] mt-0.5 truncate" style={{ color: "var(--cream-mute)" }}>{p.business} · {p.goal}</div><button onClick={() => copy(`cd ${JSON.stringify(p.path)} && claude "Read CLAUDE.md and build this website."`, "Claude command")} className="mt-2 inline-flex items-center gap-1 text-[10.5px]" style={{ color: ACCENT }}><TerminalSquare size={11} /> Copy Claude command</button></div>)}</div>}
      </section>
    </div>
  );
}
