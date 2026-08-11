import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { formatMicros } from "../src/components/ClientSpendMeter";

// The client API allowlist lives in three places, and the one that actually
// ships is the hardcoded value in provision-gcp-client.mjs, which overrides the
// in-repo default at deploy time. A route added to the code but not to that
// script is blocked by the proxy after deploy even though the code is correct.
// This drifted before: the local runner was missing the executions route while
// the deployed one had it, so a lane worked in the cloud and 404'd locally.

function apiRoutes(path: string): Set<string> {
  const source = readFileSync(path, "utf8");
  return new Set([...source.matchAll(/\/api\/(?:client-runtime|internal\/client-runtime|client-auth|capabilities)[a-z0-9/-]*/g)].map((match) => match[0]));
}

const policy = apiRoutes("src/lib/clientRuntimePolicy.ts");
const deployed = apiRoutes("scripts/provision-gcp-client.mjs");
const local = apiRoutes("scripts/run-client-runtime-local.mjs");

test("every client API route in the policy also ships in the deploy script", () => {
  const missing = [...policy].filter((route) => !deployed.has(route));
  expect(missing, "routes the proxy would block after deploy").toEqual([]);
});

test("the local runner allows the same client API routes as the deployed one", () => {
  // Only client-facing routes need to match; internal worker routes are
  // dispatched differently off Cloud Run.
  const clientFacing = (set: Set<string>) => [...set].filter((route) => !route.startsWith("/api/internal/"));
  const missing = clientFacing(deployed).filter((route) => !local.has(route));
  expect(missing, "routes that would 404 locally but work deployed").toEqual([]);
});

test("the notebooks route is allowlisted everywhere it has to be", () => {
  for (const [name, set] of [["policy", policy], ["deploy script", deployed], ["local runner", local]] as const) {
    expect(set.has("/api/client-runtime/notebooks"), `${name} is missing the notebooks route`).toBe(true);
  }
});

test("the Hermes content-factory route is allowlisted everywhere it has to be", () => {
  for (const [name, set] of [["policy", policy], ["deploy script", deployed], ["local runner", local]] as const) {
    expect(set.has("/api/client-runtime/hermes-content-factory"), `${name} is missing the Hermes content-factory route`).toBe(true);
  }
});

test("the spend meter is present on every surface that spends a provider key", () => {
  // The keys are the client's own, so a surface that can charge them must show
  // what it has charged. A missing meter is the surface that surprises someone.
  for (const file of [
    "ClientSeoWorkspace", "ClientDeepWorkspace", "ClientRadarWorkspace",
    "ClientVideoWorkspace", "ClientStudioWorkspace",
  ]) {
    const source = readFileSync(`src/components/${file}.tsx`, "utf8");
    expect(source, `${file} should render the spend meter`).toContain("<ClientSpendMeter />");
  }
});

test("small spends never render as free", () => {
  // Rounding a real charge to $0.00 leaves exactly the wrong impression.
  expect(formatMicros(0)).toBe("$0.00");
  expect(formatMicros(1_000)).toBe("<$0.01");
  expect(formatMicros(9_999)).toBe("<$0.01");
  expect(formatMicros(40_000)).toBe("$0.04");
  expect(formatMicros(100_000)).toBe("$0.10");
  expect(formatMicros(1_000_000)).toBe("$1.00");
});

test("the budget route is allowlisted everywhere it has to be", () => {
  for (const path of [
    "src/lib/clientRuntimePolicy.ts",
    "scripts/provision-gcp-client.mjs",
    "scripts/run-client-runtime-local.mjs",
  ]) {
    expect(readFileSync(path, "utf8"), `${path}`).toContain("/api/client-runtime/budget");
  }
});
