export const eccLifecycleColumns = Object.freeze({
  client_ecc_policy: 'tenant_slug,enabled,updated_by,updated_at',
  client_learning_items: 'id,tenant_slug,created_by,idempotency_key,source_job_id,source_record_id,content,content_hash,confidence,revision,status,approved_hash,reviewed_by,reviewed_at,revoked_at,retention_expires_at,created_at,updated_at',
  client_ecc_skill_revisions: 'id,tenant_slug,item_id,revision,content,content_hash,approved_by,created_at,expires_at,revoked_at',
});

// Restoring a backup must not silently resurrect policy or old approvals.
// Preserve the immutable revision as revoked evidence; require a fresh review.
export function eccRestoreRow(table, row, now = new Date().toISOString()) {
  if (table === 'client_ecc_policy') return { ...row, enabled: false };
  if (table === 'client_learning_items') return { ...row, status: 'proposed', approved_hash: null, reviewed_by: null, reviewed_at: null, revoked_at: null, revision: Number(row.revision) + 1 };
  if (table === 'client_ecc_skill_revisions') return { ...row, revoked_at: row.revoked_at ?? now };
  return row;
}
