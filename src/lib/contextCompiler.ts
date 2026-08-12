import { CAPABILITY_CONTRACT_VERSION, isValidCapabilityTenantSlug } from "@/lib/capabilityContracts";
import { resolveCapabilityTraits, traitBundleMetadata } from "@/lib/capabilityTraits";

export interface ContextCompileRequest {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  tenantSlug: string;
  sourceArtifactId: string;
  sourceText: string;
  sourceHash: string;
  license: string;
  provenance: string;
  compilerVersion: string;
  maxChunkChars: number;
}

export interface CompiledContextChunk {
  id: string;
  heading: string;
  content: string;
  sourceArtifactId: string;
  sourceHash: string;
}

export interface CompiledContextSkillManifest {
  id: string;
  tenantSlug: string;
  sourceArtifactId: string;
  sourceHash: string;
  license: string;
  provenance: string;
  compilerVersion: string;
  allowedTools: readonly ["read-artifacts", "read-files", "write-review"];
  activation: "review_required";
}

export interface CompiledContextResult {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  sourceArtifactId: string;
  sourceHash: string;
  compilerVersion: string;
  sections: readonly { heading: string; firstParagraph: string }[];
  glossary: readonly { term: string; definition: string }[];
  chunks: readonly CompiledContextChunk[];
  skillManifest: CompiledContextSkillManifest;
  traitSnapshot: ReturnType<typeof traitBundleMetadata>;
}

export function validateContextCompileRequest(input: Partial<ContextCompileRequest>) {
  const errors: string[] = [];
  if (input.contractVersion !== CAPABILITY_CONTRACT_VERSION) errors.push("contractVersion must be v96");
  if (!input.tenantSlug || !isValidCapabilityTenantSlug(input.tenantSlug)) errors.push("tenantSlug is invalid");
  if (!input.sourceArtifactId?.trim()) errors.push("sourceArtifactId is required");
  if (!input.sourceText?.trim() || input.sourceText.length > 500_000) errors.push("sourceText must contain 1 to 500000 characters");
  if (!/^[a-f0-9]{16,128}$/i.test(input.sourceHash ?? "")) errors.push("sourceHash must be a hex digest");
  if (!input.license?.trim()) errors.push("license is required");
  if (!input.provenance?.trim()) errors.push("provenance is required");
  if (!input.compilerVersion?.trim()) errors.push("compilerVersion is required");
  if (!Number.isInteger(input.maxChunkChars) || (input.maxChunkChars ?? 0) < 500 || (input.maxChunkChars ?? 0) > 12000) errors.push("maxChunkChars must be between 500 and 12000");
  return errors;
}

export function compileContextArtifact(input: ContextCompileRequest): CompiledContextResult {
  const errors = validateContextCompileRequest(input);
  if (errors.length) throw new Error(`context compilation rejected: ${errors.join("; ")}`);
  const source = input.sourceText.replace(/\r\n?/g, "\n").trim();
  const sections = parseSections(source);
  const chunks = sections.flatMap((section) => splitSection(section.heading, section.content, input.maxChunkChars, input.sourceArtifactId, input.sourceHash));
  const glossary = sections
    .filter((section) => section.heading && section.content)
    .slice(0, 32)
    .map((section) => ({ term: section.heading.slice(0, 120), definition: firstParagraph(section.content).slice(0, 500) }));
  const skillId = `compiled-${input.tenantSlug}-${stableHash(`${input.sourceArtifactId}|${input.sourceHash}|${input.compilerVersion}`)}`.slice(0, 63);
  const traitSnapshot = traitBundleMetadata(resolveCapabilityTraits({ capability: "context-compiler", provider: "local", surface: "notebook" }));
  return {
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    sourceArtifactId: input.sourceArtifactId,
    sourceHash: input.sourceHash,
    compilerVersion: input.compilerVersion,
    sections: sections.map((section) => ({ heading: section.heading, firstParagraph: firstParagraph(section.content) })),
    glossary,
    chunks,
    traitSnapshot,
    skillManifest: {
      id: skillId,
      tenantSlug: input.tenantSlug,
      sourceArtifactId: input.sourceArtifactId,
      sourceHash: input.sourceHash,
      license: input.license.trim().slice(0, 240),
      provenance: input.provenance.trim().slice(0, 500),
      compilerVersion: input.compilerVersion.trim().slice(0, 120),
      allowedTools: ["read-artifacts", "read-files", "write-review"],
      activation: "review_required",
    },
  };
}

function parseSections(source: string) {
  const matches = [...source.matchAll(/^(#{1,6})\s+(.+)$/gm)];
  if (!matches.length) return [{ heading: "Source", content: source }];
  return matches.map((match, index) => ({
    heading: match[2].trim().slice(0, 240),
    content: source.slice(match.index! + match[0].length, matches[index + 1]?.index ?? source.length).trim(),
  })).filter((section) => section.content.length > 0);
}

function firstParagraph(content: string) {
  return content.split(/\n\s*\n/).map((value) => value.trim()).find(Boolean) ?? "";
}

function splitSection(heading: string, content: string, maxChars: number, sourceArtifactId: string, sourceHash: string): CompiledContextChunk[] {
  const paragraphs = content.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
  const chunks: CompiledContextChunk[] = [];
  let current = "";
  const push = () => {
    if (!current) return;
    chunks.push({ id: `chunk-${stableHash(`${sourceArtifactId}|${sourceHash}|${heading}|${chunks.length}|${current}`)}`, heading, content: current, sourceArtifactId, sourceHash });
    current = "";
  };
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) push();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  push();
  return chunks;
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}
