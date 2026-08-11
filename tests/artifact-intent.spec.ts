import { expect, test } from "@playwright/test";
import { WORKSPACE_ARTIFACT_INTENTS, isWorkspaceArtifactIntent, workspacePrompt, artifactFromWorkspaceOutput } from "../src/lib/clientWorkspaceExecution";
import { serializeClientReviewedPlan, parseClientReviewedPlan } from "../src/lib/clientProviderContracts";

const base = { surface: "radar" as const, title: "T", goal: "Write a thread about annual billing." };

const PLAN = {
  summary: "Ship annual billing to existing monthly accounts.",
  steps: [
    { title: "Audit current plan records", owner: "Billing", rationale: "Migration needs a clean starting state." },
    { title: "Draft the upgrade prompt" },
  ],
};

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

test("a reviewed plan becomes a markdown artifact instead of failing the job", () => {
  // Providers with toolMode "reviewed-plan" get a FORCED tool choice, so the
  // model cannot return prose and its output carries no fenced block. Before
  // this branch, extractFence found nothing and every workspace execution on
  // openclaw, hermes, fusion and antigravity failed workspace_artifact_invalid
  // -- after the provider had already been billed.
  const output = serializeClientReviewedPlan(PLAN);
  expect(output).not.toBeNull();
  const artifact = artifactFromWorkspaceOutput({ surface: "guide", title: "Billing", artifactIntent: "brief", output: output! });
  const text = artifact?.bytes.toString("utf8") ?? "";

  expect(artifact?.contentType).toBe("text/markdown");
  expect(artifact?.fileName.endsWith(".md")).toBe(true);
  expect(text).toContain(PLAN.summary);
  for (const step of PLAN.steps) expect(text, step.title).toContain(step.title);
  expect(text).toContain("Owner: Billing");
});

test("the artifact keeps the approval marker, so a proposal cannot read as finished work", () => {
  // Once the JSON envelope is discarded this line is the only remaining trace
  // that a human still has to approve this.
  const output = serializeClientReviewedPlan(PLAN)!;
  const text = artifactFromWorkspaceOutput({ surface: "guide", title: "Billing", artifactIntent: "brief", output })!.bytes.toString("utf8");
  expect(text).toContain("Human approval required");
  expect(text).toContain("not completed work");
});

test("preview intent downgrades to markdown and records the downgrade", () => {
  // A plan is structured data with no HTML, so it cannot satisfy the preview
  // contract. It must not be dressed up as a rendered page the model never
  // produced -- the preview pane stays empty and the job says why.
  const output = serializeClientReviewedPlan(PLAN)!;
  const artifact = artifactFromWorkspaceOutput({ surface: "paperclip", title: "Billing", artifactIntent: "preview", output });
  expect(artifact?.contentType).toBe("text/markdown");
  expect(artifact?.previewHtml).toBeUndefined();
  expect(artifact?.downgradedFrom).toBe("preview");
});

test("withheld or malformed provider output fails closed rather than throwing", () => {
  // safeClientProviderOutput runs BEFORE the artifact step and may replace the
  // output wholesale with a notice that is not JSON at all.
  const withheld = "[Provider output withheld because it matched secret-like content.]";
  expect(parseClientReviewedPlan(withheld)).toBeNull();
  expect(artifactFromWorkspaceOutput({ surface: "guide", title: "T", artifactIntent: "brief", output: withheld })).toBeNull();

  expect(parseClientReviewedPlan("{ not json")).toBeNull();
  expect(parseClientReviewedPlan(JSON.stringify({ type: "reviewed_plan", tool: "something_else", plan: PLAN }))).toBeNull();
  // Right envelope, unusable plan: a step with no title cannot be normalised.
  expect(parseClientReviewedPlan(JSON.stringify({ type: "reviewed_plan", tool: "propose_reviewed_plan", plan: { summary: "s", steps: [{}] } }))).toBeNull();
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
