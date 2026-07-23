import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createRoot } from "react-dom/client";
import { config } from "./config";
import { EngagementSection, LegalSection, MethodSection, PricingSection, ProofSection, SiteFooter } from "./MarketingSections";
import { CHAPTERS, COSMIC_WORLDS, cosmicIgnition } from "./landingData";
import { useScrollProgress } from "./useScrollProgress";
import { useMouseParallax } from "./useMouseParallax";
import "./styles.css";
import "./cosmic.css";
import "./release.css";

const DepthScene = lazy(() => import("./DepthScene"));

function App() {
  const [notice, setNotice] = useState("");
  const [sceneReady, setSceneReady] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  // Continuous 0..1 progress across the whole pinned story region drives the
  // depth scene's camera fly-through (it already lerps + reveals against this
  // value); the active chapter is derived from the same progress so copy,
  // world, and nav stay in exact sync with the scrubbed motion.
  const { ref: storyRef, progress } = useScrollProgress<HTMLElement>(!!reduced);
  const { ref: parallaxRef, offset } = useMouseParallax<HTMLDivElement>(!!reduced);
  const active = Math.min(CHAPTERS.length - 1, Math.max(0, Math.floor(progress * CHAPTERS.length)));
  const chapter = CHAPTERS[active];
  // Signal chapter "big-bang ignition": the cosmic-ignition world enters
  // over-scaled and settles as the visitor scrolls into the first lens, so
  // the system feels like it ignites from the opening rather than fading in.
  // Only during chapter 0, and only when motion is allowed.
  const ignite = !reduced && active === 0 ? Math.max(0, 1 - progress * 6) : 0;
  const setSceneAndParallax = (node: HTMLDivElement | null) => {
    sceneRef.current = node;
    parallaxRef.current = node;
  };
  useEffect(() => {
    const target = sceneRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setSceneReady(true);
      observer.disconnect();
    }, { rootMargin: "700px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  const moveToChapter = (index: number) => document.querySelector(`#chapter-${index}`)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  const chapterRows = useMemo(() => CHAPTERS.map(([label], index) => <button className={index === active ? "chapter-nav active" : "chapter-nav"} key={label} onClick={() => moveToChapter(index)}><span>{String(index + 1).padStart(2, "0")}</span>{label}</button>), [active, reduced]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const brief = `Veloce AgenticOS discovery brief\n\nName: ${data.get("name")}\nEmail: ${data.get("email")}\nCompany: ${data.get("company")}\n\nBroken handoff:\n${data.get("challenge")}`;
    if (config.bookingUrl) { await navigator.clipboard.writeText(brief).catch(() => {}); window.open(config.bookingUrl, "_blank", "noopener"); setNotice("Your brief was copied and the booking page is open."); return; }
    if (config.contactEmail) { window.location.href = `mailto:${encodeURIComponent(config.contactEmail)}?subject=${encodeURIComponent("Veloce AgenticOS discovery brief")}&body=${encodeURIComponent(brief)}`; setNotice("Your email app should open with the discovery brief."); return; }
    if (config.contactUrl) {
      await navigator.clipboard.writeText(brief).catch(() => {});
      window.open(config.contactUrl, "_blank", "noopener,noreferrer");
      setNotice("Your brief was copied. The Veloce repository is open so you can start a conversation without this site storing your details.");
      return;
    }
    await navigator.clipboard.writeText(brief).then(() => setNotice("Your discovery brief is copied. This site intentionally stores no leads.")).catch(() => setNotice("This site intentionally stores no leads. Add a booking URL or contact email to enable handoff."));
  }
  return <><a className="skip" href="#main">Skip to content</a><header><a className="mark" href="#top">Veloce <em>AgenticOS</em></a><nav><a href="#method">Method</a><a href="#investment">Investment</a><a href="#engage">Engage</a></nav><a className="header-cta" href="#engage">Start with a handoff <b>↗</b></a></header><div className="edition-rail" aria-label="Veloce operating layers"><span>Operating layers</span>{CHAPTERS.map(([label], index) => <button key={label} onClick={() => moveToChapter(index)} className={index === active ? "rail-item active" : "rail-item"}>{String(index + 1).padStart(2, "0")} {label}</button>)}</div><main id="main" className={`site scene-${active}`}>
    <section id="top" className="intro" style={{ "--hero-image": `url(${cosmicIgnition})` } as CSSProperties}><div><p className="eyebrow">Managed operating systems for agencies and expert teams</p><h1>Make the work behind your best work <i>compound.</i></h1><p className="lede">Veloce AgenticOS turns scattered judgment into a private, human-governed delivery system your team can reuse from strategy through growth.</p><div className="actions"><a className="primary" href="#engage">Map a broken handoff <b>→</b></a><a className="quiet" href="#chapter-0">Walk through the system <b>↓</b></a></div></div><aside className="intro-proof"><div className="signal-map" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><b>01</b><b>02</b><b>03</b><b>04</b><b>05</b></div><span className="dot"></span><strong>Not software access</strong><p>A managed transformation with private workflows, explicit approvals, and budget control.</p><div><span>Private by default</span><span>Human reviewed</span><span>Budget capped</span></div></aside></section>
    <section className="scroll-story" aria-label="The Veloce AgenticOS method" ref={storyRef}>
      <div className="scene-shell" ref={setSceneAndParallax}>
        <div className="cosmic-parallax" style={{ transform: `translate(${offset.x * 10}px, ${offset.y * 10}px) scale(${1.06 + ignite * 0.16})`, filter: `brightness(${1 + ignite * 0.5})` }}>
          <AnimatePresence initial={false}>
            <motion.div key={chapter[0]} className="cosmic-world" style={{ backgroundImage: `url(${COSMIC_WORLDS[active]})` }} initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.75, ease: "easeOut" }} />
          </AnimatePresence>
          <div className="cosmic-world-shade" />
        </div>
        {sceneReady ? <Suspense fallback={<SceneFallback label="Loading original Veloce depth scene" />}><DepthScene progress={progress} /></Suspense> : <SceneFallback label="Original Veloce system scene" />}
        <div className="scene-copy" style={{ transform: `translate(${offset.x * -18}px, ${offset.y * -14}px)` }}><div className="scene-index">{String(active + 1).padStart(2, "0")} <small>/ {String(CHAPTERS.length).padStart(2, "0")}</small></div><AnimatePresence mode="wait"><motion.div key={chapter[0]} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: reduced ? 0 : 0.34 }}><p className="eyebrow">{chapter[0]}</p><h2>{chapter[1]}</h2><p>{chapter[2]}</p></motion.div></AnimatePresence></div>
        <div className="chapter-list">{chapterRows}</div>
      </div>
      <div className="story-sections">{CHAPTERS.map(([label, title, body], index) => <section id={`chapter-${index}`} key={label} className="story-section"><span>{String(index + 1).padStart(2, "0")}</span><div><p className="eyebrow">{label}</p><h2>{title}</h2><p>{body}</p></div><Artifact index={index} /></section>)}</div>
    </section>
    <MethodSection />
    <ProofSection />
    <PricingSection />
    <EngagementSection notice={notice} onSubmit={submit} />
    <LegalSection />
  </main><SiteFooter /></>;
}

function Artifact({ index }: { index: number }) { const items = [["INPUT", "Client signal", "Brief, proof, decisions, constraints"], ["PRIVATE VAULT", "Connected context", "Strategy notes, research, approved decisions"], ["WORKFLOW", "Strategy → build", "One clear handoff, no blank-prompt reset"], ["GATE", "Approval required", "Owner, purpose, decision, audit record"], ["OPERATING HEALTH", "Spend: within cap", "Progress, cost, outcomes, reusable assets"], ["ENGAGEMENT", "One problem first", "Find the work worth making repeatable"]][index]; return <article><small>{items[0]}</small><b>{items[1]}</b><p>{items[2]}</p></article>; }
function SceneFallback({ label }: { label: string }) { return <div className="depth-scene"><div className="depth-fallback">{label}</div></div>; }
createRoot(document.getElementById("root")!).render(<App />);
