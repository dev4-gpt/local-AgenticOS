// Identity of the tested five-argument function body in the RPC guard migration.
// The PostgreSQL source-pack tests assert this against pg_proc.prosrc.
export const SOURCE_GUARD_BODY_MD5 = "e52e57bb71368b97d17ffab93fb8e164";

export const SOURCE_GUARD_SCHEMA_QUERY = `
with functions as (
  select
    pg_catalog.to_regprocedure('public.import_client_runtime_source_pack(text,uuid,text,jsonb)') as direct_oid,
    pg_catalog.to_regprocedure('public.import_client_runtime_source_pack_legacy(text,uuid,text,jsonb)') as legacy_oid
)
select
  pg_catalog.md5(guard.prosrc) as guard_body_md5,
  guard.prosecdef as guard_security_definer,
  guard.prorettype = 'pg_catalog.jsonb'::pg_catalog.regtype as guard_returns_jsonb,
  coalesce('search_path=public, extensions' = any(guard.proconfig), false) as guard_search_path,
  pg_catalog.pg_get_userbyid(guard.proowner) = 'postgres' as guard_owned_by_postgres,
  functions.legacy_oid is not null as legacy_present,
  not coalesce(pg_catalog.has_function_privilege('authenticated', functions.direct_oid, 'EXECUTE'), false) as direct_member_denied,
  not coalesce(pg_catalog.has_function_privilege('service_role', functions.direct_oid, 'EXECUTE'), false) as direct_service_denied,
  not coalesce(pg_catalog.has_function_privilege('authenticated', functions.legacy_oid, 'EXECUTE'), false) as legacy_member_denied,
  not coalesce(pg_catalog.has_function_privilege('service_role', functions.legacy_oid, 'EXECUTE'), false) as legacy_service_denied,
  pg_catalog.has_function_privilege('authenticated', guard.oid, 'EXECUTE') as guard_member_allowed,
  not pg_catalog.has_function_privilege('anon', guard.oid, 'EXECUTE') as guard_anon_denied,
  not pg_catalog.has_function_privilege('service_role', guard.oid, 'EXECUTE') as guard_service_denied
from pg_catalog.pg_proc as guard
cross join functions
where guard.oid = pg_catalog.to_regprocedure('public.import_client_runtime_source_pack(text,uuid,text,jsonb,text)')`;

const checks = [
  "guard_security_definer", "guard_returns_jsonb", "guard_search_path",
  "guard_owned_by_postgres", "legacy_present", "direct_member_denied",
  "direct_service_denied", "legacy_member_denied", "legacy_service_denied",
  "guard_member_allowed", "guard_anon_denied", "guard_service_denied",
];

export async function captureSourceGuardSchemaEvidence({ projectRef, token, fetchImpl = fetch, checkedAt = new Date().toISOString() }) {
  const evidence = { schemaVersion: 1, projectRef: projectRef || null, checkedAt, guardBodyMd5: null, passed: false, failures: [] };
  if (!/^[a-z0-9]{20}$/.test(projectRef ?? "")) evidence.failures.push("project_ref_invalid");
  if (!token?.trim()) evidence.failures.push("read_only_token_unavailable");
  if (evidence.failures.length) return evidence;

  try {
    const response = await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: SOURCE_GUARD_SCHEMA_QUERY }),
      signal: AbortSignal.timeout(15000),
    });
    if (response.status !== 201) {
      evidence.failures.push(`read_only_query_http_${response.status}`);
      return evidence;
    }
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== "object") {
      evidence.failures.push("read_only_query_result_invalid");
      return evidence;
    }
    const row = rows[0];
    if (typeof row.guard_body_md5 === "string" && /^[a-f0-9]{32}$/.test(row.guard_body_md5)) {
      evidence.guardBodyMd5 = row.guard_body_md5;
    }
    if (evidence.guardBodyMd5 !== SOURCE_GUARD_BODY_MD5) evidence.failures.push("guard_body_mismatch");
    for (const check of checks) if (row[check] !== true) evidence.failures.push(check);
    evidence.passed = evidence.failures.length === 0;
    return evidence;
  } catch {
    evidence.failures.push("read_only_query_unavailable");
    return evidence;
  }
}

export function validSourceGuardSchemaEvidence(record, current, expectedProjectRef, { requireCurrent = false } = {}) {
  return /^[a-z0-9]{20}$/.test(expectedProjectRef ?? "")
    && record?.schemaVersion === 1 && record.projectRef === expectedProjectRef
    && Number.isFinite(Date.parse(record.checkedAt)) && record.guardBodyMd5 === SOURCE_GUARD_BODY_MD5
    && record.passed === true && Array.isArray(record.failures) && record.failures.length === 0
    && (!requireCurrent || current != null)
    && (!current || (current.projectRef === record.projectRef && current.guardBodyMd5 === record.guardBodyMd5
      && current.passed === true && Array.isArray(current.failures) && current.failures.length === 0));
}
