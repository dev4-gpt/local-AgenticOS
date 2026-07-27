import { safePublicUrl } from "@/lib/clientSeoAdapter";

export async function runClientDeliveryAdapter(input: {
  action: string;
  destination?: string;
  requestId?: string;
  artifactIds: string[];
}) {
  if (input.action === "record" || input.action === "review") {
    return { ok: true as const, executed: false, adapter: "approval-record" };
  }
  if (input.action !== "handoff" && input.action !== "release") return { ok: false as const, status: 400, error: "delivery_action_not_supported" };
  const destination = safeDeliveryUrl(input.destination ?? "");
  if (!destination) return { ok: false as const, status: 400, error: "delivery_destination_not_allowed" };
  const response = await fetch(destination, {
    method: "POST",
    headers: { "content-type": "application/json", "x-veloce-delivery": "approved" },
    body: JSON.stringify({ type: "veloce_delivery", action: input.action, requestId: input.requestId ?? null, artifactIds: input.artifactIds.slice(0, 20) }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!response?.ok) return { ok: false as const, status: response?.status ?? 503, error: "delivery_destination_failed" };
  return { ok: true as const, executed: true, adapter: "approved-webhook", status: response.status };
}

function safeDeliveryUrl(value: string) {
  const allowlist = (process.env.CLIENT_DELIVERY_ALLOWED_HOSTS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (allowlist.length === 0) return null;
  const safeUrl = safePublicUrl(value, allowlist);
  if (!safeUrl) return null;
  try {
    const parsed = new URL(safeUrl);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
