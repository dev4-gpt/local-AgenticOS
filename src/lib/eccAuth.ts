import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { clientRpc } from "@/lib/clientDataPlane";

export async function eccSession() {
  const user = await currentClientUser();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!user || !tenantSlug || !(await currentClientMember())) return null;
  const result = await clientRpc("client_ecc_role", { p_tenant_slug: tenantSlug });
  if (!result.ok || typeof result.value !== "string" || !["owner", "admin", "member", "viewer"].includes(result.value)) return null;
  return { userId: user.id, tenantSlug, role: result.value };
}
