import { createHash } from "node:crypto";
import { parseClientSourcePackShape, type ClientSourcePackShapeItem } from "@/lib/clientSourcePackShape";

export { safeClientSourceUrl } from "@/lib/clientSourcePackShape";

export type ClientSourcePackItem = ClientSourcePackShapeItem & { sourceImportKey: string };

export type ClientSourcePack = {
  startUrl: string;
  sources: ClientSourcePackItem[];
  skipped: string[];
  skippedCount: number;
  linkCount: number;
};

export function parseClientSourcePack(input: unknown): ClientSourcePack {
  const pack = parseClientSourcePackShape(input);
  return {
    ...pack,
    sources: pack.sources.map((source) => ({
      ...source,
      sourceImportKey: createHash("sha256").update(`${pack.startUrl}\n${source.sourceUrl}\n${source.tab ?? ""}`).digest("hex"),
    })),
  };
}
