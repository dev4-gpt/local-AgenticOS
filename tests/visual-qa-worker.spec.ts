import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

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
