import { eccSecretLike } from "@/lib/eccSafety";

export type EccLesson = { summary: string; trigger: string; action: string; evidenceReferences: string[]; sourceHashes: string[] };
export function parseEccLesson(value: unknown): EccLesson | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (Object.keys(c).some(key => !["summary", "trigger", "action", "evidenceReferences", "sourceHashes"].includes(key))) return null;
  if ([c.summary, c.trigger, c.action].some(text => typeof text !== "string" || !text.trim() || text.length > 2000)) return null;
  if (!Array.isArray(c.evidenceReferences) || !c.evidenceReferences.length || c.evidenceReferences.length > 20 || c.evidenceReferences.some(ref => typeof ref !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9:._/#-]{0,199}$/.test(ref))) return null;
  if (!Array.isArray(c.sourceHashes) || !c.sourceHashes.length || c.sourceHashes.length > 20 || c.sourceHashes.some(hash => typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash))) return null;
  if (Buffer.byteLength(JSON.stringify(c), "utf8") > 12000 || eccSecretLike(JSON.stringify(c))) return null;
  return { summary: String(c.summary), trigger: String(c.trigger), action: String(c.action), evidenceReferences: c.evidenceReferences as string[], sourceHashes: c.sourceHashes as string[] };
}

export async function readEccBody(request: Request, allowed: string[]) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength; if (size > 16000) { await reader.cancel(); return null; }
      chunks.push(chunk.value);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).some(key => !allowed.includes(key)) ? value as Record<string, unknown> : null;
  } catch { return null; } finally { reader.releaseLock(); }
}
