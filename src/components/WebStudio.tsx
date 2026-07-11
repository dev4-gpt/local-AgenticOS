"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Clipboard, Code2, Copy, ExternalLink, FileText, FolderPlus, Globe2, Layers3, Loader2, Sparkles, TerminalSquare } from "lucide-react";

const ACCENT = "#38bdf8";
type SiteType = "SaaS" | "Agency" | "Personal brand" | "Ecommerce" | "Course / community";
interface Project { id: string; name: string; path: string; business: string; goal: string; createdAt: number }

const fieldStyle = { background: "var(--bg-deep, rgba(0,0,0,0.35))", border: "1px solid var(--panel-border)", color: "var(--fg)" };
const defaults = {
  name: "", business: "", type: "SaaS" as SiteType, audience: "", offer: "", goal: "Lead generation",
  story: "Problem → solution → proof → call to action", pages: "Home, About, Services, Contact",
  style: "Modern, confident, editorial, high-contrast", proof: "", cta: "Book a strategy call",
};

function buildBrief(v: typeof defaults) {
  return `# ${v.name || "Website project"}\n\n## Client\n${v.business || "Business to be defined"}\n\n## Site Type\n${v.type}\n\n## Target Audience\n${v.audience || "Define the primary buyer and their context."}\n\n## Offer\n${v.offer || "Define the outcome, service, or product being sold."}\n\n## Primary Goal\n${v.goal}\n\n## Conversion Story\n${v.story}\n\n## Required Pages\n${v.pages}\n\n## Visual Direction\n${v.style}\n\n## Proof to Feature\n${v.proof || "Case studies, outcomes, testimonials, recognisable clients, or founder credibility."}\n\n## Primary CTA\n${v.cta}\n\n## Delivery Runbook\n1. Research the market, audience language, competing offers, and proof available.\n2. Shape the message before layout: promise, stakes, differentiator, proof, and CTA.\n3. Design the information hierarchy around the conversion story.\n4. Build responsive components, real interactions, and intentional motion.\n5. Test the first viewport, every CTA, forms, mobile layout, keyboard navigation, and performance.\n`;
}

function buildPrompt(v: typeof defaults, brief: string) {
  return `# Build ${v.name || "this website"}\n\nRead \`site-brief.md\` first. Build the actual ${v.type.toLowerCase()} website in this directory, not a mockup or a marketing explanation.\n\n## Outcome\nCreate a production-quality, responsive website for ${v.business || "the client"}. The primary conversion action is: ${v.cta}.\n\n## Required approach\n- Start with a short implementation plan, then execute it.\n- Use the existing project stack and conventions if a codebase already exists. If it is empty, use Next.js, TypeScript, Tailwind, and Framer Motion.\n- Make the brand, offer, and next action clear in the first viewport.\n- Follow this narrative: ${v.story}.\n- Build these pages or sections: ${v.pages}.\n- Use real, inspectable media or carefully generated assets where imagery matters; do not use empty decorative placeholders.\n- Create deliberate motion for hierarchy and feedback, while respecting reduced-motion preferences and mobile performance.\n- Make every CTA and form interaction work. Use semantic HTML, accessible labels, keyboard support, and responsive layouts.\n- Keep the visual direction: ${v.style}. Avoid copying another company or artist's exact design.\n- Do not expose secrets, add API keys to source, or publish anything without explicit approval.\n\n## Acceptance pass\nBefore finishing: run the relevant build/tests, check desktop and mobile layouts, inspect the main conversion flow, and leave the working project files in this directory.\n\n## Client brief\n\n${brief}`;
}

export default function WebStudio() {
  const [v, setV] = useState(defaults);
  const [projects, setProjects] = useState<Project[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const brief = useMemo(() => buildBrief(v), [v]);
  const prompt = useMemo(() => buildPrompt(v, brief), [v, brief]);
  const set = (key: keyof typeof defaults, value: string) => setV((prev) => ({ ...prev, [key]: value }));

  const refresh = useCallback(async () => {
    try { const j = await (await fetch("/api/web-studio/projects", { cache: "no-store" })).json(); setProjects(j.projects ?? []); } catch { /* Keep the editor usable offline. */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); setTimeout(() => setNotice(""), 2600); }
    catch { setNotice("Clipboard access was blocked. Select and copy the text below."); }
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
          <button onClick={() => copy(prompt, "Build prompt")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11.5px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Copy size={13} /> Copy prompt</button>
          <button onClick={() => saveProject("claude")} disabled={saving} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11.5px] font-semibold disabled:opacity-50" style={{ background: ACCENT, color: "#07131a" }}>{saving ? <Loader2 size={13} className="animate-spin" /> : <Code2 size={13} />} Save + open Claude</button>
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] gap-4">
        <section className="panel p-4">
          <div className="flex items-center gap-2 mb-3"><BriefcaseBusiness size={15} style={{ color: ACCENT }} /><span className="text-[13px] font-medium" style={{ color: "var(--cream)" }}>Client intake</span><span className="text-[10.5px]" style={{ color: "var(--cream-mute)" }}>the brief drives the build, not the other way around</span></div>
          <div className="grid sm:grid-cols-2 gap-2.5">
            <input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Project name" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} />
            <input value={v.business} onChange={(e) => set("business", e.target.value)} placeholder="Client or business" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} />
            <select value={v.type} onChange={(e) => set("type", e.target.value)} className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle}>{(["SaaS", "Agency", "Personal brand", "Ecommerce", "Course / community"] as SiteType[]).map((x) => <option key={x}>{x}</option>)}</select>
            <input value={v.goal} onChange={(e) => set("goal", e.target.value)} placeholder="Primary goal" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} />
            <textarea value={v.audience} onChange={(e) => set("audience", e.target.value)} placeholder="Who is the primary buyer? What situation are they in?" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none min-h-20 resize-y" style={fieldStyle} />
            <textarea value={v.offer} onChange={(e) => set("offer", e.target.value)} placeholder="What are we offering, and what outcome does it create?" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none min-h-20 resize-y" style={fieldStyle} />
            <input value={v.pages} onChange={(e) => set("pages", e.target.value)} placeholder="Pages or key sections" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none sm:col-span-2" style={fieldStyle} />
            <input value={v.style} onChange={(e) => set("style", e.target.value)} placeholder="Visual direction" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none sm:col-span-2" style={fieldStyle} />
            <textarea value={v.proof} onChange={(e) => set("proof", e.target.value)} placeholder="Proof: results, testimonials, clients, founder story, credentials" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none min-h-16 resize-y sm:col-span-2" style={fieldStyle} />
            <input value={v.cta} onChange={(e) => set("cta", e.target.value)} placeholder="Primary CTA" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} />
            <input value={v.story} onChange={(e) => set("story", e.target.value)} placeholder="Conversion story" className="rounded-lg px-3 py-2.5 text-[12.5px] outline-none" style={fieldStyle} />
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button onClick={() => saveProject()} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11.5px] disabled:opacity-50" style={{ borderColor: `${ACCENT}66`, color: ACCENT }}><FolderPlus size={13} /> Save client kit</button>
            <button onClick={() => saveProject("design")} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11.5px] disabled:opacity-50" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Layers3 size={13} /> Save + open Open Design</button>
            {notice && <span className="text-[10.5px]" style={{ color: "var(--cream-mute)" }}>{notice}</span>}
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
