import { createHash } from "node:crypto";

const WINDOW_SECONDS = 15 * 60;
const LIMIT = 5;
const MAX_BODY_BYTES = 100_000;
const attempts = new Map<string, number[]>();

function forwardedClient(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

function memoryLimit(key: string) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((time) => now - time < WINDOW_SECONDS * 1000);
  if (recent.length >= LIMIT) {
    attempts.set(key, recent);
    return false;
  }
  attempts.set(key, [...recent, now]);
  return true;
}

export function payloadTooLarge(req: Request) {
  return Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES;
}

export async function allowPublicRequest(req: Request, bucket: string) {
  const ip = forwardedClient(req);
  const hashedKey = createHash("sha256")
    .update(`${process.env.PUBLIC_RATE_LIMIT_SALT ?? "veloce-public"}:${ip}`)
    .digest("hex");
  const memoryKey = `${bucket}:${hashedKey}`;
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && serviceKey) {
    try {
      const response = await fetch(`${url}/rest/v1/rpc/consume_public_request_rate_limit`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_bucket: bucket,
          p_key: hashedKey,
          p_limit: LIMIT,
          p_window_seconds: WINDOW_SECONDS,
        }),
        cache: "no-store",
      });
      if (response.ok) return (await response.json()) === true;
      console.warn("durable public rate limiter unavailable", { bucket, status: response.status });
    } catch {
      console.warn("durable public rate limiter unreachable", { bucket });
    }
  }

  return memoryLimit(memoryKey);
}
