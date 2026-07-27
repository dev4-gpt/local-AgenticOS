import { NextResponse } from "next/server";
import { CAPABILITIES } from "@/lib/capabilities";
import { currentClientMember } from "@/lib/clientAuth";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";

export const dynamic = "force-dynamic";

export async function GET() {
  const clientEdition = process.env.VELOCE_CLIENT_EDITION === "1";
  if (clientEdition && !(await currentClientMember())) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  const capabilities = CAPABILITIES
    .filter((capability) => !clientEdition || capability.audience === "built-in")
    .filter((capability) => !clientEdition || clientCapabilityEnabled(capability.id))
    .map((capability) => clientEdition ? { ...capability, destination: undefined } : capability);
  return NextResponse.json({ ok: true, capabilities });
}
