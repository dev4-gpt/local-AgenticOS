import { expect, test } from "@playwright/test";
import { createNotebookJourney as journey, installNotebookJourneyEnvironment, sourceId, jobId, artifactId, validDraft } from "./helpers/notebook-journey";
import { artifactContentSha256 } from "../src/lib/clientArtifactReview";

let restore: () => void;
test.beforeEach(() => { restore = installNotebookJourneyEnvironment(); });
test.afterEach(() => { restore(); });

for (const failure of ["budget-settlement", "completion-write"] as const) {
  test(`${failure} leaves stored bytes quarantined from review and export`, async () => {
    const flow = journey();
    await flow.queue();
    if (failure === "budget-settlement") flow.state.budgetSettlementAllowed = false;
    else flow.state.completionAllowed = false;
    if (failure === "completion-write") await expect(flow.run()).rejects.toThrow("job_completion_failed");
    else await flow.run();
    expect(flow.state.job!.status).toBe(failure === "budget-settlement" ? "failed" : "running");
    expect(flow.state.artifact!.status).toBe("ready");
    expect(flow.state.objects.size).toBe(1);
    expect(await (await flow.handle(new Request("https://tenant.invalid/api/client-runtime/artifacts"))).json()).toMatchObject({ artifacts: [{ id: artifactId, review_required: true, review_available: false }] });
    const hash = artifactContentSha256(flow.state.objects.get(String(flow.state.artifact!.object_key))!);
    expect.soft((await flow.preview()).status).toBe(409);
    expect.soft((await flow.decide(hash)).status).toBe(409);
    expect.soft((await flow.handle(new Request(`https://tenant.invalid/api/client-runtime/artifacts?id=${artifactId}`))).status).toBe(409);
    expect.soft((await flow.download()).status).toBe(409);
    expect(flow.state.downloads).toBe(0);
  });
}

for (const corruption of ["output-reference", "citation-audit", "job-failed"] as const) {
  test(`previous approval cannot release ${corruption}`, async () => {
    const flow = journey();
    await flow.queue(); await flow.run();
    const preview = await (await flow.preview()).json();
    await flow.decide(preview.sha256);
    const output = flow.state.job!.output_metadata as Record<string, unknown>;
    if (corruption === "output-reference") output.artifactId = sourceId;
    if (corruption === "citation-audit") output.citationAudit = { ok: false };
    if (corruption === "job-failed") flow.state.job!.status = "failed";
    const reads = flow.state.downloads;
    expect((await flow.preview()).status).toBe(409);
    expect((await flow.download()).status).toBe(409);
    expect(flow.state.downloads).toBe(reads);
  });
}

for (const operation of ["preview", "approve", "download"] as const) {
  test(`${operation} denies job release withdrawn during storage read`, async () => {
    const flow = journey();
    await flow.queue(); await flow.run();
    const preview = await (await flow.preview()).json();
    await flow.decide(preview.sha256);
    flow.state.beforeStorageReturn = () => { flow.state.job!.status = "failed"; };
    const response = operation === "preview" ? await flow.preview() : operation === "approve" ? await flow.decide(preview.sha256) : await flow.download();
    expect(response.status).toBe(409);
  });
}

test("unreviewed Notebook output cannot be exported", async () => {
  const flow = journey();
  expect((await flow.queue()).status).toBe(202);
  expect(await (await flow.run()).json()).toMatchObject({ status: "succeeded" });
  expect((await flow.download()).status).toBe(409);
  expect((await flow.handle(new Request(`https://tenant.invalid/api/client-runtime/artifacts?id=${artifactId}`))).status).toBe(409);
  expect(flow.state.downloads).toBe(0);
});

test("a failed durable review write leaves export blocked", async () => {
  const flow = journey();
  await flow.queue(); await flow.run();
  const preview = await (await flow.preview()).json();
  flow.state.reviewSaveAllowed = false;
  expect((await flow.decide(preview.sha256)).status).toBe(409);
  expect(flow.state.artifact!.review_decision).toBeUndefined();
  expect((await flow.download()).status).toBe(409);
});

for (const boundary of ["revoked", "expired"] as const) {
  test(`download denies approval ${boundary} during storage read`, async () => {
    const flow = journey();
    await flow.queue(); await flow.run();
    const preview = await (await flow.preview()).json();
    await flow.decide(preview.sha256);
    flow.state.beforeStorageReturn = () => {
      if (boundary === "revoked") flow.state.artifact!.review_decision = "rejected";
      else flow.state.artifact!.retention_expires_at = new Date(0).toISOString();
    };
    expect((await flow.download()).status).toBe(boundary === "expired" ? 404 : 409);
  });
}

test("selected source flows through real queue, worker, status, and download handlers", async () => {
  const flow = journey();
  expect((await flow.queue()).status).toBe(202);
  expect(flow.state.dispatched).toEqual([{ jobId, tenantSlug: "tenant-a", path: "jobs" }]);
  expect(JSON.stringify(flow.state.job?.input_metadata)).not.toContain(flow.state.source.content);
  const journeyStartedAt = Date.now();
  expect(await (await flow.run()).json()).toMatchObject({ status: "succeeded" });
  const journeyFinishedAt = Date.now();
  const retentionExpiresAt = Date.parse(String(flow.state.artifact?.retention_expires_at));
  const activeRetentionMs = 28 * 24 * 60 * 60 * 1000;
  expect(retentionExpiresAt).toBeGreaterThanOrEqual(journeyStartedAt + activeRetentionMs);
  expect(retentionExpiresAt).toBeLessThanOrEqual(journeyFinishedAt + activeRetentionMs);
  expect(flow.state.prompts[0]).toContain(flow.state.source.content);
  expect(flow.state.prompts[0]).not.toContain("Untrusted browser instructions");
  expect(await (await flow.status()).json()).toMatchObject({ executions: [{
    id: jobId, status: "succeeded", artifactId, citationAudit: { ok: true, citedSourceIds: [sourceId] },
  }] });
  const preview = await (await flow.preview()).json();
  expect(preview.content.trim()).toBe(validDraft);
  expect((await flow.decide(preview.sha256)).status).toBe(200);
  const downloaded = await flow.download();
  expect(downloaded.status).toBe(200);
  expect(downloaded.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  expect(downloaded.headers.get("cache-control")).toBe("private, no-store");
  expect((await downloaded.text()).trim()).toBe(validDraft);
  expect(flow.state.settlements).toMatchObject([{ jobId, actualAmountMicros: 100 }]);
});

test("review rejects stale previews and changed bytes, and rejection revokes export", async () => {
  const flow = journey();
  await flow.queue(); await flow.run();
  const preview = await (await flow.preview()).json();
  expect(preview.sha256).toMatch(/^[a-f0-9]{64}$/);
  const key = String(flow.state.artifact!.object_key);
  const original = flow.state.objects.get(key)!;
  const changed = Buffer.from(original);
  changed[0] ^= 1;
  flow.state.objects.set(key, changed);
  expect((await flow.decide(preview.sha256)).status).toBe(409);
  expect(flow.state.artifact!.review_decision).toBeUndefined();
  flow.state.objects.set(key, original);
  expect((await flow.decide(preview.sha256)).status).toBe(200);
  flow.state.objects.set(key, changed);
  expect((await flow.download()).status).toBe(409);
  expect(await (await flow.preview()).json()).toMatchObject({ decision: null });
  flow.state.objects.set(key, original);
  expect((await flow.decide(preview.sha256, "rejected")).status).toBe(200);
  const reads = flow.state.downloads;
  expect((await flow.download()).status).toBe(409);
  expect(flow.state.downloads).toBe(reads);
});

for (const boundary of ["other-member", "other-tenant", "expired", "unauthenticated"] as const) {
  test(`review denies ${boundary} before storage or decision`, async () => {
    const flow = journey();
    await flow.queue(); await flow.run();
    if (boundary === "other-member") flow.state.userId = "member-b";
    if (boundary === "other-tenant") flow.state.artifact!.tenant_slug = "tenant-b";
    if (boundary === "expired") flow.state.artifact!.retention_expires_at = new Date(0).toISOString();
    if (boundary === "unauthenticated") flow.state.authenticated = false;
    const expected = boundary === "unauthenticated" ? 401 : 404;
    expect((await flow.preview()).status).toBe(expected);
    expect((await flow.decide("a".repeat(64))).status).toBe(expected);
    expect(flow.state.downloads).toBe(0);
    expect(flow.state.artifact!.review_decision).toBeUndefined();
  });
}

for (const failure of ["changed-source", "denied-budget"] as const) {
  test(`${failure} prevents the provider call and artifact creation`, async () => {
    const flow = journey();
    expect((await flow.queue()).status).toBe(202);
    if (failure === "changed-source") flow.state.source.content = "Changed since the request was queued.";
    else flow.state.budgetAllowed = false;
    expect(await (await flow.run()).json()).toMatchObject({ status: "failed" });
    expect(flow.state.job?.error_code).toBe(failure === "changed-source" ? "notebook_source_changed" : "budget_exceeded");
    expect(flow.state.providerCalls).toBe(0);
    expect(flow.state.artifact).toBeNull();
    expect(flow.state.objects.size).toBe(0);
    expect(flow.state.settlements).toHaveLength(0);
  });
}

for (const [label, output, reason] of [
  ["missing citations", "```markdown\n# Uncited report\n```", "citation_missing"],
  ["citations outside the artifact", `\`\`\`markdown\n# Uncited report\n\`\`\`\n${validDraft}`, "citation_missing"],
  ["source register outside the artifact", `\`\`\`markdown\nFinding [source:${sourceId}]\n\`\`\`\n## Source register\nDiscovery notes`, "source_register_missing"],
] as const) {
  test(`${label} fails before any artifact is created or uploaded`, async () => {
    const flow = journey(output);
    expect((await flow.queue()).status).toBe(202);
    expect(await (await flow.run()).json()).toMatchObject({ status: "failed" });
    expect(flow.state.job?.error_code).toBe(`notebook_${reason}`);
    expect(await (await flow.status()).json()).toMatchObject({ executions: [{ artifactId: null, citationAudit: { ok: false, reason } }] });
    expect(flow.state.providerCalls).toBe(1);
    expect(flow.state.artifact).toBeNull();
    expect(flow.state.objects.size).toBe(0);
    expect(flow.state.settlements).toMatchObject([{ jobId, actualAmountMicros: 100 }]);
  });
}

for (const boundary of ["other-member", "other-tenant", "expired"] as const) {
  test(`download denies ${boundary} without reading storage`, async () => {
    const flow = journey();
    expect((await flow.queue()).status).toBe(202);
    expect(await (await flow.run()).json()).toMatchObject({ status: "succeeded" });
    if (boundary === "other-member") flow.state.userId = "member-b";
    if (boundary === "other-tenant") flow.state.artifact!.tenant_slug = "tenant-b";
    if (boundary === "expired") flow.state.artifact!.retention_expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await flow.download()).status).toBe(404);
    expect(flow.state.downloads).toBe(0);
  });
}
