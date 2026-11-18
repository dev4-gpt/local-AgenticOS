import { createHash } from "node:crypto";
import { CLIENT_STORAGE_RETENTION_CLOCK } from "../../src/lib/clientStorageRetentionClock.mjs";
import { CLIENT_STORAGE_ARTIFACT_CROSSWALK, evaluateClientStorageArtifactInventory } from "./client-storage-artifact-inventory.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null);

function objectIdentity(object) {
  return `${object?.name ?? ""}\u0000${object?.generation ?? ""}`;
}

function canonicalObject(object) {
  return {
    name: object?.name,
    generation: object?.generation,
    timeCreated: firstDefined(object?.timeCreated, object?.time_created),
    customTime: firstDefined(object?.customTime, object?.custom_time),
    retentionExpiresAt: object?.metadata?.["agentos-retention-expires-at"],
    retentionClock: object?.metadata?.["agentos-retention-clock"],
    size: object?.size,
    contentType: firstDefined(object?.contentType, object?.content_type),
    timeDeleted: firstDefined(object?.timeDeleted, object?.time_deleted),
    softDeleteTime: firstDefined(object?.softDeleteTime, object?.soft_delete_time),
    hardDeleteTime: firstDefined(object?.hardDeleteTime, object?.hard_delete_time),
    eventBasedHold: firstDefined(object?.eventBasedHold, object?.event_based_hold),
    temporaryHold: firstDefined(object?.temporaryHold, object?.temporary_hold),
    retentionExpirationTime: firstDefined(object?.retentionExpirationTime, object?.retention_expiration_time),
    retention: object?.retention ? {
      retainUntilTime: firstDefined(object.retention.retainUntilTime, object.retention.retain_until_time),
      mode: object.retention.mode,
    } : undefined,
  };
}

export function evaluateClientStorageObjectInventory(snapshot, expected) {
  const failures = new Set();
  const prefix = `${expected.namespace}/`;
  const liveObjects = snapshot?.liveObjects;
  const softDeletedObjects = snapshot?.softDeletedObjects;
  const activeDays = expected.retentionDays ?? 28;
  const recoveryDays = expected.recoveryDays ?? 7;
  const checkedAt = Date.parse(snapshot?.checkedAt ?? "");
  if (!Number.isSafeInteger(activeDays) || activeDays < 1 || activeDays > 28 || recoveryDays !== 7) failures.add("object_retention_policy_invalid");

  if (snapshot?.schemaVersion !== 1 || snapshot?.bucket !== expected.bucket || snapshot?.prefix !== prefix) {
    failures.add("object_inventory_identity_mismatch");
  }
  if (!Number.isFinite(checkedAt)) failures.add("object_inventory_checked_at_invalid");
  else if (checkedAt > Date.now() + 5 * 60 * 1000 || Date.now() - checkedAt > MAX_AGE_MS) {
    failures.add("object_inventory_stale");
  }
  if (snapshot?.liveListingComplete !== true || snapshot?.softDeletedListingComplete !== true
      || !Array.isArray(liveObjects) || !Array.isArray(softDeletedObjects)) {
    failures.add("object_inventory_incomplete");
  }
  if (snapshot?.source?.liveListingMode !== "all_versions"
      || snapshot?.source?.softDeletedListingMode !== "soft_deleted_exhaustive"
      || snapshot?.source?.collector !== "verify-client-storage-object-inventory-v1"
      || snapshot?.source?.project !== expected.project
      || snapshot?.source?.account !== (expected.account ?? null)
      || !/^[0-9a-f]{64}$/.test(snapshot?.source?.liveListingSha256 ?? "")
      || !/^[0-9a-f]{64}$/.test(snapshot?.source?.softDeletedListingSha256 ?? "")) {
    failures.add("object_inventory_source_receipt_invalid");
  }

  const seen = new Set();
  let artifacts = null;
  try { artifacts = evaluateClientStorageArtifactInventory(snapshot, expected); }
  catch (error) { failures.add(error.message); }
  const artifactByKey = new Map((artifacts?.rows ?? []).map((row) => [row.object_key, row]));
  const liveByKey = new Map();
  const allObjects = [...(Array.isArray(liveObjects) ? liveObjects : []), ...(Array.isArray(softDeletedObjects) ? softDeletedObjects : [])];
  const inspect = (object, isSoftDeleted) => {
    if (!object || typeof object.name !== "string" || !object.name.startsWith(prefix)
        || !/^[0-9]+$/.test(String(object.generation ?? ""))) failures.add("object_outside_tenant_scope_or_unidentified");
    const identity = objectIdentity(object);
    if (seen.has(identity)) failures.add("object_inventory_duplicate_generation");
    seen.add(identity);

    const createdValue = firstDefined(object?.timeCreated, object?.time_created);
    if (!validDate(createdValue)) failures.add("object_creation_time_missing");
    const createdAt = Date.parse(createdValue ?? "");
    const customTime = firstDefined(object?.customTime, object?.custom_time);
    const originalExpiry = object?.metadata?.["agentos-retention-expires-at"];
    const anchor = Date.parse(customTime ?? "");
    const deadline = Date.parse(originalExpiry ?? "");
    const deadlineValid = validDate(customTime) && validDate(originalExpiry)
      && object?.metadata?.["agentos-retention-clock"] === CLIENT_STORAGE_RETENTION_CLOCK
      && Number.isFinite(createdAt) && anchor <= createdAt
      && deadline === anchor + activeDays * DAY_MS;
    if (!deadlineValid) failures.add("object_original_retention_clock_invalid");
    const artifact = artifactByKey.get(object?.name);
    if (!artifact) failures.add("object_artifact_reference_missing");
    else {
      if (Date.parse(artifact.retention_expires_at) !== deadline || createdAt < Date.parse(artifact.created_at)) {
        failures.add("object_artifact_deadline_mismatch");
      }
      const size = typeof object?.size === "number" ? object.size
        : typeof object?.size === "string" && /^(?:0|[1-9][0-9]*)$/.test(object.size) ? Number(object.size) : NaN;
      if (size !== artifact.byte_size || firstDefined(object?.contentType, object?.content_type) !== artifact.content_type) {
        failures.add("object_artifact_content_metadata_mismatch");
      }
      if (!isSoftDeleted && artifact.status === "deleted") failures.add("deleted_artifact_has_live_bytes");
    }
    if (!isSoftDeleted) liveByKey.set(object?.name, (liveByKey.get(object?.name) ?? 0) + 1);
    const eventHold = firstDefined(object?.eventBasedHold, object?.event_based_hold);
    const temporaryHold = firstDefined(object?.temporaryHold, object?.temporary_hold);
    if (typeof eventHold !== "boolean" || typeof temporaryHold !== "boolean") failures.add("object_hold_metadata_incomplete");
    if (eventHold === true || temporaryHold === true) failures.add("object_hold_active");

    if (object?.softDeleteTime !== undefined || object?.soft_delete_time !== undefined) {
      if (!isSoftDeleted) failures.add("soft_deleted_object_in_wrong_listing");
    }
    const retention = object?.retention;
    const retainUntil = firstDefined(retention?.retainUntilTime, retention?.retain_until_time);
    if (retention !== undefined && retention !== null && !validDate(retainUntil)) failures.add("object_retention_deadline_invalid");
    const effectiveExpiry = firstDefined(object?.retentionExpirationTime, object?.retention_expiration_time, retainUntil);
    if (effectiveExpiry !== undefined && effectiveExpiry !== null) {
      if (!validDate(effectiveExpiry)) failures.add("object_retention_deadline_invalid");
      else if ((Number.isFinite(createdAt) && Date.parse(effectiveExpiry) > createdAt + activeDays * DAY_MS)
        || (deadlineValid && Date.parse(effectiveExpiry) > deadline)) {
        failures.add("object_retention_exceeds_active_window");
      }
    }

    if (isSoftDeleted) {
      const softDeleteTime = firstDefined(object?.softDeleteTime, object?.soft_delete_time);
      const hardDeleteTime = firstDefined(object?.hardDeleteTime, object?.hard_delete_time);
      if (!validDate(softDeleteTime) || !validDate(hardDeleteTime)) {
        failures.add("soft_deleted_hard_delete_deadline_missing");
      } else {
        const softAt = Date.parse(softDeleteTime);
        const hardAt = Date.parse(hardDeleteTime);
        if (hardAt < softAt + recoveryDays * DAY_MS) failures.add("soft_delete_recovery_shorter_than_policy");
        if (hardAt > softAt + recoveryDays * DAY_MS) failures.add("soft_delete_recovery_exceeds_policy");
        if ((Number.isFinite(createdAt) && hardAt > createdAt + (activeDays + recoveryDays) * DAY_MS)
          || (deadlineValid && hardAt > deadline + recoveryDays * DAY_MS)) {
          failures.add("object_total_retention_exceeds_policy");
        }
        if (Number.isFinite(checkedAt) && hardAt < checkedAt) failures.add("soft_deleted_object_past_hard_delete_time");
      }
    } else if (Number.isFinite(checkedAt) && ((Number.isFinite(createdAt) && checkedAt >= createdAt + activeDays * DAY_MS)
      || (deadlineValid && checkedAt >= deadline))) {
      failures.add("live_object_past_active_expiry");
    }
  };

  for (const object of Array.isArray(liveObjects) ? liveObjects : []) inspect(object, false);
  for (const object of Array.isArray(softDeletedObjects) ? softDeletedObjects : []) inspect(object, true);
  for (const artifact of artifacts?.rows ?? []) {
    const count = liveByKey.get(artifact.object_key) ?? 0;
    if (artifact.status === "ready" && Date.parse(artifact.retention_expires_at) > checkedAt && count === 0) {
      failures.add("ready_artifact_object_missing");
    }
    if (count > 1) failures.add("artifact_multiple_live_generations");
  }

  const canonical = allObjects.map(canonicalObject).sort((left, right) =>
    `${left.name ?? ""}\u0000${left.generation ?? ""}`.localeCompare(`${right.name ?? ""}\u0000${right.generation ?? ""}`));
  return {
    schemaVersion: 4,
    retentionClock: CLIENT_STORAGE_RETENTION_CLOCK,
    evidenceScope: "stable_artifact_crosswalk_and_listed_metadata_not_observed_deletion_or_recovery",
    artifactCrosswalk: CLIENT_STORAGE_ARTIFACT_CROSSWALK,
    supabaseProjectRef: artifacts?.projectRef ?? null,
    artifactSnapshotSha256: artifacts?.sha256 ?? null,
    artifactRows: artifacts?.rows.length ?? null,
    artifactInventoryStartedAt: artifacts?.startedAt ?? null,
    artifactInventoryCheckedAt: artifacts?.checkedAt ?? null,
    ok: failures.size === 0,
    bucket: expected.bucket,
    namespace: expected.namespace,
    retentionDays: activeDays,
    recoveryDays,
    checkedAt: snapshot?.checkedAt ?? null,
    project: expected.project,
    account: expected.account ?? null,
    collector: snapshot?.source?.collector ?? null,
    liveListingMode: snapshot?.source?.liveListingMode ?? null,
    softDeletedListingMode: snapshot?.source?.softDeletedListingMode ?? null,
    liveObjectVersions: Array.isArray(liveObjects) ? liveObjects.length : 0,
    softDeletedObjectVersions: Array.isArray(softDeletedObjects) ? softDeletedObjects.length : 0,
    objectInventorySha256: sha256(JSON.stringify(canonical)),
    liveListingSha256: snapshot?.source?.liveListingSha256 ?? null,
    softDeletedListingSha256: snapshot?.source?.softDeletedListingSha256 ?? null,
    failures: [...failures].sort(),
  };
}

export function validClientStorageObjectInventoryReport(report, expected, { requireFresh = true } = {}) {
  const checkedAt = Date.parse(report?.checkedAt ?? "");
  return report?.schemaVersion === 4 && report.retentionClock === CLIENT_STORAGE_RETENTION_CLOCK && report.ok === true
    && report.artifactCrosswalk === CLIENT_STORAGE_ARTIFACT_CROSSWALK
    && /^[a-z0-9]{20}$/.test(expected?.supabaseProjectRef ?? "") && report.supabaseProjectRef === expected.supabaseProjectRef
    && /^[0-9a-f]{64}$/.test(report.artifactSnapshotSha256 ?? "")
    && Number.isSafeInteger(report.artifactRows) && report.artifactRows >= 0 && report.artifactRows <= 50_000
    && Number.isFinite(Date.parse(report.artifactInventoryStartedAt ?? ""))
    && Number.isFinite(Date.parse(report.artifactInventoryCheckedAt ?? ""))
    && Date.parse(report.artifactInventoryStartedAt) <= Date.parse(report.artifactInventoryCheckedAt)
    && Date.parse(report.artifactInventoryCheckedAt) <= checkedAt
    && checkedAt - Date.parse(report.artifactInventoryStartedAt) <= MAX_AGE_MS
    && Array.isArray(report.failures) && report.failures.length === 0
    && report.project === expected?.project && report.bucket === expected?.bucket
    && report.namespace === expected?.namespace && report.account === (expected?.account ?? null)
    && report.retentionDays === (expected?.retentionDays ?? 28)
    && report.recoveryDays === (expected?.recoveryDays ?? 7)
    && report.collector === "verify-client-storage-object-inventory-v1"
    && report.liveListingMode === "all_versions"
    && report.softDeletedListingMode === "soft_deleted_exhaustive"
    && Number.isSafeInteger(report.liveObjectVersions) && report.liveObjectVersions >= 0
    && Number.isSafeInteger(report.softDeletedObjectVersions) && report.softDeletedObjectVersions >= 0
    && /^[0-9a-f]{64}$/.test(report.objectInventorySha256 ?? "")
    && /^[0-9a-f]{64}$/.test(report.liveListingSha256 ?? "")
    && /^[0-9a-f]{64}$/.test(report.softDeletedListingSha256 ?? "")
    && Number.isFinite(checkedAt)
    && (!requireFresh || (checkedAt <= Date.now() + 5 * 60 * 1000 && Date.now() - checkedAt <= MAX_AGE_MS));
}
