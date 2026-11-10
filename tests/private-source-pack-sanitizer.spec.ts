import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { sanitizePrivateSourcePack } from "../scripts/sanitize-private-source-pack.mjs";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

test("private source sanitizer preserves sources and omits only unsafe link targets", () => {
  const contents = JSON.stringify({
    sources: [{
      title: "Lesson",
      url: "https://www.skool.com/example/lesson",
      text: "Keep the full reviewed lesson text, including code examples.",
      links: [
        { url: "https://example.org/reference", text: "Public link" },
        { url: "http://127.0.0.1/admin", text: "Loopback link" },
        { url: "https://service.internal/", text: "Private network link" },
        { url: "https://example.org/file?X-Goog-Signature=secret", text: "Signed link" },
      ],
    }],
    skipped: [],
  });
  const result = sanitizePrivateSourcePack({
    coverage: { importedSourceSegments: 1, importedLinks: 4, skippedReferences: 0, completeCommunityExport: false, discoveredQueueExhausted: false },
    batches: [{ file: "batch.json", sha256: hash(contents) }],
  }, () => contents);
  expect(result.omittedLinks).toBe(3);
  expect(result.skippedCount).toBe(1);
  expect(result.coverage).toMatchObject({ importedSourceSegments: 1, importedLinks: 1, skippedReferences: 3, completeCommunityExport: false });
  expect(result.batches[0].pack.sources[0]).toMatchObject({
    text: "Keep the full reviewed lesson text, including code examples.",
    links: [{ url: "https://example.org/reference", text: "Public link" }],
  });
  expect(result.securityReview).toMatchObject({ sourceTextPreserved: true, completeCommunityExport: false });
});

test("private source sanitizer refuses stale batch hashes and inconsistent link counts", () => {
  const contents = JSON.stringify({ sources: [{ links: [] }] });
  const manifest = { coverage: { importedLinks: 0 }, batches: [{ file: "batch.json", sha256: "0".repeat(64) }] };
  expect(() => sanitizePrivateSourcePack(manifest, () => contents)).toThrow("source_batch_hash_mismatch");
  manifest.batches[0].sha256 = hash(contents);
  manifest.coverage.importedLinks = 1;
  expect(() => sanitizePrivateSourcePack(manifest, () => contents)).toThrow("source_manifest_coverage_mismatch");
});
