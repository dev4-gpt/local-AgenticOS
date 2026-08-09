import { expect, test } from "@playwright/test";
import {
  V90_CONTRACT_VERSION,
  isAllowedV90ResearchUrl,
  normalizeV90ResearchRecord,
  validateV90ResearchRequest,
} from "../src/lib/v90Contracts";
import { V90_AGENCY_AGENTS_REVISION, V90_CURATED_SKILL_PACK } from "../src/lib/v90SkillPack";
import { acceptV90ResearchRecord, createV90ResearchRequest } from "../src/lib/v90ResearchAdapter";

test("the curated Agency pack is a role catalog, not a tool escalation", () => {
  expect(V90_AGENCY_AGENTS_REVISION).toMatch(/^[0-9a-f]{7,40}$/);
  expect(V90_CURATED_SKILL_PACK).toHaveLength(7);
  for (const role of V90_CURATED_SKILL_PACK) {
    expect(role.sourceCommit).toBe(V90_AGENCY_AGENTS_REVISION);
    expect(role.license).toBe("MIT");
    expect(role.supportedSurfaces.length).toBeGreaterThan(0);
    expect(role.deliverable.requiredFields.length).toBeGreaterThan(0);
    expect(role.allowedTools).not.toContain("deploy");
    expect(role.allowedTools).not.toContain("send-message");
    expect(role.allowedTools).not.toContain("manage-secrets");
  }
});

test("research URLs reject credentials, private hosts, ports, and non-HTTPS schemes", () => {
  expect(isAllowedV90ResearchUrl("https://example.com/research")).toBe(true);
  expect(isAllowedV90ResearchUrl("http://example.com/research")).toBe(false);
  expect(isAllowedV90ResearchUrl("https://user:pass@example.com/research")).toBe(false);
  expect(isAllowedV90ResearchUrl("https://example.com:8443/research")).toBe(false);
  expect(isAllowedV90ResearchUrl("https://127.0.0.1/research")).toBe(false);
  expect(isAllowedV90ResearchUrl("https://metadata.google.internal/")).toBe(false);
});

test("research requests are bounded before a provider adapter runs", () => {
  expect(validateV90ResearchRequest({
    contractVersion: V90_CONTRACT_VERSION,
    tenantSlug: "veloce-cloud-test",
    provider: "scrapegraphai",
    sourceUrls: ["https://example.com"],
    fields: ["title", "summary"],
    maxPages: 4,
    maxDepth: 1,
  })).toEqual([]);

  const errors = validateV90ResearchRequest({
    contractVersion: V90_CONTRACT_VERSION,
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
    contractVersion: V90_CONTRACT_VERSION as const,
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
  expect(normalizeV90ResearchRecord(base)?.confidence).toBe(1);
  expect(normalizeV90ResearchRecord({ ...base, citations: [] })).toBeNull();
  expect(normalizeV90ResearchRecord({ ...base, sourceUrl: "https://localhost/private" })).toBeNull();
  expect(normalizeV90ResearchRecord({ ...base, status: "failed", citations: [], failureReason: "provider_timeout" })).not.toBeNull();
});

test("the research adapter keeps provider output inside the requested origin and tenant", () => {
  const request = createV90ResearchRequest({
    tenantSlug: "veloce-cloud-test",
    provider: "scrapegraphai",
    sourceUrls: ["https://example.com/research"],
    fields: ["title"],
    maxPages: 2,
    maxDepth: 0,
  });
  const record = {
    contractVersion: V90_CONTRACT_VERSION as const,
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
  expect(acceptV90ResearchRecord(request, record).tenantSlug).toBe(request.tenantSlug);
  expect(() => acceptV90ResearchRecord(request, { ...record, tenantSlug: "another-tenant" })).toThrow(/tenant scope/);
  expect(() => acceptV90ResearchRecord(request, { ...record, citations: [{ ...record.citations[0], url: "https://other.example/evidence" }] })).toThrow(/allowlist/);
});
