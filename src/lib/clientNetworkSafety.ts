import { isIP } from "node:net";
import { Buffer } from "node:buffer";
import { lookup, resolve4, resolve6 } from "node:dns/promises";

export function isPrivateAddress(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized || normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".internal")) return true;
  const version = isIP(normalized);
  if (version === 4) {
    const octets = normalized.split(".").map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (version === 6) {
    if (normalized.startsWith("::ffff:")) {
      const mappedIpv4 = normalized.slice("::ffff:".length);
      return isIP(mappedIpv4) === 4 ? isPrivateAddress(mappedIpv4) : true;
    }
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd")
      || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  return false;
}

export async function resolvesToPublicAddresses(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (isPrivateAddress(normalized)) return false;
  if (isIP(normalized)) return true;
  const addresses = await lookup(normalized, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length > 0) return addresses.every((entry) => !isPrivateAddress(entry.address));

  // Some managed runtimes expose DNS through a resolver that does not return
  // results through getaddrinfo while explicit A/AAAA lookups still work.
  const [ipv4, ipv6] = await Promise.all([
    resolve4(normalized).catch(() => [] as string[]),
    resolve6(normalized).catch(() => [] as string[]),
  ]);
  const fallbackAddresses = [...ipv4, ...ipv6];
  return fallbackAddresses.length > 0 && fallbackAddresses.every((address) => !isPrivateAddress(address));
}

export async function readBoundedResponseBytes(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length <= maxBytes ? bytes : null;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}
