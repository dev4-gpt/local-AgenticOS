const BASE_URL = process.env.AGENTIC_OS_URL || "http://127.0.0.1:3737";
const TEST_PROMPT = "Reply with VELOCE TEST OK, then give one sentence describing your role in this operating system. Do not use tools or browse the web.";

const models = [
  { id: "claude", label: "Claude", path: "/api/claude/chat", timeoutMs: 180_000, body: { ultracode: false, project: "model-smoke" } },
  { id: "openclaw", label: "OpenClaw", path: "/api/openclaw/chat", timeoutMs: 170_000 },
  { id: "hermes", label: "Hermes", path: "/api/hermes/chat", timeoutMs: 380_000 },
  { id: "antigravity", label: "Antigravity", path: "/api/antigravity/chat", timeoutMs: 320_000, body: { dangerouslySkipPermissions: false } },
  { id: "codex", label: "Codex", path: "/api/codex/chat", timeoutMs: 180_000, body: { approvalMode: "read-only", project: "model-smoke" } },
  { id: "kimi", label: "Kimi Code", path: "/api/kimi/chat", timeoutMs: 180_000, body: { project: "model-smoke" } },
  { id: "glm", label: "GLM 5.2", path: "/api/glm/chat", timeoutMs: 180_000 },
  { id: "grok", label: "Grok Build", path: "/api/grok/chat", timeoutMs: 180_000 },
  { id: "freeclaude", label: "Free Claude Code", path: "/api/freeclaude/chat", timeoutMs: 180_000, body: { project: "model-smoke" } },
  { id: "fusion", label: "Fusion", path: "/api/fusion/chat", timeoutMs: 180_000 },
  { id: "sakana", label: "Sakana Fugu", path: "/api/sakana/chat", timeoutMs: 180_000 },
  { id: "local", label: "Local", path: "/api/local/chat", timeoutMs: 180_000 },
];

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => typeof block === "string" ? block : block?.text || "").join("");
}

function parseResponse(raw) {
  const chunks = [];
  const errors = [];
  const lines = raw.split("\n").filter((line) => line.trim());

  for (const line of lines) {
    let event;
    try { event = JSON.parse(line); }
    catch { continue; }

    if (typeof event.text === "string") chunks.push(event.text);
    if (typeof event.answer === "string") chunks.push(event.answer);
    if (event.t === "d" && typeof event.c === "string") chunks.push(event.c);
    if (event.role === "assistant") chunks.push(textFromContent(event.content));
    if (event.type === "stream_event" && typeof event.event?.delta?.text === "string") chunks.push(event.event.delta.text);
    if (event.type === "result" && typeof event.result === "string" && chunks.length === 0) chunks.push(event.result);
    if (event.type === "item.delta" && event.item?.type === "agent_message" && typeof event.item.delta === "string") chunks.push(event.item.delta);
    if (event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") chunks.push(event.item.text);

    if (event.t === "error" && event.m) errors.push(String(event.m));
    if (event.type === "error" && event.message) errors.push(String(event.message));
    if (event.error) errors.push(typeof event.error === "string" ? event.error : JSON.stringify(event.error));
    if (event.empty && event.stderr) errors.push(String(event.stderr));
  }

  const output = chunks.join("").trim();
  return { output, error: errors.filter(Boolean).join(" | ").trim() };
}

async function testModel(model) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), model.timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}${model.path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: TEST_PROMPT, history: [], ...(model.body || {}) }),
      signal: controller.signal,
    });
    const raw = await response.text();
    const parsed = parseResponse(raw);
    const contractPassed = parsed.output.toUpperCase().includes("VELOCE TEST OK");
    return {
      id: model.id,
      label: model.label,
      status: response.ok && contractPassed ? "working" : parsed.output ? "responded" : "failed",
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      contractPassed,
      response: parsed.output.slice(0, 500),
      error: parsed.error || (!response.ok ? raw.slice(0, 500) : ""),
    };
  } catch (error) {
    return {
      id: model.id,
      label: model.label,
      status: error?.name === "AbortError" ? "timeout" : "failed",
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      contractPassed: false,
      response: "",
      error: String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",").map((value) => value.trim()).filter(Boolean)) : null;
const selected = only ? models.filter((model) => only.has(model.id)) : models;

if (selected.length === 0) {
  console.error(`No matching models. Available: ${models.map((model) => model.id).join(", ")}`);
  process.exit(2);
}

console.log(`Veloce model smoke test: ${BASE_URL}`);
console.log(`Prompt: ${TEST_PROMPT}`);
console.log(`Models: ${selected.map((model) => model.label).join(", ")}\n`);

const results = [];
for (const model of selected) {
  process.stdout.write(`Testing ${model.label}... `);
  const result = await testModel(model);
  results.push(result);
  console.log(`${result.status.toUpperCase()} (${(result.latencyMs / 1000).toFixed(1)}s)`);
}

console.log("\n| Model | Status | HTTP | Latency | Contract |");
console.log("|---|---|---:|---:|---|");
for (const result of results) {
  console.log(`| ${result.label} | ${result.status} | ${result.httpStatus ?? "-"} | ${(result.latencyMs / 1000).toFixed(1)}s | ${result.contractPassed ? "pass" : "fail"} |`);
}

console.log("\nDetails:");
for (const result of results) {
  const detail = result.response || result.error || "No response body";
  console.log(`\n[${result.label}] ${detail.replace(/\s+/g, " ").slice(0, 500)}`);
}

const failed = results.filter((result) => result.status !== "working");
process.exitCode = failed.length ? 1 : 0;
