function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function ipv6Groups(address) {
  let value = address.toLowerCase().replace(/^\[|\]$/g, "");
  const ipv4Tail = value.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4Tail) {
    const privateTail = isPrivateIpv4(ipv4Tail[1]);
    if (privateTail === null) return null;
    const octets = ipv4Tail[1].split(".").map(Number);
    value = value.slice(0, -ipv4Tail[1].length) + `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const pieces = value.split("::");
  if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(":") : [];
  const zeros = pieces.length === 2 ? 8 - left.length - right.length : 0;
  if (zeros < 0 || (pieces.length === 1 && left.length !== 8)) return null;
  const groups = [...left, ...Array(zeros).fill("0"), ...right].map((part) => /^[0-9a-f]{1,4}$/.test(part) ? Number.parseInt(part, 16) : NaN);
  return groups.length === 8 && groups.every(Number.isFinite) ? groups : null;
}

export function isPrivateAddress(hostname) {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!normalized || normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".internal")) return true;
  const ipv4 = isPrivateIpv4(normalized);
  if (ipv4 !== null) return ipv4;
  if (!normalized.includes(":")) return false;
  const groups = ipv6Groups(normalized);
  if (!groups) return true;
  if (groups.every((part) => part === 0) || (groups.slice(0, 7).every((part) => part === 0) && groups[7] === 1)) return true;
  if ((groups[0] & 0xfe00) === 0xfc00 || (groups[0] & 0xffc0) === 0xfe80 || (groups[0] & 0xff00) === 0xff00) return true;
  if (groups.slice(0, 5).every((part) => part === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
    const mapped = `${groups[6] >>> 8}.${groups[6] & 255}.${groups[7] >>> 8}.${groups[7] & 255}`;
    return isPrivateIpv4(mapped) === true;
  }
  return false;
}
