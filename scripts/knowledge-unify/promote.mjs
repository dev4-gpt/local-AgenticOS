#!/usr/bin/env node
// Promote step (tracker Phase 3, ADR-024). Turns pages that pass the shared-page check into `memory.propose` events in
// the format the host's puller (src/lib/adapterEventsPuller.ts) accepts. The adapter only proposes: the host pulls the
// events, recomputes the hash, runs its own scan and queues a promotion for two-person review. Nothing here writes to a
// vault, and nothing here talks to the host.
//
// A page becomes an event only if ALL hold: it is `shared-ok` (isPromotable), its body fits the host's 2,000-character
// limit, it has an http(s) source address (canonical_url, else the first http(s) entry in `sources`), the host scanner
// does not block or flag it, and it was not proposed before at this content. Everything else is listed with a reason.
// The report holds paths, ids and reasons, never page text. The outbox folder must be outside every store.
// Usage: node scripts/knowledge-unify/promote.mjs plan|apply|orphans --store label=path --outbox DIR [--adapter-id ID] [--max-chars N] [--excerpt]
// --max-chars must match the host's ADAPTER_MAX_PROPOSAL_CHARS for this adapter (default 2000, at most 30000).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkPage, isPromotable, parseStoreArgs } from "./schema-check.mjs";
import { pageId } from "./source-index.mjs";
import { canonicalBody, canonicalUrl, isInside, listMarkdown, parseNote, resolveReal } from "./scan.mjs";

export const MAX_PROPOSAL_CHARS = 2_000; // the host's limit (adapterEventsPuller.ts)
export const HOST_CONTRACT_CHARS = 30_000; // the most the host accepts even when its limit is raised (ADAPTER_MAX_PROPOSAL_CHARS)
export const ADAPTER_VERSION = "knowledge-promote-1";
export const OUTBOX_FILE = "events.json";
export const EXCERPT_CHARS = 1_900;
export const EXCERPT_NOTE = "\n\n[Excerpt: the first part of a longer page. The full page is at the source address.]";

const ADAPTER_ID = /^[a-z][a-z0-9-]{1,40}$/;
const sha = (text) => createHash("sha256").update(text).digest("hex");

/** The http(s) address a reviewer can follow back to the origin, or null. */
export function publicSource(meta) {
  const candidates = [meta.canonical_url, ...(Array.isArray(meta.sources) ? meta.sources : [])];
  for (const value of candidates) {
    if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) continue;
    const clean = canonicalUrl(value.trim());
    if (clean) return clean;
  }
  return null;
}

export function readOutbox(dir) {
  const file = path.join(dir, OUTBOX_FILE);
  if (!existsSync(file)) return { events: [] };
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (!data || !Array.isArray(data.events)) throw new Error("the outbox file is malformed; refusing to continue");
  data.events.forEach((event, i) => {
    if (event.seq !== i + 1) throw new Error("the outbox numbers do not continue; refusing to continue");
  });
  return data;
}

/**
 * Deterministic lead excerpt of a long page: nothing is rewritten or summarised, the text is only cut. It ends at the last
 * paragraph break, else the last sentence end, else the last space, within EXCERPT_CHARS, and carries a visible note.
 */
export function excerptOf(content, maxChars = MAX_PROPOSAL_CHARS) {
  if (content.length <= maxChars) return content;
  const head = content.slice(0, Math.min(EXCERPT_CHARS, maxChars - EXCERPT_NOTE.length));
  const para = head.lastIndexOf("\n\n");
  const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf(".\n"), head.lastIndexOf("? "), head.lastIndexOf("! "));
  const space = head.lastIndexOf(" ");
  const floor = EXCERPT_CHARS / 3; // do not cut so early that almost nothing is left
  const cut = [para, sentence + 1, space].find((index) => index >= floor) ?? EXCERPT_CHARS;
  return `${head.slice(0, cut).trimEnd()}${EXCERPT_NOTE}`;
}

/** citationId ties an event to one page at one content: same page and same body means the same citation. */
export function citationOf(label, rel, bodySha) {
  return sha(`${label}::${rel}:${bodySha}`).slice(0, 32);
}

export function planPromote({ stores, outbox, adapterId, scan, now = new Date(), excerpt = false, maxChars = MAX_PROPOSAL_CHARS }) {
  if (!ADAPTER_ID.test(adapterId)) throw new Error("the adapter id is not valid");
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > HOST_CONTRACT_CHARS) throw new Error(`the length limit must be a whole number from 1 to ${HOST_CONTRACT_CHARS}`);
  const known = new Set(readOutbox(outbox).events.map((event) => event.data?.citationId));
  const items = [];
  const task = `knowledge-promote-${now.toISOString().slice(0, 10)}`;
  for (const { label, root } of stores) {
    for (const rel of listMarkdown(root, () => {})) {
      const base = { page: pageId(label, rel), root: label, rel };
      let raw;
      try {
        raw = readFileSync(path.join(root, rel), "utf8");
      } catch {
        items.push({ ...base, outcome: "skipped", reason: "unreadable" });
        continue;
      }
      const { meta, body } = parseNote(raw);
      const { status } = checkPage(meta, body);
      if (!isPromotable(status)) {
        items.push({ ...base, outcome: "skipped", reason: status === "legacy-private" ? "legacy-private" : "invalid" });
        continue;
      }
      const full = canonicalBody(body).trim();
      if (full.length > maxChars && !excerpt) {
        items.push({ ...base, outcome: "skipped", reason: "too-long" });
        continue;
      }
      const content = excerptOf(full, maxChars);
      const sourceUrl = publicSource(meta);
      if (!sourceUrl) {
        items.push({ ...base, outcome: "skipped", reason: "no-public-source" });
        continue;
      }
      const verdict = scan(content, { sourceUrl });
      if (verdict.verdict !== "clean") {
        items.push({ ...base, outcome: "skipped", reason: `scan-${verdict.verdict}` });
        continue;
      }
      const citationId = citationOf(label, rel, meta.sha256);
      if (known.has(citationId)) {
        items.push({ ...base, outcome: "skipped", reason: "already-proposed" });
        continue;
      }
      items.push({
        ...base,
        outcome: "would-propose",
        excerpted: content !== full,
        citationId,
        data: { content, sourceUrl, adapterVersion: ADAPTER_VERSION, agentPrincipal: adapterId, sourceTaskId: task, citationId, retrievedAt: now.toISOString() },
      });
    }
  }
  return { items, outbox, task };
}

export function applyPromote({ plan, now = new Date() }) {
  const file = path.join(plan.outbox, OUTBOX_FILE);
  const current = readOutbox(plan.outbox);
  const events = [...current.events];
  const written = [];
  for (const item of plan.items) {
    if (item.outcome !== "would-propose") continue;
    if (events.some((event) => event.data?.citationId === item.citationId)) continue; // a second run never doubles an event
    const seq = events.length + 1;
    const event = { seq, id: sha(`${item.citationId}:${seq}`).slice(0, 32), at: now.toISOString(), kind: "memory.propose", taskId: plan.task, data: item.data };
    events.push(event);
    written.push(item.page);
  }
  if (written.length) {
    mkdirSync(plan.outbox, { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ events }, null, 1), { mode: 0o600 });
    renameSync(tmp, file);
  }
  return { written, total: events.length };
}

export function reportOf(plan) {
  const reasons = {};
  for (const item of plan.items) if (item.outcome === "skipped") reasons[item.reason] = (reasons[item.reason] ?? 0) + 1;
  return {
    would_propose: plan.items.filter((item) => item.outcome === "would-propose").map(({ page, citationId, excerpted }) => ({ page, citationId, excerpted })),
    skipped: reasons,
  };
}

/** Proposals already in the outbox whose page is gone or changed in the stores (for example a source was deleted). */
export function orphanedProposals({ stores, outbox }) {
  const live = new Set();
  for (const { label, root } of stores) {
    for (const rel of listMarkdown(root, () => {})) {
      try {
        const { meta } = parseNote(readFileSync(path.join(root, rel), "utf8"));
        if (typeof meta.sha256 === "string") live.add(citationOf(label, rel, meta.sha256));
      } catch {
        /* unreadable pages cannot vouch for a proposal */
      }
    }
  }
  return readOutbox(outbox).events.filter((event) => !live.has(event.data?.citationId)).map((event) => ({ seq: event.seq, citationId: event.data.citationId }));
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const { stores, rest } = parseStoreArgs(argv, "promote");
  const flag = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
  const outbox = flag("--outbox");
  if (!outbox || !["plan", "apply", "orphans"].includes(command ?? "")) throw new Error("usage: promote.mjs plan|apply|orphans --store label=path --outbox DIR [--adapter-id ID]");
  const outboxReal = resolveReal(outbox);
  if (stores.some((store) => isInside(outboxReal, store.root))) throw new Error("--outbox must be outside every store");
  if (command === "orphans") {
    console.log(JSON.stringify({ orphaned: orphanedProposals({ stores, outbox: outboxReal }) }, null, 1));
    return;
  }
  const { scanMemoryContent } = await import("../../src/lib/adapterMemoryGuard.ts").catch(() => {
    throw new Error("run this with a Node that can load TypeScript files (Node 22.18 or newer)");
  });
  const scan = (text, options) => ({ verdict: scanMemoryContent(text, options).verdict });
  const maxRaw = flag("--max-chars");
  const plan = planPromote({ stores, outbox: outboxReal, adapterId: flag("--adapter-id") ?? "knowledge", scan, excerpt: rest.includes("--excerpt"), maxChars: maxRaw === undefined ? MAX_PROPOSAL_CHARS : Number(maxRaw) });
  console.log(JSON.stringify(reportOf(plan), null, 1));
  if (command === "apply") console.log(JSON.stringify(applyPromote({ plan }), null, 1));
  else console.log("Dry run: nothing written. Use `apply` to append the events.");
}

if (process.argv[1]?.endsWith("/knowledge-unify/promote.mjs")) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(2);
  });
}
