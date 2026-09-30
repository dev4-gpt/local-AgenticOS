import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

const MAX_LINKS_PER_SOURCE = 100;
const MAX_TEXT_LENGTH = 30_000;
const MAX_SOURCES_PER_PACK = 100;
const MAX_PACK_BYTES = 1_000_000;

function writePrivateFile(file, contents) {
  if (existsSync(file)) chmodSync(file, 0o600);
  writeFileSync(file, contents, { mode: 0o600 });
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function plainText(node) {
  const parts = [];
  walk(node, (item) => {
    if (item.type === "text" || item.type === "inlineCode") parts.push(item.value);
  });
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function markdownSourcePack(markdown, startUrl, collectedAt = new Date().toISOString()) {
  const source = new URL(startUrl);
  if (!["http:", "https:"].includes(source.protocol) || source.username || source.password) throw new Error("source_url_invalid");
  source.hash = "";
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const definitions = new Map();
  walk(root, (node) => {
    if (node.type === "definition" && !definitions.has(node.identifier.toLowerCase())) definitions.set(node.identifier.toLowerCase(), node.url);
  });
  const sections = [];
  const skipped = [];
  let section = { title: "Document", parts: [], links: [] };
  for (const node of root.children) {
    if (node.type === "heading" && node.depth <= 2) {
      if (section.parts.length || section.links.length) sections.push(section);
      section = { title: plainText(node) || "Untitled section", parts: [], links: [] };
      continue;
    }
    let hasRawHtml = false;
    walk(node, (child) => { if (child.type === "html") hasRawHtml = true; });
    if (hasRawHtml) {
      skipped.push({ section: section.title, label: "Raw HTML", reason: "html_not_imported" });
      continue;
    }
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (Number.isSafeInteger(start) && Number.isSafeInteger(end)) {
      const raw = markdown.slice(start, end).trim();
      if (raw) section.parts.push(raw);
    }
    walk(node, (child) => {
      if (!["link", "image", "linkReference", "imageReference"].includes(child.type)) return;
      const reference = child.type === "linkReference" || child.type === "imageReference";
      const target = reference ? definitions.get(child.identifier.toLowerCase()) : child.url;
      const label = child.type === "image" || child.type === "imageReference" ? child.alt || "Image" : plainText(child);
      try {
        if (typeof target !== "string" || !target.trim()) throw new Error("invalid_url");
        const url = new URL(target, source);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("invalid_url");
        url.hash = "";
        section.links.push({ url: url.toString(), text: label });
      } catch {
        skipped.push({ section: section.title, label, reason: "invalid_url" });
      }
    });
  }
  if (section.parts.length || section.links.length) sections.push(section);
  const sources = [];
  const usedTabs = new Set();
  for (const current of sections) {
    const text = current.parts.join("\n\n").trim();
    if (!text) continue;
    const chunks = Math.max(1, Math.ceil(current.links.length / MAX_LINKS_PER_SOURCE));
    for (let index = 0; index < chunks; index++) {
      const links = current.links.slice(index * MAX_LINKS_PER_SOURCE, (index + 1) * MAX_LINKS_PER_SOURCE);
      const title = chunks === 1 ? current.title : `${current.title} (${index + 1}/${chunks})`;
      if (text.length > MAX_TEXT_LENGTH) throw new Error("source_text_too_large");
      let tab = title;
      for (let occurrence = 2; usedTabs.has(tab); occurrence++) tab = `${title} (${occurrence})`;
      usedTabs.add(tab);
      sources.push({ title, url: source.toString(), tab, text, collectedAt, links });
    }
  }
  if (!sources.length) throw new Error("no_content_found");
  return { startUrl: source.toString(), skipped, sources };
}

export function splitMarkdownSourcePack(pack) {
  if (pack.skipped.length > 100) throw new Error("too_many_skipped_entries");
  const batches = [];
  let sources = [];
  const encoded = (items, skipped) => JSON.stringify({ startUrl: pack.startUrl, skipped, sources: items }, null, 2);
  for (const source of pack.sources) {
    const skipped = batches.length ? [] : pack.skipped;
    const candidate = [...sources, source];
    if (candidate.length > MAX_SOURCES_PER_PACK || Buffer.byteLength(encoded(candidate, skipped)) > MAX_PACK_BYTES) {
      if (!sources.length) throw new Error("source_pack_item_too_large");
      batches.push({ startUrl: pack.startUrl, skipped, sources });
      sources = [source];
      if (Buffer.byteLength(encoded(sources, [])) > MAX_PACK_BYTES) throw new Error("source_pack_item_too_large");
    } else {
      sources = candidate;
    }
  }
  if (sources.length) batches.push({ startUrl: pack.startUrl, skipped: batches.length ? [] : pack.skipped, sources });
  return batches;
}

if (process.argv[1]?.endsWith("/prepare-markdown-source-pack.mjs")) {
  const [input, startUrl, output] = process.argv.slice(2);
  if (!input || !startUrl || !output) {
    console.error("Usage: node scripts/prepare-markdown-source-pack.mjs input.md source-url output.json");
    process.exitCode = 2;
  } else {
    const pack = markdownSourcePack(readFileSync(input, "utf8"), startUrl);
    const batches = splitMarkdownSourcePack(pack);
    const parsed = path.parse(output);
    const files = batches.map((batch, index) => {
      const file = batches.length === 1 ? output : path.join(parsed.dir, `${parsed.name}.part-${String(index + 1).padStart(3, "0")}${parsed.ext || ".json"}`);
      const encoded = JSON.stringify(batch, null, 2);
      writePrivateFile(file, encoded);
      return { file, sha256: createHash("sha256").update(encoded).digest("hex"), sources: batch.sources.length, links: batch.sources.reduce((count, item) => count + item.links.length, 0) };
    });
    if (files.length > 1) {
      const manifest = path.join(parsed.dir, `${parsed.name}.manifest.json`);
      writePrivateFile(manifest, JSON.stringify({ version: 1, startUrl: pack.startUrl, sources: pack.sources.length, links: files.reduce((count, file) => count + file.links, 0), skipped: pack.skipped.length, batches: files }, null, 2));
      console.log(JSON.stringify({ manifest, batches: files.length, sources: pack.sources.length, links: files.reduce((count, file) => count + file.links, 0), skipped: pack.skipped.length }));
    } else {
      console.log(JSON.stringify({ output, batches: 1, sources: pack.sources.length, links: files[0].links, skipped: pack.skipped.length }));
    }
  }
}
