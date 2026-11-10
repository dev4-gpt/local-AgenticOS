export function evaluateTenantProbe(label, tenantA, tenantB, { aOwn, aOther, bOwn, bOther }) {
  const failures = [];
  for (const [name, tenant, result] of [["A", tenantA, aOwn], ["B", tenantB, bOwn]]) {
    if (!result.ok) failures.push(`${label}: tenant ${name} own read failed (${result.status})`);
    else if (result.rows.length !== 1 || result.rows[0]?.tenant_slug !== tenant) {
      failures.push(`${label}: tenant ${name} own sentinel missing or mismatched - isolation inconclusive`);
    }
  }
  for (const [name, otherTenant, result] of [["A", "B", aOther], ["B", "A", bOther]]) {
    if (!result.ok) failures.push(`${label}: tenant ${name} cross-read failed (${result.status}) - inconclusive, refresh the token and re-run`);
    else if (result.rows.length !== 0) failures.push(`${label}: tenant ${name} token crossed into tenant ${otherTenant}`);
  }
  return failures;
}
