import { NextResponse } from "next/server";
import { saveVaultRoot, vaultSetupStatus } from "@/lib/vaultSetup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(vaultSetupStatus());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const vaultRoot = typeof body?.vaultRoot === "string" ? body.vaultRoot : "";
    if (!vaultRoot.trim()) {
      return NextResponse.json({ ok: false, error: "Missing vaultRoot." }, { status: 400 });
    }
    return NextResponse.json(await saveVaultRoot(vaultRoot));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save vault." },
      { status: 400 },
    );
  }
}
