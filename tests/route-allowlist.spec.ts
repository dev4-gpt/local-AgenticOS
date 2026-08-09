import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

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
