// Typed hosted Loop contract.
//
// The local loop drives a builder and an adversarial judge across several
// rounds, routing through Hermes OAuth, the Nous Portal, and a local Ollama
// judge. Cloud Run has none of those, so the same builder -> judge -> revise
// cycle runs on the approved provider lane, bounded by a round cap, with every
// round recorded as a tenant row.

export const LOOP_STATUSES = ["queued", "running", "passed", "exhausted", "failed", "cancelled"] as const;
export type LoopStatus = (typeof LOOP_STATUSES)[number];

export const LOOP_MAX_ROUNDS = 5;
export const LOOP_DEFAULT_ROUNDS = 3;

export type LoopRun = {
  id: string;
  goal: string;
  title: string;
  status: LoopStatus;
  jobId: string | null;
  builderProvider: string | null;
  builderModel: string | null;
  judgeProvider: string | null;
  judgeModel: string | null;
  maxRounds: number;
  roundsCompleted: number;
  bestScore: number | null;
  finalSummary: string | null;
  buildArtifactId: string | null;
  buildPreviewHtml: string | null;
  costMicros: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LoopRound = {
  id: string;
  runId: string;
  round: number;
  passed: boolean;
  score: number | null;
  issues: string[];
  summary: string;
  artifactChars: number;
  costMicros: number;
  errorCode: string | null;
  createdAt: string;
};

export type LoopVerdict = { pass: boolean; score: number; issues: string[]; summary: string };

function str(value: unknown, max = 240) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function nullableStr(value: unknown, max = 240) {
  const text = str(value, max);
  return text ? text : null;
}

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeLoopRun(row: Record<string, unknown>): LoopRun {
  const status = str(row.status, 20);
  const score = row.best_score === null || row.best_score === undefined ? null : Math.round(num(row.best_score));
  return {
    id: str(row.id, 36),
    goal: str(row.goal, 10000),
    title: str(row.title, 240) || "Improvement loop",
    status: (LOOP_STATUSES as readonly string[]).includes(status) ? status as LoopStatus : "queued",
    jobId: nullableStr(row.job_id, 36),
    builderProvider: nullableStr(row.builder_provider, 40),
    builderModel: nullableStr(row.builder_model, 120),
    judgeProvider: nullableStr(row.judge_provider, 40),
    judgeModel: nullableStr(row.judge_model, 120),
    maxRounds: Math.min(LOOP_MAX_ROUNDS, Math.max(1, Math.round(num(row.max_rounds)) || LOOP_DEFAULT_ROUNDS)),
    roundsCompleted: Math.max(0, Math.round(num(row.rounds_completed))),
    bestScore: score,
    finalSummary: nullableStr(row.final_summary, 4000),
    buildArtifactId: nullableStr(row.build_artifact_id, 36),
    buildPreviewHtml: nullableStr(row.build_preview_html, 40000),
    costMicros: Math.max(0, Math.round(num(row.cost_micros))),
    errorCode: nullableStr(row.error_code, 120),
    createdAt: str(row.created_at, 40),
    updatedAt: str(row.updated_at, 40),
  };
}

export function normalizeLoopRound(row: Record<string, unknown>): LoopRound {
  const score = row.score === null || row.score === undefined ? null : Math.round(num(row.score));
  return {
    id: str(row.id, 36),
    runId: str(row.run_id, 36),
    round: Math.max(1, Math.round(num(row.round))),
    passed: row.passed === true,
    score,
    issues: Array.isArray(row.issues) ? row.issues.filter((issue): issue is string => typeof issue === "string").slice(0, 8) : [],
    summary: str(row.summary, 4000),
    artifactChars: Math.max(0, Math.round(num(row.artifact_chars))),
    costMicros: Math.max(0, Math.round(num(row.cost_micros))),
    errorCode: nullableStr(row.error_code, 120),
    createdAt: str(row.created_at, 40),
  };
}

/**
 * The builder prompt. Round one starts from scratch; later rounds must fix
 * exactly the issues the judge raised and leave working parts alone.
 */
export function loopBuilderPrompt(input: { goal: string; previous: string; issues: string[] }) {
  const feedback = input.issues.length
    ? `\n\nThe judge REJECTED the last version. Fix exactly these and change nothing else that already works:\n- ${input.issues.join("\n- ")}`
    : "";
  const base = input.previous
    ? `\n\n--- YOUR LAST VERSION (revise it) ---\n${input.previous}\n--- END ---`
    : "\n\n(No draft yet — create the first version from scratch.)";
  return [
    "You are the BUILDER in a self-running loop. Produce the best possible version of the work toward the definition of done.",
    "A separate adversarial judge will grade it, so genuinely meet the goal rather than looking plausible.",
    "",
    `DEFINITION OF DONE:\n${input.goal}${base}${feedback}`,
    "",
    "Return one complete, self-contained HTML document in a single ```html code fence. Use inline CSS only. Do not include scripts, remote assets, credentials, or placeholders for work you did not perform.",
  ].join("\n").slice(0, 20_000);
}

/**
 * The judge prompt. Line-oriented for the same reason the pipeline shaping
 * prompt is: a verdict carries a list and a sentence, and asking for those
 * inside JSON invites unescaped newlines.
 */
export function loopJudgePrompt(input: { goal: string; artifact: string }) {
  return [
    "You are the VERIFICATION GATE in a self-running loop. You do not improve the work; you judge it adversarially against the definition of done.",
    "Be strict. The builder does not grade its own homework. Pass only when the work truly, fully meets the goal.",
    "",
    `DEFINITION OF DONE:\n${input.goal}`,
    "",
    `--- THE WORK TO JUDGE ---\n${input.artifact.slice(0, 12_000)}\n--- END ---`,
    "",
    "Reply in exactly this format and nothing else:",
    "PASS: <yes|no>",
    "SCORE: <0-100>",
    "SUMMARY: <one line>",
    "--- ISSUES ---",
    "<one specific fixable problem per line, each starting \"- \"; leave empty if it passes>",
  ].join("\n").slice(0, 20_000);
}

/**
 * Parses the verdict. Returns null when the judge did not answer in a readable
 * shape, so the round can be recorded as a judge failure instead of silently
 * counting as a pass.
 */
export function parseLoopVerdict(output: string): LoopVerdict | null {
  const passRaw = output.match(/^\s*PASS:\s*(yes|no|true|false)\s*$/im)?.[1]?.toLowerCase();
  if (!passRaw) return parseLoopVerdictJson(output);
  const scoreRaw = Number(output.match(/^\s*SCORE:\s*(\d{1,3})/im)?.[1]);
  const issuesBlock = output.match(/---\s*ISSUES\s*---\s*\n([\s\S]*)$/i)?.[1] ?? "";
  return {
    pass: passRaw === "yes" || passRaw === "true",
    score: Number.isFinite(scoreRaw) ? Math.min(100, Math.max(0, scoreRaw)) : 0,
    issues: issuesBlock.split("\n").map((line) => line.replace(/^\s*[-*]\s*/, "").trim()).filter(Boolean).slice(0, 8),
    summary: (output.match(/^\s*SUMMARY:\s*(.+)$/im)?.[1] ?? "").trim().slice(0, 4000),
  };
}

/** The local loop asked for JSON; keep reading it so either shape works. */
function parseLoopVerdictJson(output: string): LoopVerdict | null {
  const matches = output.match(/\{[\s\S]*?\}/g);
  if (!matches) return null;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(matches[index]) as Partial<LoopVerdict>;
      if (typeof parsed.pass === "undefined") continue;
      return {
        pass: Boolean(parsed.pass),
        score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
        issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 8) : [],
        summary: String(parsed.summary ?? "").slice(0, 4000),
      };
    } catch { /* try an earlier candidate */ }
  }
  return null;
}

/** A loop stops on a pass, on the round cap, or on a failure. */
export function loopShouldContinue(input: { round: number; maxRounds: number; passed: boolean }) {
  return !input.passed && input.round < input.maxRounds;
}

export function loopFinalStatus(input: { passed: boolean; rounds: number; maxRounds: number; stopReason?: string | null }): LoopStatus {
  if (input.passed) return "passed";
  if (input.stopReason === "budget-exhausted" || input.stopReason === "restraint" || input.stopReason === "no-progress") return "exhausted";
  return input.rounds >= input.maxRounds ? "exhausted" : "failed";
}

export function loopStatusLabel(run: LoopRun) {
  if (run.status === "queued") return "Queued for the hosted runner";
  if (run.status === "running") return `Round ${run.roundsCompleted + 1} of ${run.maxRounds}`;
  if (run.status === "passed") return `Passed at round ${run.roundsCompleted}`;
  if (run.status === "exhausted") return `Stopped at the ${run.maxRounds}-round cap`;
  if (run.status === "cancelled") return "Cancelled";
  return `Failed${run.errorCode ? `: ${run.errorCode}` : ""}`;
}

export function loopFormatMicros(micros: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(micros / 1_000_000);
}

export function loopTimeAgo(iso: string, now = Date.now()) {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function loopSchemaMissing(status: number, body?: unknown) {
  if (status === 404) return true;
  if (status !== 400 && status !== 406) return false;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return /client_loop|schema cache|PGRST205|PGRST202|does not exist/i.test(text);
}
