import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { V90_CURATED_SKILL_PACK } from "../src/lib/v90SkillPack";
import { isStudioSurface } from "../src/lib/clientStudioSurfaces";
import type { ClientWorkspaceSurface } from "../src/lib/clientWorkspaceExecution";

test("integrations has exactly one hosted implementation", () => {
  expect(isStudioSurface("integrations" as ClientWorkspaceSurface)).toBe(false);
  expect(readFileSync("src/components/Shell.tsx", "utf8")).toContain("<ClientIntegrationsWorkspace />");
});

test("the client skills route is read-only and separate from the operator hub", () => {
  const route = readFileSync("src/app/api/client-runtime/skills/route.ts", "utf8");
  // /api/integrations also writes credentials into the operator's config file,
  // so the client must never reach it. This route exposes contracts only.
  expect(route).toContain("export async function GET");
  expect(route).not.toContain("export async function POST");
  expect(route).not.toContain("saveIntegration");
  expect(route).not.toContain("integrationOverview");
});

test("the operator integrations route stays out of the client allowlist", () => {
  const policy = readFileSync("src/lib/clientRuntimePolicy.ts", "utf8");
  expect(policy).toContain("/api/client-runtime/skills");
  expect(policy).not.toContain('"/api/integrations"');
});

test("the skills route is allowlisted in all three places", () => {
  for (const path of [
    "src/lib/clientRuntimePolicy.ts",
    "scripts/provision-gcp-client.mjs",
    "scripts/run-client-runtime-local.mjs",
  ]) {
    expect(readFileSync(path, "utf8"), path).toContain("/api/client-runtime/skills");
  }
});

test("every published role carries its provenance and its boundary", () => {
  // A role a client cannot audit is a role they have to take on trust.
  expect(V90_CURATED_SKILL_PACK.length).toBeGreaterThanOrEqual(5);
  for (const role of V90_CURATED_SKILL_PACK) {
    expect(role.sourceRepository, role.id).toMatch(/^https:\/\//);
    expect(role.sourceCommit.length, role.id).toBeGreaterThan(4);
    expect(role.license.length, role.id).toBeGreaterThan(0);
    expect(role.allowedContext.length, role.id).toBeGreaterThan(0);
    expect(role.allowedTools.length, role.id).toBeGreaterThan(0);
    expect(role.deliverable.requiredFields.length, role.id).toBeGreaterThan(0);
    expect(["none", "review-before-apply", "human-before-external-action"], role.id).toContain(role.approval);
  }
});

test("operator-only roles are not published to clients", () => {
  // The pack legitimately contains a local-lane role (minimal-change). A tenant
  // has no local model, so offering it to a client would be a control that
  // cannot run. The route filters rather than the pack dropping it.
  const local = V90_CURATED_SKILL_PACK.filter((role) => role.modelLane === "local");
  expect(local.length, "the pack still carries operator-only roles").toBeGreaterThan(0);

  const route = readFileSync("src/app/api/client-runtime/skills/route.ts", "utf8");
  expect(route).toContain('role.modelLane === "approved-provider"');
});
