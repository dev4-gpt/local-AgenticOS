import { Buffer } from "node:buffer";
import { lookup, resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateAddress } from "@/lib/clientPrivateAddress.mjs";

export { isPrivateAddress } from "@/lib/clientPrivateAddress.mjs";

export async function resolvesToPublicAddresses(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (isPrivateAddress(normalized)) return false;
  if (isIP(normalized)) return true;
  const [ipv4, ipv6] = await Promise.all([
    resolve4(normalized).catch(() => [] as string[]),
    resolve6(normalized).catch(() => [] as string[]),
  ]);
  const explicitAddresses = [...ipv4, ...ipv6];
  if (explicitAddresses.length > 0) return explicitAddresses.every((address) => !isPrivateAddress(address));

  // Some managed runtimes expose DNS through a resolver that does not return
  // results through explicit A/AAAA queries while getaddrinfo still works.
  const addresses = await lookup(normalized, { all: true, verbatim: true }).catch(() => []);
  return addresses.length > 0 && addresses.every((entry) => !isPrivateAddress(entry.address));
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
