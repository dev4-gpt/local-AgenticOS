"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import CommandPalette from "./CommandPalette";

interface PageMeta { numeral: string; label: string; title: string; sub: string; }

// The default copy below describes the operator product, which runs against an
// Obsidian vault, local Hermes, and models on the owner's Mac. None of that
// exists in the hosted client edition, so a client would be told their work
// "lives in your vault" when it lives in tenant Supabase and Cloud Storage.
// These overrides replace the sub-copy on every route whose default mentions a
// laptop-only dependency.
const CLIENT_SUBS: Record<string, string> = {
  "/provider-matrix": "Select approved tools, compare current pricing snapshots, and submit a tenant-scoped manifest proposal before any provider is activated.",
  "/room": "A live group chat with available agents on approved models. In cloud, an agent may use the tenant's approved fallback provider. They read this workspace's memory and reply in turn. Tag one with @claude.",
  "/pipeline": "Capture an idea → the shaping agent classifies and plans it → you approve once at the human gate → the hosted runner builds it. Items are tenant records.",
  "/kanban": "A tenant work board with real stages, assignees, priorities, comments, and an event trail.",
  "/agent-kanban": "Cards an agent builds. Each build runs through the approved hosted lane and ships a tenant artifact.",
  "/memory": "Search this workspace's approved memory records and their tag graph.",
  "/notebook": "Working notes kept as tenant records, exportable as Markdown.",
  "/claude": "Send a reviewed prompt through the approved Anthropic lane. Every call is budgeted and audited.",
  "/openclaw": "Send a reviewed prompt through the approved provider lane. Every call is budgeted and audited.",
  "/hermes": "Send a reviewed prompt through the approved provider lane. Every call is budgeted and audited.",
  "/local": "The hosted equivalent of the local model lane, served by an approved provider under this tenant's budget.",
  "/engine": "The hosted equivalent of the local engine lane, served by an approved provider under this tenant's budget.",
  "/studio": "Generate media through approved provider adapters. Output is stored as a tenant artifact.",
  "/thumbnails": "Prepare a thumbnail direction. Image generation activates per approved media provider.",
  "/radar": "Prepare a publishing artifact with a durable trail. No destination receives data until its adapter is approved.",
};

// Roman numeral + chapter label per route (Midnight Aubergine design system).
// numeral renders in Caveat gold, label in small-caps Manrope. See globals.css `.eyebrow`.
const TITLES: Record<string, PageMeta> = {
  "/":            { numeral: "I.",    label: "Mission Control",    title: "Mission Control",         sub: "Status of every agent, every memory, every signal." },
  "/context":     { numeral: "II.",   label: "Context",             title: "Project Context",          sub: "Give Veloce the approved notes, decisions, references, and source material behind the work." },
  "/orchestrate": { numeral: "III.",  label: "Orchestrate",          title: "Workflow Request",         sub: "Describe the outcome you want and let Veloce shape the work into an inspectable, approval-ready sequence." },
  "/create":      { numeral: "IV.",   label: "Create",               title: "Production Brief",         sub: "Turn an approved direction into a clear brief for design, content, web, video, or another deliverable." },
  "/deliver":     { numeral: "VI.",   label: "Deliver",              title: "Delivery Review",          sub: "Track the next handoff, review a deliverable, and request the final human-approved release step." },
  "/claude":      { numeral: "II.",   label: "Agent · Claude",     title: "Claude",                  sub: "Direct streaming channel to your Claude Code CLI. Voice in, auto-logged to Obsidian." },
  "/openclaw":    { numeral: "III.",  label: "Agent · OpenClaw",   title: "OpenClaw",                sub: "Chat one-shot or open the control room. Logged to your vault." },
  "/hermes":      { numeral: "IV.",   label: "Agent · Hermes",     title: "Hermes",                  sub: "Nous Research agent. Sessions, skills, kanban — and a chat line." },
  "/antigravity": { numeral: "V.",    label: "Agent · Antigravity",title: "Antigravity",             sub: "Gemini CLI's successor. Go-based, multi-agent harness, plugins, async workflows." },
  "/codex":       { numeral: "VII.",  label: "Agent · Codex",      title: "Codex",                   sub: "OpenAI's coding agent. Chat, set long-running goals, preview anything it builds." },
  "/kimi":        { numeral: "VII.",  label: "Agent · Kimi Code",  title: "Kimi Code",               sub: "Moonshot's Kimi K2.7 coding agent. Chat with memory, build, and preview anything it writes." },
  "/glm":         { numeral: "VIII.", label: "Agent · GLM 5.2",    title: "GLM 5.2",                 sub: "Zhipu's GLM-5.2 flagship coder on the z.ai Coding Plan. 1M context. Chat, build, and preview anything it writes." },
  "/glm-code":    { numeral: "VIII.", label: "Agent · GLM Code",   title: "GLM Code",                sub: "A focused GLM coding workspace with build history, status, and local previews." },
  "/grok":        { numeral: "VIII.", label: "Agent · Grok Build", title: "Grok Build",              sub: "xAI's grok-build-0.1 terminal coding agent, signed in on your X Premium+ plan. Chat, build games + apps, and preview anything it writes." },
  "/freeclaude":  { numeral: "VIII.", label: "Agent · Free Claude Code", title: "Free Claude Code",  sub: "Open-source proxy. Same Claude CLI, routed through OpenRouter / Owl Alpha." },
  "/fusion":      { numeral: "VIII.", label: "Agent · Fusion",     title: "Fusion Boardroom",        sub: "OpenRouter Fusion — a panel of models deliberates with web search, then a judge writes the verdict. For the calls where being wrong is expensive." },
  "/sakana":      { numeral: "VIII.", label: "Agent · Sakana",     title: "Sakana Fugu",             sub: "A vendor-agnostic council — a panel of models deliberates in parallel with web search, then a judge weighs it all and writes the verdict. Collective intelligence, not one model's guess." },
  "/local":       { numeral: "VIII.", label: "Agent · Local",      title: "Local",                   sub: "Whatever model you've pinned warm in Ollama, running 100% on your Mac — offline, free, instant. Build with your voice, preview live." },
  "/engine":      { numeral: "VIII.", label: "Agent · Local Engine", title: "The Local Hermes Engine", sub: "A real agent on your Mac — Gemma-4 12B Coder via Hermes, fully offline. Give it a task by voice or text; it runs commands and builds files, and you watch what it makes appear live. Free, private, nothing leaves the machine." },
  "/agent-kanban":{ numeral: "VIII.", label: "Agent · Kanban",       title: "Agent Kanban",            sub: "A team of local offline agents works a live board: the Planner breaks your goal into cards, the Builder builds each one, the Reviewer checks it really landed — and every Done card previews live. 100% on your Mac." },
  "/room":        { numeral: "IX.",   label: "Self · Mastermind",  title: "AI Agent Mastermind",     sub: "A live group chat with all your agents — each one a different real model. They read your vault, reply in turn, riff off each other, and can save notes or start projects. Tag one with @claude." },
  "/pipeline":    { numeral: "X.",    label: "Self · Pipeline",    title: "From Inbox to Shipped",   sub: "Capture an idea → agents classify, route + plan it → you approve once → a PM + subagents build it. Lives in your vault." },
  "/loop":        { numeral: "X.",    label: "Self · Loop",        title: "Loop Engineering",        sub: "Define what 'done' looks like. A builder acts, Fusion verifies it adversarially, and it loops until the gate passes — you stop being the loop." },
  "/ruflo":       { numeral: "X.",    label: "Orchestrate · Ruflo", title: "Ruflo",                  sub: "Run scoped swarm workflows with an inspectable brief, named roles, and an explicit approval boundary." },
  "/goals":       { numeral: "X.",    label: "Self · Goals",       title: "Goals",                   sub: "Set targets. Tick them off. Watch the bar fill. Saved to Goals.md." },
  "/seo":         { numeral: "X.",    label: "Self · SEO Pipeline",title: "SEO Content Pipeline",    sub: "Pick a keyword + transcript. Generate 5 unique articles. Deploy to your Netlify funnel." },
  "/radar":       { numeral: "X.",    label: "Self · Radar",       title: "The Radar",               sub: "A 24/7 watcher on AI news + X. Hermes searches X live (Grok OAuth), ranks what's actually trending, and hands you the post-it-today story — with the source tweet, your angle and a ready hook. Sweeps every morning, logs to Obsidian." },
  "/leads":       { numeral: "X.",    label: "Deliver · Leads",    title: "Leads",                   sub: "Define an ICP, discover and score prospects, then keep enrichment and outreach behind explicit provider and approval gates." },
  "/opendesign":  { numeral: "X.",    label: "Self · Open Design", title: "Open Design",             sub: "The local-first, open-source Claude Design alternative — embedded right here. Generate prototypes, dashboards, decks, images and motion graphics on your own machine, driving your own agents." },
  "/games":       { numeral: "XI.",   label: "Workflow · Game Agent", title: "Game Studio",        sub: "The Coding Video Game Agent — describe a game, it builds it, you play it on the shelf." },
  "/studio":      { numeral: "XI.",   label: "Self · Studio",      title: "Studio",                  sub: "Generate images, videos and speech with Hermes. Voice in, preview inline, save to vault." },
  "/thumbnails":  { numeral: "XI.",   label: "Self · Thumbnails",  title: "Thumbnail Studio",        sub: "Upload a thumbnail + say what to improve → gpt-image-2 makes better versions. Every round is logged to your vault so it learns your style." },
  "/notebook":    { numeral: "XII.",  label: "Self · Notebook",    title: "Notebook",                sub: "Your NotebookLM notebooks, audio overviews and chats — all in one place, synced to Obsidian." },
  "/kanban":      { numeral: "XIII.", label: "Self · Kanban",      title: "Kanban",                  sub: "Hermes Agent multi-agent board. Drop a prompt into triage, watch the orchestrator decompose + assign." },
  "/journal":     { numeral: "XIV.",  label: "Self · Journal",     title: "Journal",                 sub: "Daily entries with voice or text. One markdown file per day." },
  "/memory":      { numeral: "XV.",   label: "Self · Memory",      title: "Memory",                  sub: "Search your Obsidian vault, Graphify knowledge map, and optional Omi-compatible memory file." },
  "/guide":       { numeral: "XVI.",  label: "Build · Your Own",   title: "Build Your Own",          sub: "Step-by-step guide. Anyone can follow it. Share with your community." },
  "/flow-lab":    { numeral: "XVII.", label: "Create · Flow Lab",  title: "Flow Lab",                sub: "Study permitted references, define an original scene direction, and hand off a safe build brief." },
  "/web-studio":  { numeral: "XVIII.",label: "Create · Web Studio",title: "Veloce Web Studio",       sub: "Turn approved strategy into conversion structure, motion direction, and a reviewable web build." },
  "/integrations":{ numeral: "XIX.",  label: "Govern · Integrations", title: "Integrations",          sub: "See the services and delivery adapters configured for this private operating environment." },
  "/capabilities":{ numeral: "XX.",   label: "Govern · Capabilities", title: "Capabilities",          sub: "Curated skills and connectors with clear scopes, boundaries, and client-readiness." },
  "/credentials":{ numeral: "XX.",   label: "Govern · Credentials", title: "Credentials",          sub: "Review runtime identity, provider connection state, and the secret boundary." },
  "/provider-matrix":{ numeral: "XX.", label: "Govern · Provider Matrix", title: "Provider Matrix", sub: "Select tools and pricing routes for a reviewed tenant manifest." },
  "/video":       { numeral: "XXI.",  label: "Create · Video",     title: "Video Studio",            sub: "Move from approved script to voice, avatar, assembly, and preview through provider-aware production stages." },
  "/openmontage": { numeral: "XXII.", label: "Create · OpenMontage", title: "OpenMontage",          sub: "Plan and run agentic video workflows with local scripts, inspectable outputs, and explicit model gates." },
  "/music":       { numeral: "XXIII.",label: "Create · Music",     title: "Music Studio",            sub: "Draft music direction, choose an available engine, and keep generated tracks in the local workspace." },
  "/seo-guide":   { numeral: "XXIV.", label: "Govern · SEO Guide", title: "SEO Guide",              sub: "Reference the setup, publishing boundaries, and verification steps behind the SEO workflow." },
};

export default function TopBar({ clientEdition = false }: { clientEdition?: boolean }) {
  const pathname = usePathname();
  const base = TITLES[pathname] ?? TITLES["/"];
  const [time, setTime] = useState<string>("");
  // Swap in hosted-accurate copy, so a client is never told their work lives in
  // a vault this runtime does not have.
  const t = clientEdition && CLIENT_SUBS[pathname] ? { ...base, sub: CLIENT_SUBS[pathname] } : base;

  useEffect(() => {
    const set = () =>
      setTime(new Date().toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" }));
    set();
    const i = setInterval(set, 1000 * 15);
    return () => clearInterval(i);
  }, []);

  return (
    <header className="workspace-page-head">
      <div className="workspace-page-head__chrome">
        <div>
          <span>Veloce AgenticOS</span>
          <i />
          <strong>{t.label}</strong>
        </div>
        <div className="workspace-page-head__actions">
          <span className="workspace-page-head__runtime"><i /> {clientEdition ? "Client runtime" : "Local runtime"}</span>
          <CommandPalette />
        </div>
      </div>

      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="workspace-page-head__intro"
      >
        {/* Chapter eyebrow — `I. ───── MISSION CONTROL` */}
        <div className="eyebrow">
          <span className="num">{t.numeral}</span>
          <span className="line" />
          <span className="label">{t.label}</span>
        </div>

        <h1 className="page-title">{t.title}</h1>
        <p className="page-subtitle">{t.sub}</p>

        <div className="mt-4 status-meta">
          <span className="hand">{time}</span>
          <span className="mx-2 opacity-40">·</span>
          {clientEdition ? "Client · Cloud" : "Local · Studio"}
        </div>
      </motion.div>
    </header>
  );
}
