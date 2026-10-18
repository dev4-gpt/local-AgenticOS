globalThis.fetch = async (url, options) => {
  const parsed = new URL(url);
  if (parsed.origin !== "https://example.supabase.co") throw new Error("Unexpected retention origin");
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_credit_records") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 100 || typeof payload.p_apply !== "boolean") {
      throw new Error("Unexpected managed-credit retention RPC payload");
    }
    if (process.env.RETENTION_MOCK_CREDIT_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_CREDIT_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", candidates: { transactions: 2 },
      deleted: payload.p_apply ? { transactions: 2 } : {}, remainingCandidates: { transactions: payload.p_apply ? 0 : 2 },
      preservedNonzeroWalletBalances: 1, preservedNonzeroProviderBalances: 1,
      retentionDays: 28, recoveryDays: 7, purgeAfterDays: 35, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_runtime_jobs") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 500 || typeof payload.p_apply !== "boolean") {
      throw new Error("Unexpected runtime job retention RPC payload");
    }
    if (process.env.RETENTION_MOCK_JOB_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_JOB_RETENTION:${payload.p_apply}`);
    return Response.json({ candidates: 2, deleted: payload.p_apply ? 2 : 0,
      remainingCandidates: payload.p_apply ? 0 : 2, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_onboarding_tokens") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_batch_limit !== 500) throw new Error("Unexpected onboarding-token retention RPC payload");
    if (process.env.RETENTION_MOCK_ONBOARDING_TOKEN_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_ONBOARDING_TOKEN_RETENTION:${payload.p_apply}`);
    return Response.json({ candidates: 1, deleted: payload.p_apply ? 1 : 0, remainingCandidates: payload.p_apply ? 0 : 1, recoveryDays: 7, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_runtime_rate_limits") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_batch_limit !== 500) throw new Error("Unexpected runtime rate-limit retention RPC payload");
    if (process.env.RETENTION_MOCK_RATE_LIMIT_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_RATE_LIMIT_RETENTION:${payload.p_apply}`);
    return Response.json({ candidates: 1, deleted: payload.p_apply ? 1 : 0, remainingCandidates: payload.p_apply ? 0 : 1, recoveryDays: 7, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_runtime_audit_and_budget") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 500) throw new Error("Unexpected audit/budget retention RPC payload");
    if (process.env.RETENTION_MOCK_AUDIT_BUDGET_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_AUDIT_BUDGET_RETENTION:${payload.p_apply}`);
    return Response.json({ auditCandidates: 1, auditDeleted: payload.p_apply ? 1 : 0, budgetCandidates: 1,
      budgetDeleted: payload.p_apply ? 1 : 0, recoveryDays: 7, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/client_learning_retention_references_ready") && options.method === "POST") {
    return Response.json(process.env.RETENTION_MOCK_REFERENCE_GUARD_FAIL !== "1");
  }
  if (parsed.pathname.endsWith("/client_tenants") && (!options.method || options.method === "GET")) {
    if (parsed.searchParams.get("slug") !== "eq.tenant-a" || parsed.searchParams.get("select") !== "retention_days"
      || parsed.searchParams.get("limit") !== "2") throw new Error("Unexpected tenant retention lookup");
    return Response.json([{ retention_days: 28 }]);
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_runtime_records") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 500) throw new Error("Unexpected retention RPC payload");
    if (process.env.RETENTION_MOCK_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_RECORD_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", candidates: 2, deleted: payload.p_apply ? 2 : 0, remainingCandidates: payload.p_apply ? 0 : 2 });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_notebook_sources") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 100) throw new Error("Unexpected source retention RPC payload");
    if (process.env.RETENTION_MOCK_SOURCE_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_SOURCE_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", candidates: 1, deleted: payload.p_apply ? 1 : 0,
      remainingCandidates: payload.p_apply ? 0 : 1, legacyMissingExpiry: 1, legacyExtendedExpiry: 1 });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_research") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 100) throw new Error("Unexpected research retention RPC payload");
    if (process.env.RETENTION_MOCK_RESEARCH_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_RESEARCH_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", candidates: { runs: 0, records: 0, citations: 0, workerFailures: 0 },
      deleted: { runs: 0, records: 0, citations: 0, workerFailures: 0 }, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_runtime_requests") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 100) throw new Error("Unexpected runtime-request retention RPC payload");
    if (process.env.RETENTION_MOCK_RUNTIME_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_RUNTIME_REQUEST_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", candidates: { requests: 2, deliveryActions: 1 },
      deleted: { requests: payload.p_apply ? 2 : 0, deliveryActions: payload.p_apply ? 1 : 0 }, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_room_records") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 100) throw new Error("Unexpected room retention RPC payload");
    if (process.env.RETENTION_MOCK_ROOM_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_ROOM_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", candidates: { messages: 1, rounds: 1, conversations: 1 },
      deleted: { messages: payload.p_apply ? 1 : 0, rounds: payload.p_apply ? 1 : 0, conversations: payload.p_apply ? 1 : 0 }, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_visual_qa") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 100) throw new Error("Unexpected Visual QA retention RPC payload");
    if (process.env.RETENTION_MOCK_VISUAL_QA_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_VISUAL_QA_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", candidates: { findings: 1, reports: 1 },
      deleted: { findings: payload.p_apply ? 1 : 0, reports: payload.p_apply ? 1 : 0 }, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_support_requests") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 100) throw new Error("Unexpected support retention RPC payload");
    if (process.env.RETENTION_MOCK_SUPPORT_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_SUPPORT_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", candidates: 1, deleted: payload.p_apply ? 1 : 0,
      remainingCandidates: payload.p_apply ? 0 : 1, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_pipeline_items") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 100) throw new Error("Unexpected Pipeline retention RPC payload");
    if (process.env.RETENTION_MOCK_PIPELINE_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_PIPELINE_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", expiredCandidates: 1, purgeDueCandidates: 0,
      deleted: 0, remainingPurgeDue: 0, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_board_loop_records") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 100) throw new Error("Unexpected Board and Loop retention RPC payload");
    if (process.env.RETENTION_MOCK_BOARD_LOOP_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_BOARD_LOOP_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", expiredOrPurgeDue: { boardComments: 0, boardEvents: 0, loopRounds: 0, boardTasks: 0, loopRuns: 0 },
      deleted: { boardComments: 0, boardEvents: 0, loopRounds: 0, boardTasks: 0, loopRuns: 0 }, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_paperclip_records") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 100) throw new Error("Unexpected Paperclip retention RPC payload");
    if (process.env.RETENTION_MOCK_PAPERCLIP_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_PAPERCLIP_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", expiredOrPurgeDue: { comments: 0, runs: 0, issues: 0, projects: 0, agents: 0 },
      deleted: { comments: 0, runs: 0, issues: 0, projects: 0, agents: 0 }, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_hermes_content_factory_records") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 100) throw new Error("Unexpected Hermes Content Factory retention RPC payload");
    if (process.env.RETENTION_MOCK_HERMES_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_HERMES_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", expiredOrPurgeDue: { stageOutputs: 0, citations: 0, qualityReports: 0, approvals: 0, deliveries: 0, runs: 0 },
      deleted: { stageOutputs: 0, citations: 0, qualityReports: 0, approvals: 0, deliveries: 0, runs: 0 }, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_ruflo_records") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 100) throw new Error("Unexpected Ruflo retention RPC payload");
    if (process.env.RETENTION_MOCK_RUFLO_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_RUFLO_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", expiredOrPurgeDue: { agents: 0, swarms: 0 },
      deleted: { agents: 0, swarms: 0 }, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/rpc/purge_expired_client_notebooks") && options.method === "POST") {
    const payload = JSON.parse(options.body);
    if (payload.p_tenant_slug !== "tenant-a" || payload.p_batch_limit !== 100) throw new Error("Unexpected notebook retention RPC payload");
    if (process.env.RETENTION_MOCK_NOTEBOOK_RPC_FAIL === "1") return new Response(null, { status: 404 });
    console.log(`MOCK_NOTEBOOK_RETENTION:${payload.p_apply}`);
    return Response.json({ tenant: "tenant-a", candidates: 0, deleted: 0, remainingCandidates: 0, applied: payload.p_apply });
  }
  if (parsed.pathname.endsWith("/client_learning_items") && (!options.method || options.method === "GET")) {
    if (parsed.searchParams.get("tenant_slug") !== "eq.tenant-a" || !parsed.searchParams.get("retention_expires_at")?.startsWith("lte.")
      || parsed.searchParams.has("created_at") || parsed.searchParams.get("limit") !== "100"
      || parsed.searchParams.get("select") !== "id") {
      throw new Error("Unexpected learning-item retention filter");
    }
    const expiryCutoff = Date.parse(parsed.searchParams.get("retention_expires_at").slice(4));
    if (!Number.isFinite(expiryCutoff) || Math.abs(Date.now() - 7 * 86_400_000 - expiryCutoff) > 5_000) {
      throw new Error("Learning-item purge must retain seven recovery days after active expiry");
    }
    return Response.json([{ id: process.env.RETENTION_MOCK_BAD_IDS === "1" ? "not-a-uuid" : "00000000-0000-4000-8000-000000000041" }]);
  }
  if (parsed.pathname.endsWith("/client_learning_items") && options.method === "DELETE") {
    if (parsed.searchParams.get("tenant_slug") !== "eq.tenant-a" || parsed.searchParams.has("created_at")
      || !parsed.searchParams.get("retention_expires_at")?.startsWith("lte.")
      || parsed.searchParams.get("id") !== "in.(00000000-0000-4000-8000-000000000041)"
      || options.headers?.Prefer !== "return=representation") throw new Error("Unexpected learning-item deletion scope");
    console.log("MOCK_LEARNING_RETENTION_DELETE");
    return Response.json(process.env.RETENTION_MOCK_DELETE_MISMATCH === "1" ? [] : [{ id: "00000000-0000-4000-8000-000000000041" }]);
  }
  throw new Error(`Unexpected retention request: ${options.method} ${parsed.pathname}`);
};
