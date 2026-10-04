import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { validCustomerJourneyReport } from "../scripts/lib/customer-journey-evidence.mjs";

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
      const bytes = Buffer.from(JSON.stringify({
        schemaVersion: 1, caseId: id, status: "passed", sourceCommit: commit, ...deployment,
        checkedAt: "2026-10-03T19:00:00Z", reviewedBy: "Release reviewer",
        observations: [{ action: `exercise ${id}`, observed: "Expected staging result", result: "passed" }],
      }));
      receipts.set(ref, bytes);
      return { id, status: "passed", evidence: [{ kind: "case-attestation", ref, sha256: createHash("sha256").update(bytes).digest("hex") }] };
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

  const wrongCase = structuredClone(report);
  const ref = wrongCase.cases[0].evidence[0].ref;
  const mismatched = Buffer.from(JSON.stringify({
    ...JSON.parse(receipts.get(ref)!.toString("utf8")), caseId: "J02",
  }));
  receipts.set(ref, mismatched);
  wrongCase.cases[0].evidence[0].sha256 = createHash("sha256").update(mismatched).digest("hex");
  expect(check(wrongCase)).toBe(false);
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
