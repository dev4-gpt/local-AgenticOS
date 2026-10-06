globalThis.fetch = async (url, options) => {
  const parsed = new URL(url);
  if (process.env.LIFECYCLE_MOCK_FINANCIAL && parsed.origin === "https://example.supabase.co" && (!options.method || options.method === "GET")) {
    if (process.env.LIFECYCLE_MOCK_FINANCIAL === "error" && parsed.pathname.endsWith("/client_credit_transactions")) {
      return new Response(null, { status: 503 });
    }
    const rows = Number(parsed.searchParams.get("offset") || 0) > 0
      ? []
      : process.env.LIFECYCLE_MOCK_FINANCIAL === "history" && parsed.pathname.endsWith("/client_credit_transactions")
      ? [{ tenant_slug: "test-client" }]
      : process.env.LIFECYCLE_MOCK_FINANCIAL === "balance" && parsed.pathname.endsWith("/client_credit_accounts")
        ? [{ tenant_slug: "test-client", balance_micros: 1000, reserved_micros: 0 }]
        : [];
    return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (parsed.origin !== "https://example.supabase.co" || options.method !== "POST") {
    throw new Error(`Unexpected lifecycle request: ${options.method} ${url}`);
  }
  const rows = JSON.parse(options.body);
  if (!Array.isArray(rows) || !rows.length || rows.length > 500 || rows.some((row) => row.tenant_slug !== "test-client" && row.slug !== "test-client")) {
    throw new Error(`Unexpected lifecycle restore payload: ${parsed.pathname}`);
  }
  console.log(`MOCK_RESTORE_TABLE:${parsed.pathname.split("/").at(-1)}:${rows.length}`);
  return new Response(null, { status: 201 });
};
