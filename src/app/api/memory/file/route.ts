import { NextResponse } from "next/server";
import { readVaultDocument } from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rel = new URL(req.url).searchParams.get("path") ?? "";
  if (!rel) return NextResponse.json({ error: "missing path" }, { status: 400 });
  const document = await readVaultDocument(rel);
  if (!document) return NextResponse.json({ error: "not found" }, { status: 404 });
  const filename = encodeURIComponent(document.filename);
  return new Response(new Uint8Array(document.data), {
    headers: {
      "content-type": document.contentType,
      "content-disposition": `inline; filename*=UTF-8''${filename}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
