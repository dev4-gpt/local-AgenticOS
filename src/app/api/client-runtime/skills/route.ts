import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit } from "@/lib/clientDataPlane";
import { V96_AGENCY_AGENTS_REVISION, V96_CURATED_SKILL_PACK } from "@/lib/v96SkillPack";
import { validateV96SkillManifest } from "@/lib/v96Contracts";
import { clientCapabilityEnabled, clientConfiguredList } from "@/lib/clientRuntimePolicy";
import { clientReadyPlaybooks } from "@/lib/clientPlaybooks";
import { eccCatalog, ECC_ADAPTERS, ECC_DEPARTMENTS, ECC_REVISION } from "@/lib/eccCatalog";

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
    ecc: { revision: ECC_REVISION, components: eccCatalog(clientCapabilityEnabled("ecc-workflows")), adapters: ECC_ADAPTERS, departments: ECC_DEPARTMENTS },
    // Pinned upstream revision, so a role's provenance is checkable rather than
    // asserted.
    sourceRevision: V96_AGENCY_AGENTS_REVISION,
    // Two filters, for two different reasons.
    //
    // Local-lane roles are operator-only: a tenant has no local model, so
    // publishing one would offer a client something that cannot run. The pack
    // keeps them; this route does not hand them out.
    //
    // The manifest check is defence in depth. tests/skill-pack-surface.spec.ts
    // is the real gate and fails the build on an unsound role, but a role that
    // claims a tool outside the permitted vocabulary must not reach a client
    // even if that test is ever skipped or the pack is edited in a hurry.
    roles: V96_CURATED_SKILL_PACK.filter((role) => role.modelLane === "approved-provider"
      && validateV96SkillManifest(role).length === 0).map((role) => ({
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
    playbooks: clientReadyPlaybooks(clientConfiguredList("CLIENT_ENABLED_CAPABILITIES")).map((playbook) => ({
      id: playbook.id, label: playbook.label, description: playbook.description,
      skillIds: playbook.skillIds, requiredTraits: playbook.requiredTraits,
      riskClass: playbook.riskClass, approval: playbook.approval, outputType: playbook.outputType,
      supportedSurfaces: playbook.supportedSurfaces,
    })),
  }, { headers: { "cache-control": "private, no-store" } });
}

function fail(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "private, no-store" } });
}
