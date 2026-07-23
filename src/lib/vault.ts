import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

export const VAULT_ROOT = config.vaultRoot ?? "";
export const OMI_PATH = VAULT_ROOT ? path.join(VAULT_ROOT, "Omi/Memories.md") : "";
export const VAULT_AVAILABLE = Boolean(VAULT_ROOT);

// Generated Graphify output must never be treated as source knowledge. Including
// it makes the graph index itself recursively and slows rebuilds dramatically.
const SKIP_DIRS = new Set([".obsidian", ".trash", "node_modules", ".git", "graphify-out", "Graphify"]);
const SEARCH_EXTENSIONS = new Set([".md", ".txt", ".json", ".csv", ".html", ".htm", ".rtf", ".pdf", ".docx"]);
const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".csv", ".html", ".htm", ".rtf"]);
const MAX_SEARCH_TEXT_BYTES = 5 * 1024 * 1024;

export function safeJoin(rel: string): string | null {
  const abs = path.resolve(VAULT_ROOT, rel);
  const root = path.resolve(VAULT_ROOT);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) return null;
  return abs;
}

async function listKnowledgeDocuments(maxDepth = 6): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let items;
    try { items = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const item of items) {
      if (SKIP_DIRS.has(item.name)) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) await walk(full, depth + 1);
      else if (item.isFile() && SEARCH_EXTENSIONS.has(path.extname(item.name).toLowerCase())) out.push(full);
    }
  }
  await walk(VAULT_ROOT, 0);
  return out;
}

export async function listNotes(maxDepth = 6): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let items;
    try { items = await readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const it of items) {
      if (SKIP_DIRS.has(it.name)) continue;
      const full = path.join(dir, it.name);
      if (it.isDirectory()) {
        await walk(full, depth + 1);
      } else if (it.isFile() && /\.md$/i.test(it.name)) {
        out.push(full);
      }
    }
  }
  await walk(VAULT_ROOT, 0);
  return out;
}

export interface NoteHit {
  path: string;        // relative to vault root
  title: string;       // basename without .md
  preview: string;     // snippet around match
  score: number;
  mtime: number;
  kind: "text" | "binary";
}

function previewAround(content: string, idx: number, span = 120): string {
  const start = Math.max(0, idx - span);
  const end = Math.min(content.length, idx + span);
  let p = content.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) p = "…" + p;
  if (end < content.length) p = p + "…";
  return p;
}

interface IndexedNote {
  file: string;
  path: string;
  title: string;
  normalizedTitle: string;
  normalizedPath: string;
  content: string;
  normalizedContent: string;
  mtime: number;
  size: number;
  kind: "text" | "binary";
}

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "i", "in", "is", "it",
  "me", "my", "of", "on", "or", "our", "that", "the", "this", "to", "was", "we", "what", "when",
  "where", "which", "who", "why", "with", "you", "your",
]);

let noteIndex = new Map<string, IndexedNote>();

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(token: string): string {
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function queryTokens(value: string): string[] {
  return [...new Set(normalize(value).split(" ").filter((token) => token.length > 1 && !STOP_WORDS.has(token)).map(stem))];
}

function includesToken(haystack: string, token: string): boolean {
  return haystack.includes(token) || haystack.includes(`${token}s`) || haystack.includes(`${token}ed`) || haystack.includes(`${token}ing`);
}

async function refreshNoteIndex(): Promise<IndexedNote[]> {
  const files = await listKnowledgeDocuments();
  const live = new Set(files);
  for (const cached of noteIndex.keys()) {
    if (!live.has(cached)) noteIndex.delete(cached);
  }

  await Promise.all(files.map(async (file) => {
    try {
      const st = await stat(file);
      const cached = noteIndex.get(file);
      if (cached && cached.mtime === st.mtimeMs && cached.size === st.size) return;
      const extension = path.extname(file).toLowerCase();
      const kind = TEXT_EXTENSIONS.has(extension) ? "text" : "binary";
      const content = kind === "text" && st.size <= MAX_SEARCH_TEXT_BYTES ? await readFile(file, "utf8") : "";
      const rel = path.relative(VAULT_ROOT, file);
      const title = path.basename(file, extension);
      noteIndex.set(file, {
        file,
        path: rel,
        title,
        normalizedTitle: normalize(title),
        normalizedPath: normalize(rel),
        content,
        normalizedContent: normalize(content),
        mtime: st.mtimeMs,
        size: st.size,
        kind,
      });
    } catch {
      noteIndex.delete(file);
    }
  }));

  return [...noteIndex.values()];
}

export async function searchNotes(q: string, limit = 40): Promise<NoteHit[]> {
  if (!q.trim()) return [];
  const phrase = normalize(q);
  const tokens = queryTokens(q);
  if (!phrase && tokens.length === 0) return [];
  const notes = await refreshNoteIndex();
  const hits: NoteHit[] = [];
  for (const note of notes) {
    const titlePhrase = phrase ? note.normalizedTitle.includes(phrase) : false;
    const pathPhrase = phrase ? note.normalizedPath.includes(phrase) : false;
    const contentPhrase = phrase ? note.normalizedContent.includes(phrase) : false;
    const titleMatches = tokens.filter((token) => includesToken(note.normalizedTitle, token));
    const pathMatches = tokens.filter((token) => includesToken(note.normalizedPath, token));
    const contentMatches = tokens.filter((token) => includesToken(note.normalizedContent, token));
    const matchedTokens = new Set([...titleMatches, ...pathMatches, ...contentMatches]);
    if (!titlePhrase && !pathPhrase && !contentPhrase && matchedTokens.size === 0) continue;
    // A long natural-language query should not return every document that happens
    // to contain one generic word. Keep phrase matches, otherwise require enough
    // of the user's intent words to be present for a useful result.
    const minimumTokenMatches = tokens.length >= 3
      ? Math.min(tokens.length, Math.max(3, Math.ceil(tokens.length * 0.6)))
      : 1;
    if (!titlePhrase && !pathPhrase && !contentPhrase && matchedTokens.size < minimumTokenMatches) continue;

    let score = 0;
    if (note.normalizedTitle === phrase) score += 30;
    else if (titlePhrase) score += 18;
    if (pathPhrase) score += 10;
    if (contentPhrase) score += 8;
    score += titleMatches.length * 8;
    score += pathMatches.length * 5;
    score += contentMatches.length * 2;
    if (tokens.length > 1 && matchedTokens.size === tokens.length) score += 10;

    const rawLower = note.content.toLowerCase();
    let idx = q.trim() ? rawLower.indexOf(q.trim().toLowerCase()) : -1;
    if (idx < 0) {
      const previewToken = tokens.find((token) => rawLower.includes(token));
      idx = previewToken ? rawLower.indexOf(previewToken) : 0;
    }
    hits.push({
      path: note.path,
      title: note.title,
      preview: previewAround(note.content, Math.max(0, idx)),
      score,
      mtime: note.mtime,
      kind: note.kind,
    });
  }
  hits.sort((a, b) => b.score - a.score || b.mtime - a.mtime);
  return hits.slice(0, limit);
}

export async function recentNotes(limit = 12): Promise<{ path: string; title: string; mtime: number }[]> {
  const files = await listNotes();
  const stats = await Promise.all(files.map(async (f) => {
    try { const s = await stat(f); return { f, m: s.mtimeMs }; }
    catch { return { f, m: 0 }; }
  }));
  stats.sort((a, b) => b.m - a.m);
  return stats.slice(0, limit).map(({ f, m }) => ({
    path: path.relative(VAULT_ROOT, f),
    title: path.basename(f, ".md"),
    mtime: m,
  }));
}

// Notes created/edited on a specific day (YYYY-MM-DD) — the real "what happened".
export async function notesModifiedOn(ymd: string, limit = 30): Promise<{ path: string; title: string; mtime: number }[]> {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return [];
  const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const end = start + 86400000;
  const files = await listNotes();
  const out: { path: string; title: string; mtime: number }[] = [];
  for (const f of files) {
    try {
      const s = await stat(f);
      if (s.mtimeMs >= start && s.mtimeMs < end) {
        out.push({ path: path.relative(VAULT_ROOT, f), title: path.basename(f, ".md"), mtime: s.mtimeMs });
      }
    } catch { /* skip */ }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, limit);
}

export async function readNote(rel: string): Promise<{ path: string; content: string; mtime: number } | null> {
  const abs = safeJoin(rel);
  if (!abs) return null;
  if (!TEXT_EXTENSIONS.has(path.extname(abs).toLowerCase())) return null;
  try {
    const [content, st] = await Promise.all([readFile(abs, "utf8"), stat(abs)]);
    return { path: rel, content, mtime: st.mtimeMs };
  } catch { return null; }
}

export async function readVaultDocument(rel: string): Promise<{ data: Buffer; contentType: string; filename: string } | null> {
  const abs = safeJoin(rel);
  if (!abs) return null;
  const extension = path.extname(abs).toLowerCase();
  if (!SEARCH_EXTENSIONS.has(extension)) return null;
  const contentTypes: Record<string, string> = {
    ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json",
    ".csv": "text/csv; charset=utf-8", ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
    ".rtf": "application/rtf", ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  try { return { data: await readFile(abs), contentType: contentTypes[extension] ?? "application/octet-stream", filename: path.basename(abs) }; }
  catch { return null; }
}

// Omi memories: parse bullet list from Memories.md
export async function searchOmi(q: string, limit = 40): Promise<string[]> {
  let content: string;
  try { content = await readFile(OMI_PATH, "utf8"); }
  catch { return []; }
  const needle = q.trim().toLowerCase();
  const lines = content.split(/\r?\n/).filter((l) => l.trim().startsWith("- "));
  const matches = needle
    ? lines.filter((l) => l.toLowerCase().includes(needle))
    : lines.slice(0, limit);
  return matches.slice(0, limit).map((l) => l.replace(/^- /, ""));
}

// The most RECENT Omi memories (Omi appends newest to the end of the file).
// Filters out app/build prompts that Omi captured off-screen while the user was
// testing the Agent Factory — those aren't real-life memories.
export async function recentOmi(limit = 40): Promise<string[]> {
  try {
    const content = await readFile(OMI_PATH, "utf8");
    const lines = content.split(/\r?\n/)
      .filter((l) => l.trim().startsWith("- "))
      .map((l) => l.replace(/^- /, "").trim())
      .filter((l) => l.length > 8 && !/^(a|an|create|build|make|design|plan|generate|develop|code|write me|a playable|an interactive)\b/i.test(l));
    return lines.slice(-limit).reverse();
  } catch { return []; }
}
