import { eccRestoreRow } from "./ecc-lifecycle.mjs";

const DAY_MS = 86_400_000;
const timestamp = (value) => typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;

// Ordinary restore must not turn recovery-only backup content into active files.
export function assertClientArtifactRestoreWindow(snapshot, objectPlan = [], now = Date.now()) {
  const artifacts = snapshot.tables.client_runtime_artifacts ?? [];
  if (!artifacts.length && !objectPlan.length) return;
  const tenants = snapshot.tables.client_tenants;
  const days = tenants?.[0]?.retention_days;
  if (!Number.isFinite(now) || now < 0 || !Array.isArray(tenants) || tenants.length !== 1
    || tenants[0].slug !== snapshot.slug || !Number.isSafeInteger(days) || days < 1 || days > 28) {
    throw new Error("Artifact restore requires a verified tenant retention window of 1-28 days");
  }
  const readyKeys = new Set();
  const seen = new Set();
  for (const artifact of artifacts) {
    if (artifact.tenant_slug !== snapshot.slug || typeof artifact.object_key !== "string"
      || !artifact.object_key.startsWith(`${snapshot.slug}/`) || seen.has(artifact.object_key)) {
      throw new Error("Artifact restore has invalid or duplicate tenant metadata");
    }
    seen.add(artifact.object_key);
    const createdAt = timestamp(artifact.created_at);
    const expiresAt = timestamp(artifact.retention_expires_at);
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || createdAt > now
      || expiresAt <= createdAt || expiresAt > createdAt + days * DAY_MS) {
      throw new Error("Artifact restore has a missing or invalid original retention clock");
    }
    if (expiresAt <= now) throw new Error("Artifact restore active window has expired; recovery-only content cannot be reactivated");
    if (artifact.status === "ready") readyKeys.add(artifact.object_key);
  }
  const files = new Set(objectPlan.map((file) => file.objectKey));
  if (files.size !== objectPlan.length || files.size !== readyKeys.size
    || [...files].some((key) => !readyKeys.has(key))) {
    throw new Error("Artifact restore files must match ready artifact metadata exactly");
  }
}

export function clientLifecycleRestoreRow(table, row) {
  if (table === "client_provider_connections") {
    return { ...row, status: "submitted", manifest_version: null, last_validated_at: null, revoked_at: null };
  }
  if (table === "client_manifest_proposals") {
    return { ...row, status: "submitted", manifest_hash: null };
  }
  return eccRestoreRow(table, row);
}
