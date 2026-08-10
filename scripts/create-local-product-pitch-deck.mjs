/**
 * Builds the local-product pitch deck: screenshots six local routes, then
 * writes the HTML and PDF into launch-system/pitch-deck-local-product/.
 *
 *   npm run dev:workspace          # serve the local runtime on 3939 first
 *   npm run build:pitch-deck
 *
 * Env: VELOCE_LOCAL_URL (default http://127.0.0.1:3939)
 *      VELOCE_COOKIE_FILE (default /private/tmp/veloce-runtime-cookie.txt)
 *
 * Output is gitignored on purpose — it is reproducible, ~10 MB, and its
 * screenshots are of the private local runtime.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const outDir = path.join(root, "launch-system", "pitch-deck-local-product");
const assetsDir = path.join(outDir, "assets");
const htmlPath = path.join(outDir, "veloce-local-product-pitch-deck.html");
const pdfPath = path.join(outDir, "veloce-local-product-pitch-deck.pdf");
const cookieFile = process.env.VELOCE_COOKIE_FILE || "/private/tmp/veloce-runtime-cookie.txt";
const baseUrl = (process.env.VELOCE_LOCAL_URL || "http://127.0.0.1:3939").replace(/\/$/, "");

mkdirSync(assetsDir, { recursive: true });

const routes = [
  { id: "mission", path: "/", title: "Mission Control" },
  { id: "command", path: "/claude", title: "Command Layer" },
  { id: "context", path: "/memory", title: "Context Layer" },
  { id: "orchestrate", path: "/paperclip", title: "Orchestrate Layer" },
  { id: "create", path: "/video", title: "Create Layer" },
  { id: "govern", path: "/capabilities", title: "Govern Layer" },
];

function readCookiePairs() {
  try {
    const raw = readFileSync(cookieFile, "utf8");
    return raw
      .split(";")
      .map((part) => part.trim())
      .map((part) => {
        const idx = part.indexOf("=");
        return idx > 0 ? [part.slice(0, idx), part.slice(idx + 1)] : null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function captureScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 930 },
    deviceScaleFactor: 1,
  });
  const pairs = readCookiePairs();
  if (pairs.length > 0) {
    await context.addCookies(pairs.map(([name, value]) => ({
      name,
      value,
      url: baseUrl,
      sameSite: "Lax",
    })));
  }

  const page = await context.newPage();
  const shots = {};
  for (const route of routes) {
    const imagePath = path.join(assetsDir, `${route.id}.png`);
    try {
      await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 18_000 });
      await page.waitForTimeout(2_800);
      await page.screenshot({ path: imagePath, fullPage: false });
      shots[route.id] = `assets/${route.id}.png`;
      console.log(`captured ${route.path}`);
    } catch (error) {
      console.warn(`could not capture ${route.path}: ${error.message}`);
    }
  }
  await browser.close();
  return shots;
}

function img(shots, id, alt) {
  const src = shots[id];
  if (!src) {
    return `<div class="fallback-shot"><strong>${alt}</strong><span>Screenshot unavailable; run with the authenticated local runtime active.</span></div>`;
  }
  return `<img class="shot" src="${src}" alt="${alt}" />`;
}

function slide(inner, className = "") {
  return `<section class="slide ${className}">${inner}</section>`;
}

function buildHtml(shots) {
  const slides = [
    slide(`
      <div class="kicker">Veloce AgenticOS</div>
      <h1>AI work needs an operating layer.</h1>
      <p class="lead">A local-first command system that turns fragmented model chats, notes, builds, approvals, and delivery into one inspectable workflow.</p>
      <div class="hero-grid">
        <div class="hero-copy">
          <div class="metric"><strong>6</strong><span>operating lenses</span></div>
          <div class="metric"><strong>1</strong><span>durable workspace</span></div>
          <div class="metric"><strong>0</strong><span>silent side effects</span></div>
        </div>
        ${img(shots, "mission", "Veloce Mission Control")}
      </div>
    `, "cover"),
    slide(`
      <div class="kicker">Problem</div>
      <h2>AI teams are drowning in handoffs, not ideas.</h2>
      <div class="three">
        <article><span>01</span><h3>Context breaks</h3><p>Useful reasoning lives in tabs, screenshots, chats, notebooks, and local files that do not survive the next task.</p></article>
        <article><span>02</span><h3>Tools fragment</h3><p>Coding agents, media tools, research systems, dashboards, and approval steps each become their own island.</p></article>
        <article><span>03</span><h3>Governance vanishes</h3><p>Provider keys, budget, data access, and delivery approvals are often invisible until something fails or ships.</p></article>
      </div>
    `),
    slide(`
      <div class="kicker">Solution</div>
      <h2>One operating loop for governed AI work.</h2>
      <div class="loop">
        ${["Command", "Context", "Orchestrate", "Create", "Govern", "Deliver"].map((item, index) => `<div><strong>${index + 1}</strong><span>${item}</span></div>`).join("")}
      </div>
      <p class="wide">Veloce gives every model, workflow, memory source, artifact, and external action a visible place in the system. It is local-first for the operator and tenant-scoped when hosted.</p>
    `),
    slide(`
      <div class="kicker">Command</div>
      <h2>Route work by capability, connection, and cost.</h2>
      <div class="split">
        ${img(shots, "command", "Command layer")}
        <div>
          <p>Claude, Codex, Hermes, OpenClaw, local models, and specialist providers sit behind one mission surface.</p>
          <ul>
            <li>Provider status is explicit.</li>
            <li>Conversations persist across sessions.</li>
            <li>Gated models show their prerequisite instead of pretending to work.</li>
          </ul>
        </div>
      </div>
    `),
    slide(`
      <div class="kicker">Context</div>
      <h2>Memory that survives the chat window.</h2>
      <div class="split reverse">
        <div>
          <p>Notes, goals, journals, research, and project decisions become durable context.</p>
          <ul>
            <li>Obsidian-style Markdown ownership.</li>
            <li>Graphify-style relationship mapping.</li>
            <li>Import, export, deletion, and retention as first-class workflows.</li>
          </ul>
        </div>
        ${img(shots, "context", "Context layer")}
      </div>
    `),
    slide(`
      <div class="kicker">Orchestrate</div>
      <h2>From request to reviewed work, not just a reply.</h2>
      <div class="split">
        ${img(shots, "orchestrate", "Paperclip and orchestration")}
        <div>
          <p>Paperclip, Room, Pipeline, Kanban, Loop, and Ruflo translate model output into stateful workflow.</p>
          <ul>
            <li>Queued work has owners, states, and terminal trails.</li>
            <li>Approval is required before external side effects.</li>
            <li>Cloud parity uses hosted adapters, not laptop-only services.</li>
          </ul>
        </div>
      </div>
    `),
    slide(`
      <div class="kicker">Create</div>
      <h2>Design, media, and build workflows live beside the strategy.</h2>
      <div class="split reverse">
        <div>
          <p>Flow Lab, Web Studio, OpenDesign, video, thumbnails, music, games, and montage tools form a governed production lane.</p>
          <ul>
            <li>Authorized references become original briefs.</li>
            <li>Outputs land as reviewable artifacts.</li>
            <li>Media providers activate only with approved keys and budgets.</li>
          </ul>
        </div>
        ${img(shots, "create", "Create layer")}
      </div>
    `),
    slide(`
      <div class="kicker">Govern</div>
      <h2>The boundary is the product.</h2>
      <div class="split">
        ${img(shots, "govern", "Capabilities and governance")}
        <div>
          <p>Veloce separates what is connected, what is approved, what can spend, and what needs review.</p>
          <ul>
            <li>Tenant manifests define capability scope.</li>
            <li>Budget reservation and settlement happen before provider work scales.</li>
            <li>PostHog, audit records, and runtime telemetry make behavior observable.</li>
          </ul>
        </div>
      </div>
    `),
    slide(`
      <div class="kicker">Market</div>
      <h2>Built for context-heavy teams who need outcomes.</h2>
      <div class="four">
        <article><h3>Agencies</h3><p>Intake, research, positioning, creative, approvals, delivery, and reporting.</p></article>
        <article><h3>Founders</h3><p>Product decisions, GTM assets, engineering tasks, launch evidence, and memory.</p></article>
        <article><h3>AI teams</h3><p>Provider routing, safety controls, cost visibility, artifact ownership, and workflows.</p></article>
        <article><h3>Operators</h3><p>A private workspace where daily AI work becomes repeatable operating knowledge.</p></article>
      </div>
    `),
    slide(`
      <div class="kicker">Business</div>
      <h2>From private operator OS to client-safe managed runtime.</h2>
      <div class="table">
        <div><strong>Local product</strong><span>Private operator edition with local files, vault, terminals, models, and helper services.</span></div>
        <div><strong>Hosted client runtime</strong><span>Tenant-scoped Supabase, Cloud Storage, Cloud Tasks, Cloud Run jobs, provider APIs, approvals, and audit.</span></div>
        <div><strong>Revenue path</strong><span>Setup, managed operating systems, workflow packs, provider enablement, and monthly operations.</span></div>
      </div>
    `),
    slide(`
      <div class="kicker">Proof</div>
      <h2>What is already real, and what is intentionally gated.</h2>
      <div class="proof">
        <div><h3>Working now</h3><p>Local operator UI, memory workflows, model surfaces, creative tools, hosted client shell, Supabase persistence, Cloud Run job lane, terminal events, artifact storage, signed downloads, and PostHog smoke telemetry.</p></div>
        <div><h3>Gated by design</h3><p>Provider-specific adapters, media/publishing OAuth, E2B interactive sessions, GPU workers, and production delivery destinations activate only after credentials, budgets, isolation, and approval tests exist.</p></div>
      </div>
    `),
    slide(`
      <div class="kicker">Ask</div>
      <h2>Help turn the local OS into the client operating standard.</h2>
      <p class="lead">The next milestone is full hosted behavioral parity for the test tenant: every local workflow mapped to a safe cloud adapter with state, terminal evidence, artifacts, budget, and approval.</p>
      <div class="cta">
        <strong>Next step</strong>
        <span>Run one end-to-end client portal demo: intake -> memory -> workflow -> artifact -> approval -> delivery evidence.</span>
      </div>
    `, "closing"),
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Veloce AgenticOS Local Product Pitch Deck</title>
<style>
  @page { size: 16in 9in; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0d1110; color: #f7f1e7; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .slide { width: 16in; height: 9in; page-break-after: always; position: relative; overflow: hidden; padding: .72in .82in; background:
    linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px) 0 0 / .62in .62in,
    linear-gradient(0deg, rgba(255,255,255,.025) 1px, transparent 1px) 0 0 / .62in .62in,
    radial-gradient(circle at 82% 18%, rgba(83, 167, 149, .24), transparent 35%),
    radial-gradient(circle at 8% 88%, rgba(237, 172, 94, .16), transparent 34%),
    #11130f; }
  .slide::after { content: "Veloce AgenticOS"; position: absolute; bottom: .3in; right: .42in; color: rgba(247,241,231,.42); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }
  .kicker { color: #8ee0c2; text-transform: uppercase; letter-spacing: .16em; font-size: 14px; font-weight: 800; margin-bottom: .16in; }
  h1, h2 { margin: 0; letter-spacing: 0; line-height: .93; font-weight: 820; }
  h1 { max-width: 10.8in; font-size: 82px; }
  h2 { max-width: 11.8in; font-size: 56px; }
  h3 { margin: 0 0 .09in; font-size: 22px; }
  p { color: rgba(247,241,231,.78); line-height: 1.45; font-size: 18px; margin: 0; }
  .lead { max-width: 9.8in; font-size: 25px; margin-top: .25in; color: rgba(247,241,231,.84); }
  .wide { max-width: 10in; margin-top: .42in; font-size: 23px; }
  .hero-grid { display: grid; grid-template-columns: 3.1in 1fr; gap: .36in; align-items: end; margin-top: .48in; }
  .hero-copy { display: grid; gap: .15in; }
  .metric { border: 1px solid rgba(247,241,231,.14); border-radius: 8px; background: rgba(255,255,255,.045); padding: .18in; }
  .metric strong { display: block; font-size: 38px; color: #f0bd71; line-height: 1; }
  .metric span { display: block; margin-top: .08in; color: rgba(247,241,231,.72); font-size: 14px; text-transform: uppercase; letter-spacing: .08em; }
  .shot { width: 100%; height: 4.82in; object-fit: cover; object-position: left top; border: 1px solid rgba(247,241,231,.16); border-radius: 10px; box-shadow: 0 28px 80px rgba(0,0,0,.36); }
  .cover .shot { height: 4.55in; }
  .fallback-shot { height: 4.82in; display: grid; place-items: center; text-align: center; gap: .12in; border: 1px dashed rgba(247,241,231,.24); border-radius: 10px; color: rgba(247,241,231,.7); background: rgba(255,255,255,.04); }
  .fallback-shot strong, .fallback-shot span { display: block; }
  .three, .four { display: grid; gap: .22in; margin-top: .7in; }
  .three { grid-template-columns: repeat(3, 1fr); }
  .four { grid-template-columns: repeat(4, 1fr); }
  article, .proof > div, .table > div { border: 1px solid rgba(247,241,231,.14); border-radius: 10px; padding: .3in; background: rgba(255,255,255,.045); min-height: 2.2in; }
  article span { display: inline-block; color: #f0bd71; font-size: 13px; font-weight: 900; letter-spacing: .12em; margin-bottom: .14in; }
  .split { display: grid; grid-template-columns: 8.9in 4.8in; gap: .42in; align-items: center; margin-top: .42in; }
  .split.reverse { grid-template-columns: 4.8in 8.9in; }
  .split p { font-size: 22px; margin-bottom: .25in; }
  ul { margin: 0; padding-left: .22in; color: rgba(247,241,231,.8); font-size: 18px; line-height: 1.52; }
  li { margin: .08in 0; }
  .loop { margin-top: .65in; display: grid; grid-template-columns: repeat(6, 1fr); gap: .13in; }
  .loop div { min-height: 1.45in; display: flex; flex-direction: column; justify-content: space-between; padding: .19in; border: 1px solid rgba(142,224,194,.32); border-radius: 9px; background: rgba(142,224,194,.07); }
  .loop strong { color: #f0bd71; font-size: 16px; }
  .loop span { font-size: 19px; font-weight: 800; }
  .table, .proof { display: grid; grid-template-columns: repeat(3, 1fr); gap: .22in; margin-top: .65in; }
  .proof { grid-template-columns: repeat(2, 1fr); }
  .table strong { display: block; color: #8ee0c2; font-size: 22px; margin-bottom: .13in; }
  .table span { color: rgba(247,241,231,.78); font-size: 18px; line-height: 1.42; }
  .cta { margin-top: .55in; width: 9.6in; border-left: 7px solid #f0bd71; padding: .26in .34in; background: rgba(240,189,113,.11); border-radius: 8px; }
  .cta strong { display: block; font-size: 24px; margin-bottom: .08in; }
  .cta span { color: rgba(247,241,231,.82); font-size: 21px; }
  .closing h2 { max-width: 12in; }
</style>
</head>
<body>
${slides.join("\n")}
</body>
</html>`;
}

async function exportPdf() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.pdf({ path: pdfPath, printBackground: true, width: "16in", height: "9in", margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await browser.close();
}

const shots = await captureScreenshots();
writeFileSync(htmlPath, buildHtml(shots), "utf8");
await exportPdf();

console.log(`html ${htmlPath}`);
console.log(`pdf ${pdfPath}`);
