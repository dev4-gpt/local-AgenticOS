import { expect, test } from "@playwright/test";
import { WORKSPACE_ARTIFACT_INTENTS, isWorkspaceArtifactIntent, workspacePrompt, artifactFromWorkspaceOutput } from "../src/lib/clientWorkspaceExecution";

const base = { surface: "radar" as const, title: "T", goal: "Write a thread about annual billing." };

test("three intents exist and unknown values are rejected", () => {
  expect(WORKSPACE_ARTIFACT_INTENTS).toEqual(["preview", "brief", "copy"]);
  expect(isWorkspaceArtifactIntent("copy")).toBe(true);
  expect(isWorkspaceArtifactIntent("essay")).toBe(false);
});

test("copy asks for the piece itself, brief asks for a plan about it", () => {
  // Radar asked for a thread under `brief` and received a document titled
  // "Content Brief: ..." - a plan about the post rather than the post.
  const copy = workspacePrompt({ ...base, artifactIntent: "copy" });
  const brief = workspacePrompt({ ...base, artifactIntent: "brief" });
  expect(copy).toContain("the words as they would be published");
  expect(copy).toContain("not a plan or a brief describing them");
  expect(copy).not.toContain("implementation brief");
  expect(brief).toContain("implementation brief");
});

test("the format instruction still comes after the goal, which is why intent must be explicit", () => {
  const prompt = workspacePrompt({ ...base, artifactIntent: "copy" });
  expect(prompt.indexOf(base.goal)).toBeLessThan(prompt.indexOf("the words as they would be published"));
});

test("copy produces a markdown artifact, not html", () => {
  const artifact = artifactFromWorkspaceOutput({
    surface: "radar", title: "Thread", artifactIntent: "copy",
    output: "```markdown\nAnnual billing is now table stakes.\n```",
  });
  expect(artifact?.contentType).toBe("text/markdown");
  expect(artifact?.fileName.endsWith(".md")).toBe(true);
});

test("copy never renders as html even if the model returns a document", () => {
  // The worker used to collapse anything that was not "brief" into "preview".
  const artifact = artifactFromWorkspaceOutput({
    surface: "radar", title: "Thread", artifactIntent: "copy",
    output: "```html\n<!doctype html><html><body>no</body></html>\n```",
  });
  // An html fence is not a markdown fence, so this yields nothing rather than
  // silently shipping a rendered page from a copy surface.
  expect(artifact).toBeNull();
});
