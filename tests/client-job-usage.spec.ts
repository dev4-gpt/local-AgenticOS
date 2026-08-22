import { expect, test } from "@playwright/test";
import { presentClientJobUsage } from "@/lib/clientJobUsage";

test("job usage exposes estimate and settled ledger credits without secrets", () => {
  const usage = presentClientJobUsage({
    provider: "openrouter",
    inputMetadata: { estimatedCostMicros: 2501 },
    outputMetadata: { actualAmountMicros: 1900 },
    ledgerRecords: [{ amount_micros: 1900, job_id: "job-1" }],
  });
  expect(usage).toMatchObject({ estimatedMicros: 2501, estimatedCredits: 3, settledMicros: 1900, settledCredits: 2, status: "settled", providerOwnership: "client-byok" });
  expect(JSON.stringify(usage)).not.toContain("api");
});

test("activation proposal is fail-closed until operator approval", async () => {
  const { buildClientActivationManifestProposal } = await import("@/lib/clientActivationManifest");
  const proposal = buildClientActivationManifestProposal({
    tenantSlug: "tenant-a",
    user: { id: "user-a", email: "a@example.com" },
    providerKey: "OPENAI_API_KEY",
    providerLabel: "OpenAI",
    catalog: { id: "provider-openai_api_key", name: "OpenAI", kind: "provider", category: "Models", customerTool: "text", customerOutcome: "draft", pipelineStage: "execution", status: "client-key", dataScope: "tenant", permissions: "server", pricingBasis: "tokens", creditEstimate: "estimate", credentialMode: "byok", approval: "review" },
    secretName: "OPENAI_API_KEY",
  });
  expect(proposal.status).toBe("submitted-for-review");
  expect(proposal.manifestPatch.providerCallsEnabled).toBe(false);
  expect(proposal.evidenceRequired.length).toBeGreaterThan(3);
});
