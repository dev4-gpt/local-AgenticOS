import { expect, test } from "@playwright/test";
import { compileContextArtifact, validateContextCompileRequest } from "../src/lib/contextCompiler";
import { applyOutputQualityPolicy } from "../src/lib/outputQualityPolicy";

test("context compiler preserves provenance and requires review activation", () => {
  const result = compileContextArtifact({
    contractVersion: "v96",
    tenantSlug: "veloce-cloud-test",
    sourceArtifactId: "artifact-1",
    sourceText: "# Architecture\n\nUse a bounded worker.\n\n# Review\n\nApprove before activation.",
    sourceHash: "a".repeat(64),
    license: "MIT",
    provenance: "tenant-upload",
    compilerVersion: "v96-context-1",
    maxChunkChars: 500,
  });
  expect(result.chunks.length).toBeGreaterThan(0);
  expect(result.skillManifest.activation).toBe("review_required");
  expect(result.skillManifest.allowedTools).not.toContain("execute-shell");
  expect(result.chunks[0].sourceArtifactId).toBe("artifact-1");
});

test("context compiler rejects missing provenance and oversized chunks", () => {
  const errors = validateContextCompileRequest({ contractVersion: "v96", tenantSlug: "veloce-cloud-test", sourceArtifactId: "a", sourceText: "x", sourceHash: "bad", license: "", provenance: "", compilerVersion: "", maxChunkChars: 50 });
  expect(errors.join(" ")).toContain("sourceHash");
  expect(errors.join(" ")).toContain("license");
  expect(errors.join(" ")).toContain("provenance");
  expect(errors.join(" ")).toContain("maxChunkChars");
});

test("quality policy is transparent, preserves code, and supports opt-out", () => {
  const input = "It is important to note that this is a test.\n\n```ts\nconst value = 1;\n```\n\nhttps://example.com";
  const result = applyOutputQualityPolicy(input);
  expect(result.report.changed).toBe(true);
  expect(result.output).toContain("const value = 1;");
  expect(result.output).toContain("https://example.com");
  expect(result.report.findings.some((finding) => finding.code === "meta-filler")).toBe(true);
  expect(applyOutputQualityPolicy(input, { optOut: true }).output).toBe(input);
});
