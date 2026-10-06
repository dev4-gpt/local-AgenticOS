globalThis.fetch = async (url, options) => {
  const parsed = new URL(url);
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
