import { NextResponse } from "next/server";
import { openRouterKey, providerEnvKey } from "@/lib/providerKeys";
import { clientProviderEnabled } from "@/lib/clientRuntimePolicy";
import { CLIENT_CREDENTIAL_OPTIONS } from "@/lib/clientCredentialCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const credentials = CLIENT_CREDENTIAL_OPTIONS.filter((item) => clientProviderEnabled(item.key)).map((item) => {
    const value = item.key === "OPENROUTER_API_KEY" ? openRouterKey() : providerEnvKey(item.key);
    return {
      key: item.key,
      label: item.label,
      connected: Boolean(value),
      secret: item.secret,
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
      },
      client: {
        slug: process.env.CLIENT_SLUG || null,
        name: process.env.CLIENT_NAME || null,
      },
      credentials,
      credentialOptions: CLIENT_CREDENTIAL_OPTIONS,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
