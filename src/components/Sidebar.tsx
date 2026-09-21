"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutGrid, Brain, Sparkles as SparklesIcon, TrendingUp, Columns3, NotebookText, Film, Building2, Workflow, MessagesSquare, Image as ImageIcon, Gamepad2, Music2, Network, Clapperboard, Repeat, Cpu, LayoutDashboard, Palette, GripVertical, Eye, EyeOff, SlidersHorizontal, Check, SquareTerminal, Globe2, PlugZap, Orbit, Blocks, Target, BookOpenText, RadioTower, ContactRound, GitBranch, Mic2, ChevronDown, KeyRound, ListChecks, Link2 } from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import AgentAvatar from "./AgentAvatar";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  accent: string;
  dim: string;
}

const NAV: NavItem[] = [
  { href: "/",         label: "Mission Control", icon: <LayoutGrid size={16} />, accent: "#a855f7", dim: "rgba(168,85,247,0.16)" },
  { href: "/context",  label: "Context intake", icon: <Brain size={16} />, accent: "#22d3ee", dim: "rgba(34,211,238,0.16)" },
  { href: "/orchestrate", label: "Workflow requests", icon: <Workflow size={16} />, accent: "#5ab896", dim: "rgba(90,184,150,0.16)" },
  { href: "/create",   label: "Create brief", icon: <SparklesIcon size={16} />, accent: "#f0a868", dim: "rgba(240,168,104,0.16)" },
  { href: "/deliver",  label: "Delivery", icon: <TrendingUp size={16} />, accent: "#c084fc", dim: "rgba(192,132,252,0.16)" },
  { href: "/paperclip", label: "Paperclip", icon: <Building2 size={16} />, accent: "#d4a574", dim: "rgba(212,165,116,0.16)" },
  { href: "/room",     label: "AI Agent Mastermind", icon: <MessagesSquare size={16} />, accent: "#a855f7", dim: "rgba(168,85,247,0.16)" },
  { href: "/pipeline", label: "Pipeline", icon: <Workflow size={16} />, accent: "#34d399", dim: "rgba(52,211,153,0.16)" },
  // Agents — use real avatar logos
  { href: "/claude",   label: "Claude",   icon: <AgentAvatar agent="claude" size={22} />,   accent: "#d97757", dim: "rgba(217,119,87,0.16)" },
  { href: "/openclaw", label: "OpenClaw", icon: <AgentAvatar agent="openclaw" size={22} />, accent: "#f472b6", dim: "rgba(244,114,182,0.16)" },
  { href: "/hermes",   label: "Hermes",   icon: <AgentAvatar agent="hermes" size={22} />,   accent: "#60a5fa", dim: "rgba(96,165,250,0.16)" },
  // Gemini CLI removed 2026-06-23 — Google retired it (18 Jun 2026); Antigravity CLI (below) is its successor.
  { href: "/antigravity", label: "Antigravity", icon: <AgentAvatar agent="antigravity" size={22} />, accent: "#7c3aed", dim: "rgba(124,58,237,0.16)" },
  { href: "/codex",       label: "Codex",       icon: <AgentAvatar agent="codex" size={22} />,       accent: "#22c55e", dim: "rgba(34,197,94,0.16)" },
  { href: "/kimi",        label: "Kimi Code",   icon: <AgentAvatar agent="kimi" size={22} />,        accent: "#00CCFF", dim: "rgba(0,204,255,0.16)" },
  { href: "/glm",         label: "GLM 5.2",     icon: <AgentAvatar agent="glm" size={22} />,         accent: "#34E5B0", dim: "rgba(52,229,176,0.16)" },
  { href: "/glm-code",    label: "GLM Code",    icon: <SquareTerminal size={18} />,                  accent: "#34E5B0", dim: "rgba(52,229,176,0.16)" },
  { href: "/grok",        label: "Grok Build",  icon: <AgentAvatar agent="grok" size={22} />,        accent: "#cdd3f7", dim: "rgba(205,211,247,0.16)" },
  { href: "/freeclaude",  label: "Free Claude Code", icon: <AgentAvatar agent="fcc" size={22} />,    accent: "#10b981", dim: "rgba(16,185,129,0.16)" },
  { href: "/fusion",      label: "Fusion",      icon: <Network size={18} />,                         accent: "#d4a574", dim: "rgba(212,165,116,0.16)" },
  { href: "/sakana",      label: "Sakana Fugu", icon: <Network size={18} />,                         accent: "#ff5f9e", dim: "rgba(255,95,158,0.16)" },
  { href: "/local",       label: "Local",       icon: <Cpu size={18} />,                             accent: "#5eead4", dim: "rgba(94,234,212,0.16)" },
  { href: "/engine",      label: "Local Engine", icon: <Cpu size={18} />,                             accent: "#5eead4", dim: "rgba(94,234,212,0.16)" },
  { href: "/agent-kanban", label: "Agent Kanban", icon: <LayoutDashboard size={18} />,                accent: "#7dd3fc", dim: "rgba(125,211,252,0.16)" },
  // Personal
  { href: "/loop",     label: "Loop",     icon: <Repeat size={16} />,   accent: "#2dd4bf", dim: "rgba(45,212,191,0.16)" },
  { href: "/ruflo",    label: "Ruflo",    icon: <GitBranch size={16} />, accent: "#60a5fa", dim: "rgba(96,165,250,0.16)" },
  { href: "/goals",    label: "Goals",    icon: <Target size={16} />,   accent: "#fbbf24", dim: "rgba(251,191,36,0.16)" },
  { href: "/journal",  label: "Journal",  icon: <BookOpenText size={16} />, accent: "#d4a574", dim: "rgba(212,165,116,0.16)" },
  { href: "/seo",      label: "SEO",      icon: <TrendingUp size={16} />, accent: "#a3e635", dim: "rgba(163,230,53,0.16)" },
  { href: "/opendesign", label: "Open Design", icon: <Palette size={16} />, accent: "#e879f9", dim: "rgba(232,121,249,0.16)" },
  { href: "/web-studio", label: "Web Studio", icon: <Globe2 size={16} />, accent: "#38bdf8", dim: "rgba(56,189,248,0.16)" },
  { href: "/flow-lab", label: "Flow Lab", icon: <Orbit size={16} />, accent: "#fbbf24", dim: "rgba(251,191,36,0.16)" },
  { href: "/integrations", label: "Integrations", icon: <PlugZap size={16} />, accent: "#5ab896", dim: "rgba(90,184,150,0.16)" },
  { href: "/capabilities", label: "Capabilities", icon: <Blocks size={16} />, accent: "#34d399", dim: "rgba(52,211,153,0.16)" },
  { href: "/hybrid", label: "Hybrid", icon: <Link2 size={16} />, accent: "#5eead4", dim: "rgba(94,234,212,0.16)" },
  { href: "/credentials", label: "Credentials", icon: <KeyRound size={16} />, accent: "#60a5fa", dim: "rgba(96,165,250,0.16)" },
  { href: "/provider-matrix", label: "Provider matrix", icon: <ListChecks size={16} />, accent: "#34d399", dim: "rgba(52,211,153,0.16)" },
  { href: "/video",    label: "Video",    icon: <Film size={16} />,      accent: "#ef4444", dim: "rgba(239,68,68,0.16)" },
  { href: "/studio",   label: "Agent Studio", icon: <Mic2 size={16} />,   accent: "#fb7185", dim: "rgba(251,113,133,0.16)" },
  { href: "/openmontage", label: "OpenMontage", icon: <Clapperboard size={16} />, accent: "#f0a868", dim: "rgba(240,168,104,0.16)" },
  { href: "/music",    label: "Music",    icon: <Music2 size={16} />,    accent: "#c084fc", dim: "rgba(192,132,252,0.16)" },
  { href: "/games",    label: "Game Studio", icon: <Gamepad2 size={16} />, accent: "#39ff8e", dim: "rgba(57,255,142,0.16)" },
  { href: "/thumbnails", label: "Thumbnails", icon: <ImageIcon size={16} />, accent: "#fb7185", dim: "rgba(251,113,133,0.16)" },
  { href: "/notebook", label: "Notebook", icon: <NotebookText size={16} />, accent: "#fde047", dim: "rgba(253,224,71,0.16)" },
  { href: "/kanban",   label: "Kanban",   icon: <Columns3 size={16} />,  accent: "#14b8a6", dim: "rgba(20,184,166,0.16)" },
  { href: "/memory",   label: "Memory",   icon: <Brain size={16} />,     accent: "#22d3ee", dim: "rgba(34,211,238,0.16)" },
  { href: "/leads",    label: "Leads",    icon: <ContactRound size={16} />, accent: "#34d399", dim: "rgba(52,211,153,0.16)" },
  { href: "/radar",    label: "Radar",    icon: <RadioTower size={16} />, accent: "#c084fc", dim: "rgba(192,132,252,0.16)" },
  { href: "/guide",    label: "Build Guide", icon: <SparklesIcon size={16} />, accent: "#ec4899", dim: "rgba(236,72,153,0.16)" },
];

const DEFAULT_ORDER = NAV.map((n) => n.href);
const BY_HREF: Record<string, NavItem> = Object.fromEntries(NAV.map((n) => [n.href, n]));
const AGENT_ROUTES = new Set(["/claude", "/openclaw", "/hermes", "/antigravity", "/codex", "/kimi", "/glm", "/glm-code", "/grok", "/freeclaude", "/fusion", "/sakana", "/local", "/engine"]);
const LS_ORDER = "agentos.sidebar.order";
const LS_HIDDEN = "agentos.sidebar.hidden";

// The six Veloce operating lenses preserve every direct route, but make the
// expanding tool set navigable as a system rather than an unstructured list.
const ORCHESTRATION_ROUTES = new Set(["/paperclip", "/room", "/pipeline", "/agent-kanban", "/loop", "/kanban", "/ruflo"]);
const CONTEXT_ROUTES = new Set(["/memory", "/notebook", "/goals", "/journal"]);
const CLIENT_ONLY_ROUTES = new Set(["/context", "/orchestrate", "/create", "/deliver"]);
const CLIENT_NAV_ROUTES = new Set(["/", ...CLIENT_ONLY_ROUTES, "/capabilities", "/hybrid", "/credentials", "/provider-matrix"]);
const CREATE_ROUTES = new Set(["/create", "/opendesign", "/web-studio", "/flow-lab", "/video", "/studio", "/openmontage", "/music", "/games", "/thumbnails"]);
const GOVERN_ROUTES = new Set(["/integrations", "/capabilities", "/hybrid", "/credentials", "/provider-matrix", "/seo", "/guide"]);
const DELIVERY_ROUTES = new Set(["/deliver", "/leads", "/radar"]);
function sectionOf(href: string): string {
  if (href === "/" || AGENT_ROUTES.has(href)) return "Command";
  if (href === "/context" || CONTEXT_ROUTES.has(href)) return "Context";
  if (href === "/orchestrate" || ORCHESTRATION_ROUTES.has(href)) return "Orchestrate";
  if (CREATE_ROUTES.has(href)) return "Create";
  if (GOVERN_ROUTES.has(href)) return "Govern";
  if (DELIVERY_ROUTES.has(href)) return "Deliver";
  return "Deliver";
}

const SECTION_ORDER = ["Command", "Context", "Orchestrate", "Create", "Govern", "Deliver"] as const;
const SECTION_META: Record<(typeof SECTION_ORDER)[number], { numeral: string; description: string }> = {
  Command: { numeral: "I", description: "Agents and decisions" },
  Context: { numeral: "II", description: "Memory and research" },
  Orchestrate: { numeral: "III", description: "Workflows and ownership" },
  Create: { numeral: "IV", description: "Design and production" },
  Govern: { numeral: "V", description: "Safety and controls" },
  Deliver: { numeral: "VI", description: "Growth and outcomes" },
};

export default function Sidebar({ clientEdition = false }: { clientEdition?: boolean }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [hidden, setHidden] = useState<string[]>([]);
  const [customize, setCustomize] = useState(false);
  const [dragHref, setDragHref] = useState<string | null>(null);
  const [overHref, setOverHref] = useState<string | null>(null);
  const currentSection = sectionOf(pathname);
  const [openSection, setOpenSection] = useState(currentSection);
  const [homeChapter, setHomeChapter] = useState("Command");

  // load saved prefs (client only)
  useEffect(() => {
    setMounted(true);
    try {
      const o = JSON.parse(localStorage.getItem(LS_ORDER) || "null");
      const h = JSON.parse(localStorage.getItem(LS_HIDDEN) || "null");
      if (Array.isArray(o)) setOrder(o.filter((x) => typeof x === "string"));
      if (Array.isArray(h)) setHidden(h.filter((x) => typeof x === "string"));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { if (mounted) try { localStorage.setItem(LS_ORDER, JSON.stringify(order)); } catch {} }, [order, mounted]);
  useEffect(() => { if (mounted) try { localStorage.setItem(LS_HIDDEN, JSON.stringify(hidden)); } catch {} }, [hidden, mounted]);
  useEffect(() => setOpenSection(currentSection), [currentSection]);
  useEffect(() => {
    if (pathname !== "/") return;
    const root = document.querySelector<HTMLElement>("[data-scroll-root]");
    const sections = SECTION_ORDER.map((section) => document.getElementById(section.toLowerCase())).filter(
      (section): section is HTMLElement => Boolean(section),
    );
    if (!root || sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setHomeChapter(visible.target.id.charAt(0).toUpperCase() + visible.target.id.slice(1));
      },
      { root, rootMargin: "-32% 0px -48% 0px", threshold: [0, 0.25, 0.6] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [pathname]);

  // saved order + any NAV items not yet in it (e.g. new pages added later) appended in default position
  const fullOrder = [
    ...order.filter((h) => BY_HREF[h]),
    ...DEFAULT_ORDER.filter((h) => !order.includes(h)),
  ];
  const allowedOrder = clientEdition ? fullOrder : fullOrder.filter((href) => !CLIENT_ONLY_ROUTES.has(href));
  const visible = customize ? allowedOrder : allowedOrder.filter((h) => !hidden.includes(h));

  function move(from: string, to: string) {
    if (from === to) return;
    const next = fullOrder.filter((h) => h !== from);
    const idx = to === "__end__" ? next.length : next.indexOf(to);
    next.splice(idx < 0 ? next.length : idx, 0, from);
    setOrder(next);
  }
  function toggleHidden(href: string) {
    setHidden((h) => (h.includes(href) ? h.filter((x) => x !== href) : [...h, href]));
  }
  function reset() { setOrder(DEFAULT_ORDER); setHidden([]); }

  return (
    <aside className="workspace-nav hidden md:flex" aria-label="Veloce operating lenses">
      <div className="workspace-nav__brand">
        <Link href="/" aria-label="Veloce AgenticOS Mission Control">
          <span>Veloce</span>
          <strong>AgenticOS</strong>
        </Link>
        <button
          onClick={() => setCustomize((value) => !value)}
          title={customize ? "Finish navigation setup" : "Customize navigation"}
          aria-label={customize ? "Finish navigation setup" : "Customize navigation"}
          className={customize ? "is-active" : ""}
        >
          {customize ? <Check size={16} /> : <SlidersHorizontal size={16} />}
        </button>
      </div>

      <div className="workspace-nav__edition">
        <span>{clientEdition ? "Managed Cloud" : "Private Local"}</span>
        <span className="workspace-nav__live"><i /> runtime</span>
      </div>

      {customize && (
        <div className="workspace-nav__customize-note">
          <span>Drag tools to reorder. Hide anything you do not use.</span>
          <button onClick={reset}>Reset</button>
        </div>
      )}

      <nav className="workspace-nav__chapters">
        {pathname === "/" ? (
          <div className="workspace-nav__home-index">
            {SECTION_ORDER.map((section) => {
              const meta = SECTION_META[section];
              return (
                <a key={section} href={`#${section.toLowerCase()}`} className={homeChapter === section ? "is-current" : ""}>
                  <span className="workspace-nav__numeral">{meta.numeral}</span>
                  <span className="workspace-nav__chapter-copy">
                    <strong>{section}</strong>
                    <small>{meta.description}</small>
                  </span>
                </a>
              );
            })}
          </div>
        ) : SECTION_ORDER.map((section) => {
          const meta = SECTION_META[section];
          const sectionItems = visible.filter((href) => sectionOf(href) === section);
          const expanded = customize || openSection === section;
          const sectionActive = currentSection === section;
          if (sectionItems.length === 0) return null;

          return (
            <section key={section} className={`workspace-nav__chapter ${sectionActive ? "is-current" : ""}`}>
              <button
                className="workspace-nav__chapter-button"
                onClick={() => setOpenSection((current) => current === section && !customize ? "" : section)}
                aria-expanded={expanded}
              >
                <span className="workspace-nav__numeral">{meta.numeral}</span>
                <span className="workspace-nav__chapter-copy">
                  <strong>{section}</strong>
                  <small>{meta.description}</small>
                </span>
                <ChevronDown size={15} className={expanded ? "is-open" : ""} />
              </button>

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    className="workspace-nav__tools"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {sectionItems.map((href) => {
                      const item = BY_HREF[href];
                      if (!item) return null;
                      const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                      const isHidden = hidden.includes(href);
                      const isOver = overHref === href && dragHref !== href;

                      if (customize) {
                        return (
                          <div
                            key={href}
                            draggable
                            onDragStart={() => setDragHref(href)}
                            onDragEnter={() => setOverHref(href)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => { if (dragHref) move(dragHref, href); setDragHref(null); setOverHref(null); }}
                            onDragEnd={() => { setDragHref(null); setOverHref(null); }}
                            className={`workspace-nav__tool workspace-nav__tool--custom ${isOver ? "is-over" : ""}`}
                            style={{ opacity: dragHref === href ? 0.4 : isHidden ? 0.45 : 1 }}
                          >
                            <GripVertical size={13} />
                            <span className="workspace-nav__tool-icon">{item.icon}</span>
                            <span>{item.label}</span>
                            <button onClick={() => toggleHidden(href)} aria-label={`${isHidden ? "Show" : "Hide"} ${item.label}`}>
                              {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        );
                      }

                      return (
                        <Link key={href} href={href} className={`workspace-nav__tool ${active ? "is-active" : ""}`}>
                          {active && <motion.i layoutId="nav-indicator" />}
                          <span className="workspace-nav__tool-icon">{item.icon}</span>
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}
      </nav>

      <div className="workspace-nav__footer">
        <span>Runtime</span>
        <strong>Agents · Workspace · Approval</strong>
      </div>
    </aside>
  );
}

export function MobileNav({ clientEdition = false }: { clientEdition?: boolean }) {
  const pathname = usePathname();
  const mobileRoutes = new Set(["/", "/memory", "/pipeline", "/flow-lab", "/integrations", "/agent-kanban"]);
  const items = clientEdition
    ? NAV.filter((item) => CLIENT_NAV_ROUTES.has(item.href))
    : NAV.filter((item) => mobileRoutes.has(item.href));
  return (
    <nav aria-label="Mobile operating lenses" className="md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-40 panel panel-hot px-2 py-1.5 flex gap-1">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            title={item.label}
            className="grid place-items-center w-10 h-10 rounded-lg transition"
            style={{
              background: active ? item.dim : "transparent",
              color: active ? item.accent : "var(--fg-dim)",
            }}
          >
            {item.icon}
            <span className="sr-only">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
