import { NextResponse } from "next/server";
import { CAPABILITIES } from "@/lib/capabilities";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";

export const dynamic = "force-dynamic";

export async function GET() {
  const clientEdition = process.env.VELOCE_CLIENT_EDITION === "1";
  const capabilities = CAPABILITIES
    .filter((capability) => !clientEdition || capability.audience === "built-in")
    .filter((capability) => !clientEdition || clientCapabilityEnabled(capability.id))
    .map((capability) => clientEdition ? { ...capability, destination: undefined } : capability);
  return NextResponse.json({ ok: true, capabilities });
}
