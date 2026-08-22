import { NextResponse } from "next/server";
import { currentClientMember } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc } from "@/lib/clientDataPlane";
import { openRouterKey, providerEnvKey } from "@/lib/providerKeys";
import { clientProviderEnabled } from "@/lib/clientRuntimePolicy";
import { CLIENT_CREDENTIAL_OPTIONS } from "@/lib/clientCredentialCatalog";
import { publicCatalogCredentialOptions, publicCatalogProviderOptions } from "@/lib/publicProviderCatalog";
import { pricingSnapshotForCredential } from "@/lib/providerPricingCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  const rateLimit = await checkClientRuntimeRateLimit("credentials-read", 60, 900);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });
  const credentialOptions = publicCatalogCredentialOptions();
  const connectionResult = await clientRpc("list_client_provider_connections", { p_tenant_slug: process.env.CLIENT_SLUG || "" });
  const connections = Array.isArray(connectionResult.value) ? connectionResult.value as Array<Record<string, unknown>> : [];
  const credentials = CLIENT_CREDENTIAL_OPTIONS.filter((item) => clientProviderEnabled(item.key)).map((item) => {
    const value = item.key === "OPENROUTER_API_KEY" ? openRouterKey() : providerEnvKey(item.key);
    const connection = connections.find((candidate) => candidate.provider_key === item.key);
    return {
      key: item.key,
      label: item.label,
      connected: Boolean(value),
      secret: item.secret,
      connectionStatus: typeof connection?.status === "string" ? connection.status : null,
      credentialMode: typeof connection?.credential_mode === "string" ? connection.credential_mode : "byok",
      lastValidatedAt: typeof connection?.last_validated_at === "string" ? connection.last_validated_at : null,
    };
  });

  return NextResponse.json(
    {
      ok: true,
      mode: {
        clientEdition: process.env.VELOCE_CLIENT_EDITION === "1",
        localCliDisabled: process.env.AGENTIC_OS_DISABLE_LOCAL_CLI === "1",
        localFilesDisabled: process.env.AGENTIC_OS_DISABLE_LOCAL_FILES === "1",
        approvalsRequired: process.env.AGENTIC_OS_REQUIRE_APPROVALS === "1",
        providerCallsEnabled: process.env.CLIENT_PROVIDER_CALLS_ENABLED === "1",
      },
      client: {
        slug: process.env.CLIENT_SLUG || null,
        name: process.env.CLIENT_NAME || null,
      },
      credentials,
      credentialOptions,
      catalog: publicCatalogProviderOptions().map((entry) => ({
        id: entry.id,
        name: entry.name,
        customerTool: entry.customerTool,
        pipelineStage: entry.pipelineStage,
        pricingBasis: entry.pricingBasis,
        creditEstimate: entry.creditEstimate,
        status: entry.status,
        credentialMode: entry.credentialMode,
        approval: entry.approval,
        pricingSnapshotId: entry.pricingSnapshotId ?? pricingSnapshotForCredential(entry.credentialKey ?? "")?.id ?? null,
        pricingVersion: entry.pricingVersion ?? null,
        pricingVerifiedAt: entry.pricingVerifiedAt ?? null,
        pricingSourceUrl: entry.pricingSourceUrl ?? null,
        freeTier: entry.freeTier ?? null,
        costOwner: entry.costOwner ?? "client",
        modelOptions: entry.modelOptions ?? [],
        runtimePlacement: entry.runtimePlacement ?? "Tenant runtime provider adapter",
        managedCredentialAvailable: entry.managedCredentialAvailable === true,
        selectionAllowed: entry.selectionAllowed !== false,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
