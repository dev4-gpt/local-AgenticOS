globalThis.fetch = async (url, options) => {
  const parsed = new URL(url);
  if (parsed.origin !== "https://example.supabase.co") throw new Error("Unexpected retention origin");
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_runtime_records") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 500) throw new Error("Unexpected retention RPC payload");
    if (process.env.RETENTION_MOCK_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_RECORD_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", candidates: 2, deleted: payload.p_apply ? 2 : 0, remainingCandidates: payload.p_apply ? 0 : 2 });
  }
  if (parsed.pathname.endsWith("/client_learning_items") && (!options.method || options.method === "GET")) {
    if (parsed.searchParams.get("tenant_slug") !== "eq.tenant-a" || !parsed.searchParams.get("retention_expires_at")?.startsWith("lte.")) {
      throw new Error("Unexpected learning-item retention filter");
    }
    return Response.json(parsed.searchParams.get("offset") === "0" ? [{ id: "item-1" }] : []);
  }
  if (parsed.pathname.endsWith("/client_learning_items") && options.method === "DELETE") {
    console.log("MOCK_LEARNING_RETENTION_DELETE");
    return new Response(null, { status: 204 });
  }
  throw new Error(`Unexpected retention request: ${options.method} ${parsed.pathname}`);
};
