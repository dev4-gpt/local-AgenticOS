import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { V96_CURATED_SKILL_PACK } from "../src/lib/v96SkillPack";
import { V96_PERMITTED_SKILL_TOOLS, validateV96SkillManifest } from "../src/lib/v96Contracts";
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
  expect(V96_CURATED_SKILL_PACK.length).toBeGreaterThanOrEqual(5);
  for (const role of V96_CURATED_SKILL_PACK) {
    expect(role.sourceRepository, role.id).toMatch(/^https:\/\//);
    expect(role.sourceCommit.length, role.id).toBeGreaterThan(4);
    expect(role.license.length, role.id).toBeGreaterThan(0);
    expect(role.allowedContext.length, role.id).toBeGreaterThan(0);
    expect(role.allowedTools.length, role.id).toBeGreaterThan(0);
    expect(role.deliverable.requiredFields.length, role.id).toBeGreaterThan(0);
    expect(["none", "review-before-apply", "human-before-external-action"], role.id).toContain(role.approval);
  }
});

test("importing a role never widens what the platform can do", () => {
  // The plan's exit gate for the skill pack: a role improves a task *without
  // increasing tool permissions*. Every curated role must therefore draw only
  // on the closed vocabulary. Before this, allowedTools was free text and the
  // only assertion was that it had a non-zero length.
  for (const role of V96_CURATED_SKILL_PACK) {
    expect(validateV96SkillManifest(role), `${role.id} is unpublishable`).toEqual([]);
  }
});

test("the permitted tool vocabulary grants no execution, egress or credential access", () => {
  // A guard on the guard. If someone adds a verb to the vocabulary, it should
  // be because they argued for it -- not because it arrived attached to a role.
  for (const tool of V96_PERMITTED_SKILL_TOOLS) {
    expect(tool, `${tool} is not a read, test-run or write-deliverable verb`)
      .toMatch(/^(read-|write-)|^run-tests$/);
  }
  for (const forbidden of ["execute", "shell", "exec", "credential", "secret", "token", "delete", "deploy", "fetch", "http"]) {
    expect(V96_PERMITTED_SKILL_TOOLS.join(" "), `vocabulary must not grant ${forbidden}`)
      .not.toContain(forbidden);
  }
});

test("a role claiming an unpermitted tool is rejected, not published", () => {
  const rogue = { ...V96_CURATED_SKILL_PACK[0], id: "rogue", allowedTools: ["execute-shell"] };
  expect(validateV96SkillManifest(rogue)).toContain("tool is outside the permitted vocabulary: execute-shell");

  const unreachable = { ...V96_CURATED_SKILL_PACK[0], id: "unreachable", supportedSurfaces: ["not-a-surface"] };
  expect(validateV96SkillManifest(unreachable)).toContain("surface is not a real Veloce surface: not-a-surface");

  // Provenance is what makes a role auditable. A role without it is not a
  // reviewed contract, whatever else it carries.
  const unsourced = { ...V96_CURATED_SKILL_PACK[0], id: "unsourced", sourceCommit: "" };
  expect(validateV96SkillManifest(unsourced)).toContain("sourceCommit must be a pinned revision");
});

test("the published route filters unsound roles as well as operator-only ones", () => {
  const route = readFileSync("src/app/api/client-runtime/skills/route.ts", "utf8");
  expect(route).toContain("validateV96SkillManifest(role).length === 0");
});

test("role ids are unique, so a client cannot be shown two roles under one id", () => {
  const ids = V96_CURATED_SKILL_PACK.map((role) => role.id);
  expect(new Set(ids).size, `duplicate role id in ${ids.join(", ")}`).toBe(ids.length);
});

test("publishing the pack requires nothing new from the cloud manifest", () => {
  // The other half of the exit gate: importing roles must not change the cloud
  // manifest. Roles reach an approved provider through the existing model lane
  // and carry no provider or capability of their own, so there is nothing for a
  // manifest to grant. Assert the shape stays that way.
  for (const role of V96_CURATED_SKILL_PACK) {
    expect(["local", "approved-provider"], role.id).toContain(role.modelLane);
    expect(Object.keys(role), `${role.id} gained a field the manifest would have to satisfy`)
      .not.toContain("provider");
    expect(Object.keys(role), role.id).not.toContain("capability");
  }
});

test("operator-only roles are not published to clients", () => {
  // The pack legitimately contains a local-lane role (minimal-change). A tenant
  // has no local model, so offering it to a client would be a control that
  // cannot run. The route filters rather than the pack dropping it.
  const local = V96_CURATED_SKILL_PACK.filter((role) => role.modelLane === "local");
  expect(local.length, "the pack still carries operator-only roles").toBeGreaterThan(0);

  const route = readFileSync("src/app/api/client-runtime/skills/route.ts", "utf8");
  expect(route).toContain('role.modelLane === "approved-provider"');
});
