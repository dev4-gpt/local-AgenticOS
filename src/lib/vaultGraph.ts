import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { listNotes, VAULT_ROOT } from "./vault";

// Build a knowledge-graph from the vault: nodes = notes, links = [[wikilinks]].
// Folder of the note → color group. Out-degree+in-degree → size.
//
// We resolve wikilinks by note title (basename without .md) which matches
// Obsidian's default linking behavior. Aliases (`[[note|alias]]`) are stripped.

export interface GraphNode {
  id: string;        // relative path (unique key)
  title: string;     // basename (display label)
  group: string;     // top-level folder
  degree: number;    // links in + out
  mtime: number;
}
export interface GraphLink { source: string; target: string; relation: "wikilink" | "shared-topic"; }
export interface VaultGraph { nodes: GraphNode[]; links: GraphLink[]; }

const WIKILINK_RE = /\[\[([^\[\]\n|#]+)(?:#[^\[\]\n|]+)?(?:\|[^\[\]\n]+)?\]\]/g;
const GRAPH_STOP_WORDS = new Set([
  "about", "after", "agentic", "agentos", "also", "been", "being", "build", "built", "could", "from",
  "have", "into", "just", "more", "note", "notes", "only", "other", "should", "system", "than", "that",
  "their", "there", "these", "they", "this", "through", "using", "veloce", "were", "what", "when", "where",
  "which", "while", "with", "would", "your",
]);

function meaningfulTokens(title: string, content: string): Set<string> {
  const headings = [...content.matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => match[1]).join(" ");
  const tags = [...content.matchAll(/^tags:\s*\[([^\]]+)\]/gim)].map((match) => match[1]).join(" ");
  const source = `${title} ${title} ${headings} ${headings} ${tags} ${tags} ${content.slice(0, 14_000)}`
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ");
  const counts = new Map<string, number>();
  for (const raw of source.split(/\s+/)) {
    if (raw.length < 4 || /^\d+$/.test(raw) || GRAPH_STOP_WORDS.has(raw)) continue;
    const token = raw.length > 5 && raw.endsWith("s") ? raw.slice(0, -1) : raw;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count >= 2).map(([token]) => token));
}

export async function buildVaultGraph(): Promise<VaultGraph> {
  if (!VAULT_ROOT) return { nodes: [], links: [] };
  const files = await listNotes();

  // Index by title (lowercased) → relative path
  const byTitle = new Map<string, string>();
  const meta = new Map<string, { rel: string; title: string; group: string; mtime: number; content: string; tokens: Set<string> }>();

  await Promise.all(files.map(async (abs) => {
    const rel = path.relative(VAULT_ROOT, abs);
    const title = path.basename(abs, ".md");
    // If the file is at the vault root (no folder separator), bucket it as "root"
    // rather than using the filename as a "group" of one.
    const head = rel.split(path.sep)[0] || "root";
    const group = rel.includes(path.sep) ? head : "root";
    let mtime = 0;
    try { const st = await stat(abs); mtime = st.mtimeMs; } catch {}
    let content = "";
    try { content = await readFile(abs, "utf8"); } catch {}
    meta.set(rel, { rel, title, group, mtime, content, tokens: meaningfulTokens(title, content) });
    // first-wins so links resolve deterministically when titles collide
    if (!byTitle.has(title.toLowerCase())) byTitle.set(title.toLowerCase(), rel);
  }));

  const linkSet = new Set<string>(); // dedupe "a→b"
  const links: GraphLink[] = [];
  const degree = new Map<string, number>();

  for (const document of meta.values()) {
    const matches = document.content.matchAll(WIKILINK_RE);
    for (const m of matches) {
      const targetTitle = m[1].trim();
      if (!targetTitle) continue;
      const targetRel = byTitle.get(targetTitle.toLowerCase());
      if (!targetRel || targetRel === document.rel) continue;
      const key = document.rel + "→" + targetRel;
      if (linkSet.has(key)) continue;
      linkSet.add(key);
      links.push({ source: document.rel, target: targetRel, relation: "wikilink" });
      degree.set(document.rel, (degree.get(document.rel) ?? 0) + 1);
      degree.set(targetRel, (degree.get(targetRel) ?? 0) + 1);
    }
  }

  // Give notes useful relationships even when users have not manually added
  // Obsidian wikilinks. Each note contributes only its two strongest matches.
  const documents = [...meta.values()];
  const candidates = new Map<string, { target: string; score: number }[]>();
  for (let i = 0; i < documents.length; i++) {
    for (let j = i + 1; j < documents.length; j++) {
      const left = documents[i];
      const right = documents[j];
      if (!left.tokens.size || !right.tokens.size) continue;
      let shared = 0;
      for (const token of left.tokens) if (right.tokens.has(token)) shared += 1;
      const containment = shared / Math.max(1, Math.min(left.tokens.size, right.tokens.size));
      if (shared < 3 || containment < 0.14) continue;
      const score = containment + shared * 0.015;
      candidates.set(left.rel, [...(candidates.get(left.rel) ?? []), { target: right.rel, score }]);
      candidates.set(right.rel, [...(candidates.get(right.rel) ?? []), { target: left.rel, score }]);
    }
  }
  for (const [source, matches] of candidates) {
    for (const match of matches.sort((a, b) => b.score - a.score).slice(0, 2)) {
      const pair = [source, match.target].sort();
      const key = `${pair[0]}↔${pair[1]}`;
      if (linkSet.has(key)) continue;
      linkSet.add(key);
      links.push({ source: pair[0], target: pair[1], relation: "shared-topic" });
      degree.set(pair[0], (degree.get(pair[0]) ?? 0) + 1);
      degree.set(pair[1], (degree.get(pair[1]) ?? 0) + 1);
    }
  }

  const nodes: GraphNode[] = Array.from(meta.values()).map((m) => ({
    id: m.rel,
    title: m.title,
    group: m.group,
    degree: degree.get(m.rel) ?? 0,
    mtime: m.mtime,
  }));

  return { nodes, links };
}
