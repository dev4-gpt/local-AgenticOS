import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("managed OpenRouter cloud verifier enforces the private paid-key boundary", () => {
  const verifier = readFileSync(resolve(process.cwd(), "scripts/verify-managed-openrouter-cloud.mjs"), "utf8");

  expect(verifier).toContain('image.includes("@sha256:")');
  expect(verifier).toContain("rolesForMember(projectIam, runtimeMember)");
  expect(verifier).toContain("projectRoles.length === 0");
  expect(verifier).toContain("OPENROUTER_API_KEY, openRouterSecret");
  expect(verifier).toContain("CONTROL_PLANE_OPERATOR_SECRET, operatorSecret");
  expect(verifier).toContain('env.OPENROUTER_VIDEO_GENERATION_ENABLED?.value !== "1"');
  expect(verifier).toContain("OPENROUTER_MODEL_ALLOWLIST");
  expect(verifier).toContain("configuredModels.length > 0");
  expect(verifier).toContain("invokers.length === 1");
  expect(verifier).toContain('["allUsers", "allAuthenticatedUsers"]');
  expect(verifier).toContain("openRouterAccessors.length === 1");
  expect(verifier).toContain("`${audience}/readyz`");
  expect(verifier).not.toContain('secrets", "versions", "access"');
});
