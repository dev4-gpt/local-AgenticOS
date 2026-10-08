import { createHash } from "node:crypto";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const MAX_EVIDENCE_BYTES = 1_000_000;

export const customerJourneyChecks = Object.freeze({
  J01: ["consent-recorded", "credential-free-intake", "abuse-and-error-path"],
  J02: ["single-use", "expiry", "wrong-recipient", "token-not-leaked"],
  J03: ["reviewed-plan-and-amount", "test-mode-session", "cancel-and-retry"],
  J04: ["valid-signature", "duplicate-and-reordered", "failure-and-reconciliation", "no-double-charge"],
  J05: ["human-manifest-approval", "manifest-hash-bound", "edited-manifest-rejected"],
  J06: ["queue-and-retry", "failure-rollback", "revision-and-digest", "tenant-resource-isolation"],
  J07: ["smoke-before-activation", "isolation-and-rollback", "owner-membership"],
  J08: ["one-time-setup", "correct-tenant", "expired-and-revoked", "session-recovery"],
  J09: ["bounded-action", "persisted-artifact", "provenance-and-run-status"],
  J10: ["provider-validation", "rotation-revocation-deletion", "managed-approval", "secret-not-exposed"],
  J11: ["estimate-reserve-settle-refund", "duplicate-and-rejected-work", "test-mode-and-hard-cap"],
  J12: ["support", "execution-stop", "full-tenant-export", "offboarding-and-retention"],
  J13: ["two-tenant-data", "cross-tenant-read-and-execute", "cross-tenant-export-delete-credentials"],
  J14: ["bounded-load-and-alert", "restore", "rollback", "customer-visible-recovery"],
  J15: ["consent-terms-privacy", "retention-support", "marketing-and-cost-controls", "named-owners"],
});

export function validCustomerJourneyReport(report, expectedCommit, deployment, readEvidence) {
  if (!report || report.schemaVersion !== 1 || report.sourceCommit !== expectedCommit
    || !/^[0-9a-f]{40}$/i.test(expectedCommit ?? "")
    || !["staging", "production"].includes(report.environment)
    || report.environment !== deployment?.environment
    || report.vercelDeployment !== deployment?.vercelDeployment
    || report.cloudRunRevision !== deployment?.cloudRunRevision
    || report.imageDigest !== deployment?.imageDigest
    || !/^sha256:[0-9a-f]{64}$/i.test(report.imageDigest ?? "")
    || !validTimestamp(report.checkedAt)
    || !Array.isArray(report.cases) || report.cases.length !== 15) return false;

  const expectedIds = new Set(Array.from({ length: 15 }, (_, index) => `J${String(index + 1).padStart(2, "0")}`));
  const evidenceCache = new Map();
  for (const item of report.cases) {
    if (!expectedIds.delete(item?.id) || item.status !== "passed"
      || !Array.isArray(item.evidence) || item.evidence.length === 0) return false;
    let attested = false;
    let hasArtifact = false;
    for (const entry of item.evidence) {
      if (!validRef(entry?.ref) || !/^[0-9a-f]{64}$/i.test(entry.sha256 ?? "")
        || !["case-attestation", "artifact"].includes(entry.kind)) return false;
      let bytes = evidenceCache.get(entry.ref);
      if (bytes === undefined) {
        try { bytes = readEvidence(entry.ref); } catch { bytes = null; }
        evidenceCache.set(entry.ref, bytes);
      }
      if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_EVIDENCE_BYTES
        || createHash("sha256").update(bytes).digest("hex") !== entry.sha256.toLowerCase()) return false;
      if (entry.kind === "case-attestation") {
        if (attested || !validAttestation(bytes, item.id, report)) return false;
        attested = true;
      } else hasArtifact = true;
    }
    if (!attested || !hasArtifact) return false;
  }
  return expectedIds.size === 0;
}

function validRef(ref) {
  return typeof ref === "string"
    && /^(?:gs:\/\/[a-z0-9][a-z0-9._-]+\/[a-zA-Z0-9/_.-]+|docs\/evidence\/[a-zA-Z0-9/_.-]+)$/.test(ref)
    && !ref.includes("..") && !ref.includes("//", 5);
}

function validTimestamp(value) {
  return typeof value === "string" && ISO_UTC.test(value) && Number.isFinite(Date.parse(value));
}

function validAttestation(bytes, caseId, report) {
  let receipt;
  try { receipt = JSON.parse(bytes.toString("utf8")); } catch { return false; }
  const requiredChecks = customerJourneyChecks[caseId];
  const observations = receipt?.observations;
  if (!requiredChecks || !Array.isArray(observations)
    || observations.length < requiredChecks.length
    || new Set(observations.map((observation) => observation?.checkId)).size !== observations.length
    || !requiredChecks.every((checkId) => observations.some((observation) => observation.checkId === checkId))) return false;
  return receipt?.schemaVersion === 1 && receipt.caseId === caseId && receipt.status === "passed"
    && receipt.sourceCommit === report.sourceCommit && receipt.environment === report.environment
    && receipt.vercelDeployment === report.vercelDeployment
    && receipt.cloudRunRevision === report.cloudRunRevision
    && receipt.imageDigest === report.imageDigest
    && validTimestamp(receipt.checkedAt) && Date.parse(receipt.checkedAt) <= Date.parse(report.checkedAt)
    && typeof receipt.reviewedBy === "string" && receipt.reviewedBy.trim().length >= 2
    && receipt.reviewedBy.length <= 120
    && observations.every((observation) => typeof observation?.checkId === "string"
      && observation.checkId.length <= 100 && typeof observation?.action === "string"
      && observation.action.trim().length > 0 && observation.action.length <= 500
      && typeof observation.observed === "string" && observation.observed.trim().length > 0
      && observation.observed.length <= 2_000 && observation.result === "passed");
}
