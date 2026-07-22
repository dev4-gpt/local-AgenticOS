import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ignored = new Set([".git", ".next", "node_modules", "dist", "coverage", "test-results", "out"]);
const textExtensions = new Set(["", ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".sh", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);
const directPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["OpenAI-style key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ["OpenRouter key", /\bsk-or-v1-[A-Za-z0-9_-]{24,}\b/],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{32,}\b/],
];
const assignment = /^\s*(?:export\s+)?(OPENAI_API_KEY|OPENROUTER_API_KEY|ELEVENLABS_API_KEY|ELEVENLABS_MUSIC_API_KEY|HEYGEN_API_KEY|SUNO_API_KEY|FIRECRAWL_API_KEY|HUNTER_API_KEY|APOLLO_API_KEY|PAPERCLIP_AUTOMATION_TOKEN)\s*=\s*["']?([^\s"'`#]{16,})/gm;
const placeholders = /^(?:your|replace|change|example|sample|test|placeholder|process\.env|\$|\{|<)/i;
const failures = [];

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) files.push(...await walk(join(directory, entry.name)));
    } else if (entry.isFile() && textExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

for (const path of await walk(root)) {
  const contents = await readFile(path, "utf8").catch(() => "");
  for (const [label, pattern] of directPatterns) {
    if (pattern.test(contents)) failures.push(`${relative(root, path)} contains a possible ${label}`);
  }
  for (const match of contents.matchAll(assignment)) {
    if (!placeholders.test(match[2])) failures.push(`${relative(root, path)} contains a populated ${match[1]} assignment`);
  }
}

if (failures.length) {
  console.error("Repository secret scan failed:");
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Repository secret scan passed.");
