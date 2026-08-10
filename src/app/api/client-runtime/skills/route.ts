import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit } from "@/lib/clientDataPlane";
import { V90_AGENCY_AGENTS_REVISION, V90_CURATED_SKILL_PACK } from "@/lib/v90SkillPack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only, and deliberately separate from /api/integrations. That route also
// writes credentials into the operator's own config file, so it must never be
// reachable from a client session; this one exposes the curated role contracts
// and nothing else.
//
// The manifests are static and Veloce-authored, which is the whole point: the
// client cloud receives reviewed role contracts, never arbitrary third-party
// prompt files.

export async function GET() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return fail("not_authenticated", 401);
  const rate = await checkClientRuntimeRateLimit("skills-read", 60, 900);
  if (!rate.ok) return fail("runtime_limit_unavailable", 503);
  if (!rate.allowed) return fail("runtime_rate_limited", 429);

  return NextResponse.json({
    ok: true,
    // Pinned upstream revision, so a role's provenance is checkable rather than
    // asserted.
    sourceRevision: V90_AGENCY_AGENTS_REVISION,
    // Roles on the local model lane are operator-only: a tenant has no local
    // model, so publishing one would offer a client something that cannot run.
    // The pack keeps them; this route does not hand them out.
    roles: V90_CURATED_SKILL_PACK.filter((role) => role.modelLane === "approved-provider").map((role) => ({
      id: role.id,
      label: role.label,
      sourceRepository: role.sourceRepository,
      sourceCommit: role.sourceCommit,
      license: role.license,
      supportedSurfaces: role.supportedSurfaces,
      allowedContext: role.allowedContext,
      allowedTools: role.allowedTools,
      modelLane: role.modelLane,
      budgetClass: role.budgetClass,
      deliverable: role.deliverable,
      approval: role.approval,
    })),
  }, { headers: { "cache-control": "private, no-store" } });
}

function fail(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "private, no-store" } });
}
