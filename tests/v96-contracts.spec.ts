import { expect, test } from "@playwright/test";
import {
  V96_CONTRACT_VERSION,
  isAllowedV96ResearchUrl,
  normalizeV96ResearchRecord,
  validateV96ResearchRequest,
} from "../src/lib/v96Contracts";
import { V96_AGENCY_AGENTS_REVISION, V96_CURATED_SKILL_PACK } from "../src/lib/v96SkillPack";
import { acceptV96ResearchRecord, createV96ResearchRequest } from "../src/lib/v96ResearchAdapter";

test("the curated Agency pack is a role catalog, not a tool escalation", () => {
  expect(V96_AGENCY_AGENTS_REVISION).toMatch(/^[0-9a-f]{7,40}$/);
  expect(V96_CURATED_SKILL_PACK).toHaveLength(7);
  for (const role of V96_CURATED_SKILL_PACK) {
    expect(role.sourceCommit).toBe(V96_AGENCY_AGENTS_REVISION);
    expect(role.license).toBe("MIT");
    expect(role.supportedSurfaces.length).toBeGreaterThan(0);
    expect(role.deliverable.requiredFields.length).toBeGreaterThan(0);
    expect(role.allowedTools).not.toContain("deploy");
    expect(role.allowedTools).not.toContain("send-message");
    expect(role.allowedTools).not.toContain("manage-secrets");
  }
});

test("research URLs reject credentials, private hosts, ports, and non-HTTPS schemes", () => {
  expect(isAllowedV96ResearchUrl("https://example.com/research")).toBe(true);
  expect(isAllowedV96ResearchUrl("http://example.com/research")).toBe(false);
  expect(isAllowedV96ResearchUrl("https://user:pass@example.com/research")).toBe(false);
  expect(isAllowedV96ResearchUrl("https://example.com:8443/research")).toBe(false);
  expect(isAllowedV96ResearchUrl("https://127.0.0.1/research")).toBe(false);
  expect(isAllowedV96ResearchUrl("https://metadata.google.internal/")).toBe(false);
});

test("research requests are bounded before a provider adapter runs", () => {
  expect(validateV96ResearchRequest({
    contractVersion: V96_CONTRACT_VERSION,
    tenantSlug: "veloce-cloud-test",
    provider: "scrapegraphai",
    sourceUrls: ["https://example.com"],
    fields: ["title", "summary"],
    maxPages: 4,
    maxDepth: 1,
  })).toEqual([]);

  const errors = validateV96ResearchRequest({
    contractVersion: V96_CONTRACT_VERSION,
    tenantSlug: "bad slug",
    provider: "scrapegraphai",
    sourceUrls: ["https://127.0.0.1"],
    fields: [],
    maxPages: 99,
    maxDepth: 9,
  });
  expect(errors.join(" ")).toContain("tenantSlug");
  expect(errors.join(" ")).toContain("source URL");
  expect(errors.join(" ")).toContain("fields");
  expect(errors.join(" ")).toContain("maxPages");
  expect(errors.join(" ")).toContain("maxDepth");
});

test("structured research records require tenant scope and citation evidence", () => {
  const base = {
    contractVersion: V96_CONTRACT_VERSION as const,
    id: "record-1",
    tenantSlug: "veloce-cloud-test",
    provider: "scrapegraphai" as const,
    sourceUrl: "https://example.com/research",
    retrievedAt: "2026-08-10T00:00:00.000Z",
    fields: { title: "Example" },
    citations: [{ url: "https://example.com/research", retrievedAt: "2026-08-10T00:00:00.000Z", evidence: "A bounded claim." }],
    confidence: 1.4,
    status: "complete" as const,
  };
  expect(normalizeV96ResearchRecord(base)?.confidence).toBe(1);
  expect(normalizeV96ResearchRecord({ ...base, citations: [] })).toBeNull();
  expect(normalizeV96ResearchRecord({ ...base, sourceUrl: "https://localhost/private" })).toBeNull();
  expect(normalizeV96ResearchRecord({ ...base, status: "failed", citations: [], failureReason: "provider_timeout" })).not.toBeNull();
});

test("the research adapter keeps provider output inside the requested origin and tenant", () => {
  const request = createV96ResearchRequest({
    tenantSlug: "veloce-cloud-test",
    provider: "scrapegraphai",
    sourceUrls: ["https://example.com/research"],
    fields: ["title"],
    maxPages: 2,
    maxDepth: 0,
  });
  const record = {
    contractVersion: V96_CONTRACT_VERSION as const,
    id: "record-2",
    tenantSlug: request.tenantSlug,
    provider: request.provider,
    sourceUrl: "https://example.com/research/item",
    retrievedAt: "2026-08-10T00:00:00.000Z",
    fields: { title: "Example" },
    citations: [{ url: "https://example.com/research/item", retrievedAt: "2026-08-10T00:00:00.000Z", evidence: "A bounded claim." }],
    confidence: 0.8,
    status: "complete" as const,
  };
  expect(acceptV96ResearchRecord(request, record).tenantSlug).toBe(request.tenantSlug);
  expect(() => acceptV96ResearchRecord(request, { ...record, tenantSlug: "another-tenant" })).toThrow(/tenant scope/);
  expect(() => acceptV96ResearchRecord(request, { ...record, citations: [{ ...record.citations[0], url: "https://other.example/evidence" }] })).toThrow(/allowlist/);
});
