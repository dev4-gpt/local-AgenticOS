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

export function payloadTooLarge(req: Request, maxBytes = MAX_BODY_BYTES) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

export async function readPublicJsonBody(req: Request, maxBytes = MAX_BODY_BYTES): Promise<
  { ok: true; value: unknown } | { ok: false; error: "too_large" | "invalid_json" }
> {
  if (payloadTooLarge(req, maxBytes)) return { ok: false, error: "too_large" };
  if (!req.body) return { ok: false, error: "invalid_json" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, error: "too_large" };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, error: "invalid_json" };
  } finally {
    reader.releaseLock();
  }
}

export async function allowPublicRequest(req: Request, bucket: string, requireDurable = false) {
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

  if (requireDurable) return false;

  return memoryLimit(memoryKey);
}
