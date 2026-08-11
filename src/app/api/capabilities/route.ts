import { NextResponse } from "next/server";
import { CAPABILITIES } from "@/lib/capabilities";
import { currentClientMember } from "@/lib/clientAuth";
import { clientCapabilityEnabled, clientCapabilityExposure } from "@/lib/clientRuntimePolicy";

export const dynamic = "force-dynamic";

export async function GET() {
  const clientEdition = process.env.VELOCE_CLIENT_EDITION === "1";
  if (clientEdition && !(await currentClientMember())) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  const capabilities = CAPABILITIES
    .filter((capability) => !clientEdition || capability.audience === "built-in")
    .map((capability) => ({ capability, exposure: clientEdition ? clientCapabilityExposure(capability.id) : "enabled" as const }))
    .filter(({ exposure }) => !clientEdition || exposure !== "hidden")
    .map(({ capability, exposure }) => clientEdition ? { ...capability, destination: undefined, exposure } : capability);
  return NextResponse.json({ ok: true, capabilities });
}
