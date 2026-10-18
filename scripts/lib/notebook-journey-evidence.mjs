import { createHash } from "node:crypto";

export const NOTEBOOK_JOURNEY_SERVER_ENV = Object.freeze({
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  VELOCE_CLIENT_EDITION: "1",
  CLIENT_RUNTIME_ENFORCE_AUTH: "1",
  CLIENT_PROVIDER_CALLS_ENABLED: "0",
  CLIENT_ALLOWED_ROUTES: "/,/notebook",
  CLIENT_ENABLED_CAPABILITIES: "tenant-data,artifacts,notebook,orchestration,text-agents",
  AGENTIC_OS_DISABLE_LOCAL_CLI: "1",
  AGENTIC_OS_DISABLE_LOCAL_FILES: "1",
  AGENTIC_OS_REQUIRE_APPROVALS: "1",
});

export const NOTEBOOK_JOURNEY_SCENARIOS = Object.freeze([
  "cited-draft",
  "citations-outside-file",
  "source-changed",
  "budget-denied",
  "budget-settlement",
  "completion-write",
]);

export const NOTEBOOK_JOURNEY_EVIDENCE_CONFIG = Object.freeze({
  serverEnvironment: NOTEBOOK_JOURNEY_SERVER_ENV,
  testPortPolicy: "isolated-loopback-only",
  browserOriginPolicy: "abort-every-origin-except-isolated-loopback",
  identity: "synthetic-sign-in-and-cookie",
  dataPlane: "synthetic-records-queue-storage-budget-and-provider-adapter",
  providerCalls: "fixture-only-no-external-provider-request",
  artifactReview: "preview-is-not-approval-explicit-durable-requester-decision-bound-to-sha256",
  artifactPublication: "durable-success-exact-artifact-and-citation-audit-required-before-review-and-export",
  scenarios: NOTEBOOK_JOURNEY_SCENARIOS,
});

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function notebookJourneyBrowserChannel(value) {
  const channel = value || "bundled-chromium";
  if (!["bundled-chromium", "chrome", "msedge"].includes(channel)) throw new Error("journey_browser_channel_invalid");
  return channel;
}

export function collectNotebookJourneyResults(report) {
  const found = new Map();
  const browserVersions = new Set();
  let unexpectedTest = false;
  function visit(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        const id = NOTEBOOK_JOURNEY_SCENARIOS.find((value) => spec.title === `browser plus real handlers: ${value}`);
        if (!id || !/(?:^|[/\\])client-notebook-handler-browser\.spec\.ts$/.test(spec.file ?? "")) {
          unexpectedTest = true;
          continue;
        }
        const tests = Array.isArray(spec.tests) ? spec.tests : [];
        const entry = tests[0];
        const attempt = entry?.results?.[0];
        const versionAnnotations = attempt?.annotations?.filter((item) => item.type === "notebook-browser-version") ?? [];
        const passed = tests.length === 1 && entry.expectedStatus === "passed" && entry.status === "expected"
          && entry.results.length === 1 && attempt.status === "passed" && attempt.retry === 0
          && Number.isFinite(attempt.duration) && attempt.duration >= 0 && versionAnnotations.length === 1
          && /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(versionAnnotations[0].description ?? "");
        if (passed) browserVersions.add(versionAnnotations[0].description);
        found.set(id, { id, status: passed && !found.has(id) ? "passed" : "failed", durationMs: Number.isFinite(attempt?.duration) ? attempt.duration : 0 });
      }
      visit(suite.suites);
    }
  }
  visit(report?.suites);
  const scenarios = NOTEBOOK_JOURNEY_SCENARIOS.map((id) => found.get(id) ?? { id, status: "notRun", durationMs: 0 });
  const passed = !unexpectedTest && scenarios.every((item) => item.status === "passed") && browserVersions.size === 1
    && report?.stats?.expected === NOTEBOOK_JOURNEY_SCENARIOS.length
    && report.stats.unexpected === 0 && report.stats.skipped === 0 && report.stats.flaky === 0
    && Array.isArray(report.errors) && report.errors.length === 0;
  return { scenarios, passed, browserVersion: browserVersions.size === 1 ? [...browserVersions][0] : null };
}

export function buildNotebookJourneyReceipt({ sourceCommit, sourceCommitAfter, candidateFingerprint, candidateFingerprintAfter, scenarios, startedAt, checkedAt, testPort, browserChannel, runtime = null, runnerStatus = "incomplete" }) {
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit ?? "")) throw new Error("journey_source_commit_invalid");
  if (!/^[0-9a-f]{64}$/i.test(candidateFingerprint ?? "")) throw new Error("journey_candidate_fingerprint_invalid");
  if (!Array.isArray(scenarios)) throw new Error("journey_scenarios_invalid");
  if (!Number.isFinite(Date.parse(checkedAt ?? ""))) throw new Error("journey_checked_at_invalid");

  const results = scenarios.map(({ id, status, durationMs }) => ({ id, status, durationMs }));
  const ids = results.map(({ id }) => id);
  const complete = ids.length === NOTEBOOK_JOURNEY_SCENARIOS.length
    && new Set(ids).size === ids.length
    && NOTEBOOK_JOURNEY_SCENARIOS.every((id) => ids.includes(id));
  const stableCandidate = candidateFingerprintAfter === candidateFingerprint && sourceCommitAfter === sourceCommit;
  const allPassed = complete && results.every(({ status, durationMs }) => status === "passed" && Number.isFinite(durationMs) && durationMs >= 0)
    && runnerStatus === "passed" && stableCandidate && validRuntime(runtime);
  const hasFailure = ["failed", "timedout", "interrupted"].includes(runnerStatus)
    || ((candidateFingerprintAfter != null || sourceCommitAfter != null) && !stableCandidate)
    || results.some(({ status }) => status === "failed" || status === "timedOut" || status === "interrupted");
  const resolvedTestPort = String(testPort ?? process.env.CLIENT_RUNTIME_TEST_PORT ?? "3941");
  if (!/^\d{1,5}$/.test(resolvedTestPort) || Number(resolvedTestPort) < 1024 || Number(resolvedTestPort) > 65535) throw new Error("journey_test_port_invalid");
  const testConfig = { ...NOTEBOOK_JOURNEY_EVIDENCE_CONFIG, testPort: resolvedTestPort, browserChannel: notebookJourneyBrowserChannel(browserChannel) };

  return {
    schemaVersion: 2,
    ...(Number.isFinite(Date.parse(startedAt ?? "")) ? { startedAt } : {}),
    checkedAt,
    sourceCommit: sourceCommit.toLowerCase(),
    sourceCommitAfter: sourceCommitAfter ?? null,
    candidateFingerprintSchema: "agentos-working-tree-v1",
    candidateFingerprintSha256: candidateFingerprint.toLowerCase(),
    candidateFingerprintAfterSha256: candidateFingerprintAfter ?? null,
    testConfigFingerprintSha256: sha256(canonicalJson({ testConfig, runtime })),
    testConfig,
    runtime,
    runnerStatus,
    result: allPassed ? "passed" : hasFailure ? "failed" : "incomplete",
    expectedScenarios: NOTEBOOK_JOURNEY_SCENARIOS,
    scenarios: results,
    limitations: [
      "Authentication, records, queue, storage, budget, and provider adapter are synthetic fixtures.",
      "The run does not prove hosted identity, Supabase RLS, production storage, provider quality, or customer acceptance.",
    ],
  };
}

export function validNotebookJourneyReceipt(receipt, expectedCommit, expectedFingerprint) {
  const { testPort, browserChannel, ...baseTestConfig } = receipt?.testConfig ?? {};
  if (!receipt || receipt.schemaVersion !== 2 || receipt.result !== "passed" || receipt.runnerStatus !== "passed"
    || receipt.sourceCommit !== expectedCommit
    || receipt.sourceCommitAfter !== expectedCommit
    || receipt.candidateFingerprintSchema !== "agentos-working-tree-v1"
    || receipt.candidateFingerprintSha256 !== expectedFingerprint
    || receipt.candidateFingerprintAfterSha256 !== expectedFingerprint
    || !/^[0-9a-f]{64}$/i.test(expectedFingerprint ?? "")
    || !validTimestamp(receipt.checkedAt)
    || (receipt.startedAt !== undefined && !validTimestamp(receipt.startedAt))
    || (receipt.startedAt !== undefined && Date.parse(receipt.startedAt) > Date.parse(receipt.checkedAt))
    || !validRuntime(receipt.runtime)
    || !Array.isArray(receipt.expectedScenarios)
    || receipt.expectedScenarios.length !== NOTEBOOK_JOURNEY_SCENARIOS.length
    || !NOTEBOOK_JOURNEY_SCENARIOS.every((id, index) => receipt.expectedScenarios[index] === id)
    || !Array.isArray(receipt.scenarios) || receipt.scenarios.length !== NOTEBOOK_JOURNEY_SCENARIOS.length
    || !receipt.scenarios.every((scenario, index) => scenario?.id === NOTEBOOK_JOURNEY_SCENARIOS[index]
      && scenario.status === "passed" && Number.isFinite(scenario.durationMs) && scenario.durationMs >= 0)
    || canonicalJson(baseTestConfig) !== canonicalJson(NOTEBOOK_JOURNEY_EVIDENCE_CONFIG)
    || !/^\d{1,5}$/.test(String(testPort ?? "")) || Number(testPort) < 1024 || Number(testPort) > 65535
    || !["bundled-chromium", "chrome", "msedge"].includes(browserChannel)
    || sha256(canonicalJson({ testConfig: receipt.testConfig, runtime: receipt.runtime })) !== receipt.testConfigFingerprintSha256) return false;
  return true;
}

function validRuntime(runtime) {
  return runtime?.browserName === "chromium"
    && /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(runtime.browserVersion ?? "")
    && /^\d+\.\d+\.\d+$/.test(runtime.playwrightVersion ?? "")
    && /^v(?:22|23|24|25)\.\d+\.\d+$/.test(runtime.nodeVersion ?? "")
    && ["darwin", "linux", "win32"].includes(runtime.platform)
    && ["arm64", "x64"].includes(runtime.arch);
}

function validTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}
