import { eccRestoreRow } from "./ecc-lifecycle.mjs";

export function clientLifecycleRestoreRow(table, row) {
  if (table === "client_provider_connections") {
    return { ...row, status: "submitted", manifest_version: null, last_validated_at: null, revoked_at: null };
  }
  if (table === "client_manifest_proposals") {
    return { ...row, status: "submitted", manifest_hash: null };
  }
  return eccRestoreRow(table, row);
}
