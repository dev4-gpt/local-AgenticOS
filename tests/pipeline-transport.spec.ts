import { test, expect } from "@playwright/test";
import { localPipelineArtifactUrl, localPipelineItem, pipelineRequest } from "../src/lib/pipelineTransport";

test("local storage translates into the common pipeline contract", () => {
  expect(localPipelineItem({ slug: "launch", title: "Launch", idea: "Test demand", stage: "review", created: "2026-09-21", buildFile: "launch/index.html" })).toMatchObject({
    id: "launch", stage: "review", buildArtifactId: "launch/index.html", executionState: null, tags: [], pinned: false,
  });
});

test("local decisions preserve approval semantics and identifiers", () => {
  for (const decision of ["approve", "reject"]) {
    const request = pipelineRequest("local", { method: "PATCH", body: JSON.stringify({ id: "launch", decision }) });
    expect(request.url).toBe("/api/pipeline/decide");
    expect(request.init.method).toBe("POST");
    expect(JSON.parse(String(request.init.body))).toMatchObject({ slug: "launch", approve: decision === "approve" });
  }
  const deletion = pipelineRequest("local", { method: "DELETE" }, "?id=launch");
  expect(deletion.url).toBe("/api/pipeline/delete");
  expect(JSON.parse(String(deletion.init.body)).slug).toBe("launch");
});

test("cloud requests keep the tenant endpoint and payload", () => {
  const init = { method: "PATCH", body: JSON.stringify({ id: "tenant-uuid", decision: "approve" }) };
  expect(pipelineRequest("cloud", init)).toEqual({ url: "/api/client-runtime/pipeline", init });
});

test("artifact paths cannot escape the local build project", () => {
  expect(localPipelineArtifactUrl("launch page/index.html")).toBe("/api/freeclaude/preview/free-claude-code/launch%20page/index.html");
  for (const file of ["../secret", "/secret", "a/../../secret", "a\\secret"]) expect(() => localPipelineArtifactUrl(file)).toThrow();
});
