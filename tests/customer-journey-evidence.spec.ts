import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { customerJourneyChecks, validCustomerJourneyReport } from "../scripts/lib/customer-journey-evidence.mjs";

const commit = "a".repeat(40);
const deployment = {
  environment: "staging", vercelDeployment: "vercel-reviewed",
  cloudRunRevision: "run-reviewed", imageDigest: `sha256:${"b".repeat(64)}`,
};

function fixture() {
  const receipts = new Map<string, Buffer>();
  const report = {
    schemaVersion: 1, sourceCommit: commit, ...deployment, checkedAt: "2026-10-03T20:00:00Z",
    cases: Array.from({ length: 15 }, (_, index) => {
      const id = `J${String(index + 1).padStart(2, "0")}`;
      const ref = `docs/evidence/journey/${id}.json`;
      const artifactRef = `docs/evidence/journey/${id}-result.json`;
      const bytes = Buffer.from(JSON.stringify({
        schemaVersion: 1, caseId: id, status: "passed", sourceCommit: commit, ...deployment,
        checkedAt: "2026-10-03T19:00:00Z", reviewedBy: "Release reviewer",
        observations: customerJourneyChecks[id].map((checkId: string) => ({
          checkId, action: `Exercise ${checkId}`, observed: "Reviewed staging result", result: "passed",
        })),
      }));
      const artifact = Buffer.from(JSON.stringify({ caseId: id, result: "redacted test output" }));
      receipts.set(ref, bytes);
      receipts.set(artifactRef, artifact);
      return { id, status: "passed", evidence: [
        { kind: "case-attestation", ref, sha256: createHash("sha256").update(bytes).digest("hex") },
        { kind: "artifact", ref: artifactRef, sha256: createHash("sha256").update(artifact).digest("hex") },
      ] };
    }),
  };
  const check = (candidate: unknown) => validCustomerJourneyReport(candidate, commit, deployment, (ref: string) => receipts.get(ref) ?? null);
  return { report, receipts, check };
}

test("journey receipts identify every current-release case and a named reviewer", () => {
  const { report, receipts, check } = fixture();
  expect(check(report)).toBe(true);
  const changed = structuredClone(report);
  changed.cases[0].evidence[0].kind = "artifact";
  expect(check(changed)).toBe(false);

  const noArtifact = structuredClone(report);
  noArtifact.cases[0].evidence.pop();
  expect(check(noArtifact)).toBe(false);

  const wrongCase = structuredClone(report);
  const ref = wrongCase.cases[0].evidence[0].ref;
  const mismatched = Buffer.from(JSON.stringify({
    ...JSON.parse(receipts.get(ref)!.toString("utf8")), caseId: "J02",
  }));
  receipts.set(ref, mismatched);
  wrongCase.cases[0].evidence[0].sha256 = createHash("sha256").update(mismatched).digest("hex");
  expect(check(wrongCase)).toBe(false);
});

test("journey artifacts must be distinct from their case attestations", () => {
  const { report, receipts, check } = fixture();
  const candidate = structuredClone(report);
  const attestation = candidate.cases[0].evidence[0];
  const sameReference = structuredClone(candidate);
  sameReference.cases[0].evidence = [
    attestation,
    { ...attestation, kind: "artifact" },
  ];
  expect(check(sameReference)).toBe(false);

  const differentReferenceSameBytes = structuredClone(candidate);
  const duplicateRef = "docs/evidence/journey/J01-duplicate-attestation.json";
  receipts.set(duplicateRef, receipts.get(attestation.ref)!);
  differentReferenceSameBytes.cases[0].evidence = [
    attestation,
    { kind: "artifact", ref: duplicateRef, sha256: attestation.sha256 },
  ];
  expect(check(differentReferenceSameBytes)).toBe(false);
});

test("journey attestation rejects another deployment, missing observations, and missing bytes", () => {
  const { report, receipts, check } = fixture();
  const candidate = structuredClone(report);
  const ref = candidate.cases[0].evidence[0].ref;
  for (const change of [{ cloudRunRevision: "other-run" }, { observations: [] }, { reviewedBy: "" }]) {
    const bytes = Buffer.from(JSON.stringify({ ...JSON.parse(receipts.get(ref)!.toString("utf8")), ...change }));
    receipts.set(ref, bytes);
    candidate.cases[0].evidence[0].sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(check(candidate)).toBe(false);
  }
  receipts.delete(ref);
  expect(check(report)).toBe(false);
});

test("journey gate rejects generic, incomplete, or repeated positive and failure checks", () => {
  const { report, receipts, check } = fixture();
  const candidate = structuredClone(report);
  const ref = candidate.cases[0].evidence[0].ref;
  const original = JSON.parse(receipts.get(ref)!.toString("utf8"));
  const replace = (observations: unknown[]) => {
    const bytes = Buffer.from(JSON.stringify({ ...original, observations }));
    receipts.set(ref, bytes);
    candidate.cases[0].evidence[0].sha256 = createHash("sha256").update(bytes).digest("hex");
    return check(candidate);
  };
  expect(replace([{ action: "exercise J01", observed: "Expected result", result: "passed" }])).toBe(false);
  expect(replace(original.observations.slice(0, -1))).toBe(false);
  expect(replace([...original.observations, original.observations[0]])).toBe(false);
  expect(replace(original.observations)).toBe(true);
});
