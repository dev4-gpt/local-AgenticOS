import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runClientVisualQaAdapter, validateClientVisualQaInput } from "../src/lib/clientVisualQaAdapter";

const worker = "workers/visual-qa/worker.py";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAF0lEQVR42mNkYPj/n4GBgYGJAAAEAQEAH0ECAwAAAABJRU5ErkJggg==", "base64");

test("visual QA worker returns a bounded report without a path or URL input", () => {
  const result = JSON.parse(execFileSync("python3", [worker], {
    input: JSON.stringify({ tenantSlug: "veloce-cloud-test", artifactId: "artifact-1", frames: [png.toString("base64")], maxFrames: 1 }),
    encoding: "utf8",
  }));
  expect(result.contractVersion).toBe("v96");
  expect(result.worker).toBe("contract-only");
  expect(result.framesSampled).toBe(1);
  expect(result.status).toBe("passed");
});

test("visual QA worker rejects oversized or malformed frames", () => {
  const result = JSON.parse(execFileSync("python3", [worker], {
    input: JSON.stringify({ tenantSlug: "veloce-cloud-test", artifactId: "artifact-1", frames: ["not-base64"], maxFrames: 1 }),
    encoding: "utf8",
  }));
  expect(result.status).toBe("failed");
  expect(result.warnings).toContain("visual_qa_frame_encoding_invalid");
  expect(readFileSync("workers/visual-qa/Dockerfile", "utf8")).toContain("USER 10001");
  const sql = readFileSync("product-experience/supabase-client-visual-qa.sql", "utf8");
  expect(sql).toContain("record_client_visual_qa_report_worker");
  expect(sql).toContain("v_report_id");
  expect(sql).not.toContain("report_id = record_id");
});

test("native Visual QA adapter enforces artifact-only input and preserves review status", () => {
  expect(validateClientVisualQaInput({
    tenantSlug: "dofgfood",
    artifactId: "not-an-uuid",
    frames: [png.toString("base64")],
    url: "https://example.com/frame.png",
  })).toEqual(expect.arrayContaining(["visual_qa_artifact_invalid", "visual_qa_external_input_rejected"]));

  const result = runClientVisualQaAdapter({
    tenantSlug: "dofgfood",
    artifactId: "00000000-0000-4000-8000-000000000001",
    frames: [png.toString("base64")],
    maxFrames: 1,
  });
  expect(result.status).toBe("passed");
  expect(result.worker).toBe("contract-only");
  expect(result.warnings).toContain("Supervision detector is not enabled in this worker image.");
  expect(runClientVisualQaAdapter({
    tenantSlug: "dofgfood",
    artifactId: "00000000-0000-4000-8000-000000000001",
    frames: ["!!!!"],
  }).status).toBe("failed");
});

test("native Visual QA adapter returns review for known fixture findings", () => {
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+9qZ9WQAAAABJRU5ErkJggg==", "base64");
  const result = runClientVisualQaAdapter({
    tenantSlug: "dofgfood",
    artifactId: "00000000-0000-4000-8000-000000000002",
    frames: [tinyPng.toString("base64")],
    maxFrames: 1,
  });
  expect(result.status).toBe("review");
  expect(result.findings[0]?.code).toBe("frame_dimensions_too_small");
});
