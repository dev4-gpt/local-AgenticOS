globalThis.fetch = async (url, options) => {
  const parsed = new URL(url);
  if (process.env.LIFECYCLE_MOCK_FINANCIAL && parsed.origin === "https://example.supabase.co" && (!options.method || options.method === "GET")) {
    if (process.env.LIFECYCLE_MOCK_FINANCIAL === "error" && parsed.pathname.endsWith("/client_credit_transactions")) {
      return new Response(null, { status: 503 });
    }
    if (process.env.LIFECYCLE_MOCK_FINANCIAL === "control-error" && parsed.pathname.endsWith("/client_support_requests") && parsed.searchParams.get("select") === "id") {
      return new Response(null, { status: 503 });
    }
    const rows = Number(parsed.searchParams.get("offset") || 0) > 0
      ? []
      : parsed.pathname.endsWith("/client_tenants") && process.env.LIFECYCLE_MOCK_FINANCIAL !== "missing"
        ? [{ slug: "test-client", name: "Test Client", status: "active", retention_days: 30 }]
      : process.env.LIFECYCLE_MOCK_FINANCIAL === "coverage" && parsed.pathname.endsWith("/client_manifest_proposals")
        ? [{ id: "proposal-1", tenant_slug: "test-client", requested_by: "user-1", catalog_ids: ["catalog-1"], provider_keys: ["GROQ_API_KEY"], credential_modes: { "catalog-1": "byok" }, pricing_snapshot_ids: [], idempotency_key: "proposal-1", manifest_hash: "reviewed-hash", status: "approved", metadata: {} }]
      : process.env.LIFECYCLE_MOCK_FINANCIAL === "coverage" && parsed.pathname.endsWith("/client_provider_connections")
        ? [{ id: "connection-1", tenant_slug: "test-client", catalog_id: "catalog-1", provider_key: "GROQ_API_KEY", credential_mode: "byok", status: "connected", pricing_snapshot_id: null, manifest_version: "v1", last_validated_at: "2026-10-01T00:00:00Z", revoked_at: null }]
      : process.env.LIFECYCLE_MOCK_FINANCIAL === "coverage" && parsed.pathname.endsWith("/client_support_requests")
        ? [{ id: "support-1", tenant_slug: "test-client", email: "owner@example.test", subject: "Help", message: "Need assistance", status: "open", request_id: "request-1", request_type: "general", provider_key: null, requested_budget_micros: null }]
      : process.env.LIFECYCLE_MOCK_FINANCIAL === "coverage" && parsed.pathname.endsWith("/client_research_worker_failures")
        ? [{ id: "failure-1", tenant_slug: "test-client", job_id: null, idempotency_key: "research-1", phase: "final", sqlstate: "22000", record_count: 0 }]
      : process.env.LIFECYCLE_MOCK_FINANCIAL === "history" && parsed.pathname.endsWith("/client_credit_transactions")
      ? [{ tenant_slug: "test-client" }]
      : process.env.LIFECYCLE_MOCK_FINANCIAL === "balance" && parsed.pathname.endsWith("/client_credit_accounts")
        ? [{ tenant_slug: "test-client", balance_micros: 1000, reserved_micros: 0 }]
      : process.env.LIFECYCLE_MOCK_FINANCIAL === "support" && parsed.pathname.endsWith("/client_support_requests")
        ? [{ id: "support-1", tenant_slug: "test-client" }]
      : process.env.LIFECYCLE_MOCK_FINANCIAL === "onboarding" && parsed.pathname.endsWith("/client_onboarding_accounts")
        ? [{ id: "onboarding-1", tenant_slug: "test-client" }]
        : [];
    return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (process.env.LIFECYCLE_MOCK_FINANCIAL === "inventory-patch" && parsed.origin === "https://example.supabase.co"
    && parsed.pathname.endsWith("/client_tenants") && options.method === "PATCH"
    && JSON.parse(options.body).status === "offboarding") {
    console.log("MOCK_TENANT_PATCH");
    return new Response(null, { status: 204 });
  }
  if (parsed.origin !== "https://example.supabase.co" || options.method !== "POST") {
    throw new Error(`Unexpected lifecycle request: ${options.method} ${url}`);
  }
  const rows = JSON.parse(options.body);
  if (!Array.isArray(rows) || !rows.length || rows.length > 500 || rows.some((row) => row.tenant_slug !== "test-client" && row.slug !== "test-client")) {
    throw new Error(`Unexpected lifecycle restore payload: ${parsed.pathname}`);
  }
  if (parsed.pathname.endsWith("/client_manifest_proposals") && rows.some((row) => row.status !== "submitted" || row.manifest_hash !== null)) {
    throw new Error("Restore must not revive manifest approval");
  }
  if (parsed.pathname.endsWith("/client_provider_connections") && rows.some((row) => row.status !== "submitted" || row.manifest_version !== null || row.last_validated_at !== null || "secret_resource" in row)) {
    throw new Error("Restore must not revive provider access");
  }
  console.log(`MOCK_RESTORE_TABLE:${parsed.pathname.split("/").at(-1)}:${rows.length}`);
  return new Response(null, { status: 201 });
};
