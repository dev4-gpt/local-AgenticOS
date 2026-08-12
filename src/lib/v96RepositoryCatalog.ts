/**
 * Pinned upstream references used to derive Veloce capability traits.
 *
 * These are provenance records, not runtime dependencies. An entry may inform
 * a contract while remaining gated or operator-only.
 */

export type V96RepositoryStatus = "cataloged" | "contract-only" | "pilot" | "gated" | "operator-only" | "enabled";
export type V96RepositoryRuntime = "dependency-free" | "adapter" | "operator-worker" | "gpu-worker";
export type V96ReferenceKind = "repository" | "guide" | "service";
export type V96ActivationClass = "native-enabled" | "contract-active" | "reference-only" | "externally-gated";

export interface V96RepositoryReference {
  id: string;
  name: string;
  sourceUrl: string;
  sourceCommit: string;
  license: string;
  provenance: string;
  targetCapabilities: readonly string[];
  traits: readonly string[];
  runtime: V96RepositoryRuntime;
  executionPermissions: readonly string[];
  status: V96RepositoryStatus;
  sourceKind?: V96ReferenceKind;
  placement?: string;
  evidenceGate?: string;
  resourceUrls?: readonly string[];
  activation?: V96ActivationClass;
  implementationMapping?: string;
  activationEvidence?: string;
  rollbackRule?: string;
}

const REPOSITORY_ROWS = [
  ["agency-agents", "Agency Agents", "https://github.com/msitarzewski/agency-agents", "ebe9c99acb5c96f9468de368d8bead775387d1a7", "MIT", ["agent-library", "output-quality"], ["provider-routing", "approval"], "dependency-free", ["read-files", "run-tests", "write-review"], "enabled"],
  ["open-notebook", "Open Notebook", "https://github.com/lfnovo/open-notebook", "a7de90d38aaf18ee85fd661854d35c11e44613e2", "AGPL-3.0", ["notebook", "knowledge"], ["tenant-isolation", "provenance", "retention", "deletion-lineage"], "adapter", ["read-artifacts", "write-citations"], "enabled"],
  ["book-to-skill", "book-to-skill", "https://github.com/virgiliojr94/book-to-skill", "ae6de6521ab65777e161e7b17eb5be6987cc03b6", "MIT", ["context-compiler", "knowledge"], ["provenance", "reviewed-activation", "chunk-provenance"], "adapter", ["read-artifacts", "write-review"], "enabled"],
  ["open-seo", "OpenSEO", "https://github.com/every-app/open-seo", "bd402844fae9101da9591b8eb153871773eb3c27d", "MIT", ["seo", "research"], ["source-policy", "citations", "budget"], "adapter", ["read-public-source", "write-citations"], "gated"],
  ["scrapegraph-ai", "ScrapeGraphAI", "https://github.com/ScrapeGraphAI/Scrapegraph-ai", "27d9d289f964844a28006f6d7d1518e293fd49ff", "MIT", ["research", "seo"], ["source-policy", "citations", "ssrf-protection"], "adapter", ["read-public-source", "write-citations"], "gated"],
  ["roboflow-supervision", "Roboflow Supervision", "https://github.com/roboflow/supervision", "803378d474cd51b1eb0c1cf25c08c7ab75b1208e", "MIT", ["visual-qa", "media"], ["artifact-ownership", "visual-qa", "budget"], "operator-worker", ["read-artifacts", "write-review"], "gated"],
  ["skyreels-v2", "SkyReels V2", "https://github.com/skyworkai/skyreels-v2", "9351d13152207cc04de780e055346b08ade0b851", "Apache-2.0", ["video-generation", "media"], ["artifact-ownership", "provider-license", "approval"], "gpu-worker", ["read-artifacts", "write-review"], "gated"],
  ["omniroute", "OmniRoute", "https://github.com/diegosouzapw/OmniRoute", "297d404327cd5ac16d1bed388cbba08a15cb1fbc", "MIT", ["provider-routing"], ["model-allowlist", "budget", "audit"], "adapter", ["write-review"], "gated"],
  ["prime-agent", "Prime Agent", "https://github.com/PrimeIntellect-ai/prime-agent", "a3b3e753490d0a6ed180e905200c1a6690d78608", "MIT", ["resumable-worktree"], ["resumability", "approval", "workspace-isolation"], "operator-worker", ["read-files", "write-worktree", "run-tests"], "pilot"],
  ["strix", "Strix", "https://github.com/usestrix/strix", "7cc9fa9faa0179fc7e35111102fe3d20a9028393", "Apache-2.0", ["security-assessment"], ["target-scope", "egress-control", "approval"], "operator-worker", ["write-review"], "gated"],
  ["open-generative-ai", "Open-Generative-AI", "https://github.com/anil-matcha/open-generative-ai", "81a179ed168504562d01f2d95f91cc9798ccaabd", "MIT", ["media", "video-generation"], ["provider-license", "artifact-ownership", "approval"], "adapter", ["read-artifacts", "write-review"], "gated"],
  ["i-have-adhd", "i-have-adhd", "https://github.com/ayghri/i-have-adhd", "2ed064090711586e0c97a2fbbf15465fe8f1808b", "MIT", ["output-quality"], ["output-quality", "accessibility"], "dependency-free", ["write-review"], "enabled"],
  ["no-ai-slop", "no-ai-slop", "https://github.com/petergyang/no-ai-slop", "d30eddb9e04562234f2070b5ee63ca4649d9a05e", "MIT", ["output-quality"], ["output-quality", "provenance"], "dependency-free", ["write-review"], "enabled"],
  ["sonarqube-cli", "SonarQube CLI", "https://github.com/SonarSource/sonarqube-cli", "13c736f34ff05a973453f9f5561b976a3179c59c", "LGPL-3.0", ["security-assessment", "quality"], ["target-scope", "audit"], "operator-worker", ["read-files", "write-review"], "pilot"],
  ["shepherd", "Shepherd", "https://github.com/shepherd-agents/shepherd", "4b44f4e8822a919a74b4bf9c13d9370dbf4cd9be", "MIT", ["resumable-worktree"], ["resumability", "approval", "workspace-isolation"], "operator-worker", ["write-worktree", "write-review"], "cataloged"],
  ["qm", "QM", "https://github.com/yc-software/qm", "3cb5623a3bf470657a246d551dd0a8649decb2b4", "MIT", ["orchestration", "knowledge"], ["tenant-isolation", "audit"], "operator-worker", ["write-review"], "cataloged"],
  ["huggingface-speech-to-speech", "Hugging Face Speech-to-Speech", "https://github.com/huggingface/speech-to-speech", "759d67e48fa9ba4d8c5e87b9084342b9b6833944", "Apache-2.0", ["voice"], ["consent", "artifact-ownership", "budget"], "operator-worker", ["read-artifacts", "write-review"], "gated"],
  ["explee", "Explee / AutoGTM", "https://explee.com/", "catalog-2026-08-12", "provider-terms", ["communications"], ["consent", "budget", "approval"], "adapter", ["write-review"], "gated"],
  ["infobip", "Infobip", "https://www.infobip.com/", "catalog-2026-08-12", "provider-terms", ["communications"], ["consent", "budget", "approval"], "adapter", ["write-review"], "gated"],
  ["agent-skills", "Agent Skills", "https://github.com/addyosmani/agent-skills", "be42637c5af93fdc8526b68ec2f2651b930f316c", "MIT", ["quality", "provider-routing", "resumable-worktree"], ["output-quality", "approval", "audit"], "dependency-free", ["read-reference", "write-review"], "cataloged"],
  ["founderos-demo", "FounderOS-DEMO", "https://github.com/Bennettxai/FounderOS-DEMO", "f10c94861fc7bcfe5b73a2611c66f371421496b8", "MIT", ["control-room", "communications", "knowledge"], ["approval", "audit", "provenance"], "adapter", ["read-reference", "write-review"], "contract-only"],
  ["semantica", "Semantica", "https://github.com/semantica-agi/semantica", "9ec7959899127d3159b7672e1f3dee9415edd8bd", "Apache-2.0", ["knowledge", "research"], ["provenance", "tenant-isolation", "audit"], "adapter", ["read-reference", "write-review"], "contract-only"],
  ["wan2gp", "Wan2GP", "https://github.com/deepbeepmeep/Wan2GP", "1a4ba715a8d4941d1e6db23d48cae1cb1034008c", "Apache-2.0", ["video-generation", "media"], ["provider-license", "artifact-ownership", "budget"], "gpu-worker", ["read-artifacts", "write-review"], "gated"],
  ["ai-builder-club-skills", "AI Builder Club skills", "https://github.com/AI-Builder-Club/skills", "d4cd90f5915b10412595733a0fbdca96f65115b1", "MIT", ["quality", "resumable-worktree"], ["output-quality", "resumability", "approval"], "dependency-free", ["read-reference", "write-review"], "cataloged"],
  ["rag-anything", "RAG-Anything", "https://github.com/HKUDS/RAG-Anything", "65b7ffdeb801309d4c87b6accf81bfe5cd9b175d", "Apache-2.0", ["knowledge", "notebook"], ["provenance", "chunk-provenance", "deletion-lineage"], "adapter", ["read-artifacts", "write-citations"], "contract-only"],
  ["awesome-gpu-engineering", "Awesome GPU Engineering", "https://github.com/goabiaryan/awesome-gpu-engineering", "bb8cf16e32a780dd84e2fb1184e2b4695ed0e3b6", "CC0-1.0", ["video-generation", "media"], ["provider-license", "budget", "audit"], "dependency-free", ["read-reference", "write-review"], "cataloged"],
  ["headroom", "Headroom", "https://github.com/headroomlabs-ai/headroom", "941c25d31e6c6e0b436c307cbe212771ff76b45f", "Apache-2.0", ["provider-routing", "quality"], ["model-allowlist", "budget", "audit"], "adapter", ["write-review"], "pilot"],
  ["ragflow", "RAGFlow", "https://github.com/infiniflow/ragflow", "91fd114783a2153e2d08fc98ff81338546692c5b", "Apache-2.0", ["knowledge", "research"], ["tenant-isolation", "provenance", "retention"], "adapter", ["read-artifacts", "write-citations"], "contract-only"],
  ["google-agents-cli", "Google agents-cli", "https://github.com/google/agents-cli", "5a306f8956cb1eeae69f9709de0e4d61b44e11e7", "Apache-2.0", ["resumable-worktree", "quality"], ["workspace-isolation", "approval", "output-quality"], "operator-worker", ["read-reference", "write-review", "run-tests"], "operator-only"],
  ["cognee", "Cognee", "https://github.com/topoteretes/cognee", "4b9dd362625dfd3621c344e571a86f5bc7a55ee8", "Apache-2.0", ["knowledge", "notebook"], ["provenance", "chunk-provenance", "retention"], "adapter", ["read-artifacts", "write-citations"], "contract-only"],
  ["ai-engineering-from-scratch", "AI Engineering from Scratch", "https://github.com/rohitg00/ai-engineering-from-scratch", "7c3323508a5186739feecd76838ba1ae962c736f", "MIT", ["quality", "provider-routing"], ["output-quality", "audit"], "dependency-free", ["read-reference", "write-review"], "cataloged"],
  ["company-research-agent", "Company Research Agent", "https://github.com/guy-hartstein/company-research-agent", "52c904c8169f0a36ee8c1de46d5745aee731a0b4", "MIT", ["research", "knowledge"], ["source-policy", "citations", "confidence"], "adapter", ["read-public-source", "write-citations"], "contract-only"],
  ["gstack", "gstack", "https://github.com/garrytan/gstack", "94993f74012782fd94416dd44b8314f6363a13a4", "MIT", ["resumable-worktree", "quality"], ["workspace-isolation", "approval", "output-quality"], "operator-worker", ["read-files", "write-review", "run-tests"], "operator-only"],
  ["agents-md", "AGENTS.md", "https://github.com/agentsmd/agents.md", "d1ac7f063d20e70015ed6732664049ae4ba9d74e", "MIT", ["resumable-worktree", "quality"], ["workspace-isolation", "provenance", "approval"], "dependency-free", ["read-reference", "write-review"], "cataloged"],
  ["500-ai-agents-projects", "500 AI Agents Projects", "https://github.com/ashishpatel26/500-AI-Agents-Projects", "9beeb721c2af551bacaab827a76bddaecaa0ca5e", "MIT", ["control-room", "orchestration"], ["provenance", "output-quality"], "dependency-free", ["read-reference", "write-review"], "cataloged"],
  ["appsmith", "Appsmith", "https://github.com/appsmithorg/appsmith", "b4bd6358558119e980433367781cb40a74b35d88", "Apache-2.0", ["control-room", "operator-console"], ["tenant-isolation", "approval", "audit"], "adapter", ["write-review"], "contract-only"],
  ["founderos-agent-stack", "FounderOS Agent Stack", "https://founderos-agent-stack.vercel.app/", "catalog-2026-08-12", "provider-terms", ["control-room", "orchestration"], ["approval", "audit", "budget"], "adapter", ["read-reference", "write-review"], "contract-only"],
  ["ai-loops-guide", "AI Loops Worth Stealing", "https://learnaiwithmariah.com/guides/ai-loops-worth-stealing/", "catalog-2026-08-12", "author-terms", ["orchestration", "quality"], ["resumability", "approval", "output-quality"], "dependency-free", ["read-reference", "write-review"], "cataloged"],
  ["groq-whisper", "Groq Speech-to-Text", "https://console.groq.com/docs/speech-to-text", "catalog-2026-08-12", "provider-terms", ["voice", "speech-to-text"], ["tenant-isolation", "budget", "provenance", "audit"], "adapter", ["read-audio", "write-transcript"], "pilot"],
] as const;

const REFERENCE_METADATA: Record<string, { sourceKind: V96ReferenceKind; placement: string; evidenceGate: string; resourceUrls: readonly string[]; activation?: V96ActivationClass; implementationMapping?: string; activationEvidence?: string; rollbackRule?: string }> = {
  "agent-skills": { sourceKind: "repository", placement: "Build, Quality, Review", evidenceGate: "Contract review and local checker evidence", resourceUrls: ["https://github.com/addyosmani/agent-skills"], activation: "native-enabled", implementationMapping: "Veloce output-quality and reviewed-plan policies", activationEvidence: "Focused capability and quality suites", rollbackRule: "Remove the trait mapping from the server manifest" },
  "founderos-demo": { sourceKind: "repository", placement: "Control Room", evidenceGate: "Tenant-safe adapter and approval evidence", resourceUrls: ["https://github.com/Bennettxai/FounderOS-DEMO"] },
  semantica: { sourceKind: "repository", placement: "Knowledge, Research", evidenceGate: "Tenant graph isolation and deletion lineage", resourceUrls: ["https://github.com/semantica-agi/semantica"] },
  wan2gp: { sourceKind: "repository", placement: "Media, GPU worker", evidenceGate: "GPU cost, license, VRAM, rollback, and quality bundle", resourceUrls: ["https://github.com/deepbeepmeep/Wan2GP"] },
  "ai-builder-club-skills": { sourceKind: "repository", placement: "Build, Quality", evidenceGate: "Local verification loop evidence", resourceUrls: ["https://github.com/AI-Builder-Club/skills"], activation: "native-enabled", implementationMapping: "Veloce focused-checker and evidence-loop policy", activationEvidence: "Focused tests, typecheck, lint, and build", rollbackRule: "Remove the trait mapping from the server manifest" },
  "rag-anything": { sourceKind: "repository", placement: "Knowledge, Notebook", evidenceGate: "Multimodal provenance and retention evidence", resourceUrls: ["https://github.com/HKUDS/RAG-Anything"] },
  "awesome-gpu-engineering": { sourceKind: "repository", placement: "GPU infrastructure", evidenceGate: "Reference review only", resourceUrls: ["https://github.com/goabiaryan/awesome-gpu-engineering"] },
  headroom: { sourceKind: "repository", placement: "Quality, Routing", evidenceGate: "Quality parity, token savings, and cost trace", resourceUrls: ["https://github.com/headroomlabs-ai/headroom"], activation: "native-enabled", implementationMapping: "Veloce dependency-free context-compression routing trait", activationEvidence: "Compression contract suite plus authenticated local/cloud provider smoke", rollbackRule: "Remove context-compression from CLIENT_ENABLED_TRAITS" },
  ragflow: { sourceKind: "repository", placement: "Knowledge, Research", evidenceGate: "External-service tenant isolation and export/delete evidence", resourceUrls: ["https://github.com/infiniflow/ragflow"] },
  "google-agents-cli": { sourceKind: "repository", placement: "Operator Build", evidenceGate: "Disposable worktree and review-before-apply evidence", resourceUrls: ["https://github.com/google/agents-cli"] },
  cognee: { sourceKind: "repository", placement: "Knowledge", evidenceGate: "Graph ownership, retention, and deletion evidence", resourceUrls: ["https://github.com/topoteretes/cognee"] },
  "ai-engineering-from-scratch": { sourceKind: "repository", placement: "Engineering reference", evidenceGate: "Reference review only", resourceUrls: ["https://github.com/rohitg00/ai-engineering-from-scratch"] },
  "company-research-agent": { sourceKind: "repository", placement: "Research", evidenceGate: "Citation, confidence, and source-policy parity", resourceUrls: ["https://github.com/guy-hartstein/company-research-agent"] },
  gstack: { sourceKind: "repository", placement: "Operator Workspaces", evidenceGate: "Disposable worktree and bounded command evidence", resourceUrls: ["https://github.com/garrytan/gstack"] },
  "agents-md": { sourceKind: "repository", placement: "Workspace provenance", evidenceGate: "Instruction scope and permission review", resourceUrls: ["https://github.com/agentsmd/agents.md"], activation: "native-enabled", implementationMapping: "Veloce workspace provenance and instruction-scope validation", activationEvidence: "Focused contract and workspace policy suites", rollbackRule: "Disable workspace provenance mapping in the server manifest" },
  "500-ai-agents-projects": { sourceKind: "repository", placement: "Control Room discovery", evidenceGate: "Use-case review only", resourceUrls: ["https://github.com/ashishpatel26/500-AI-Agents-Projects"] },
  appsmith: { sourceKind: "repository", placement: "Operator Console", evidenceGate: "Separate deployment and tenant auth review", resourceUrls: ["https://github.com/appsmithorg/appsmith"] },
  "founderos-agent-stack": { sourceKind: "service", placement: "Control Room reference", evidenceGate: "Token-free contract review", resourceUrls: ["https://founderos-agent-stack.vercel.app/"] },
  "ai-loops-guide": { sourceKind: "guide", placement: "Orchestration reference", evidenceGate: "Reference review only", resourceUrls: ["https://learnaiwithmariah.com/guides/ai-loops-worth-stealing/"], activation: "native-enabled", implementationMapping: "Veloce queue, retry, checkpoint, and approval traits", activationEvidence: "Existing runtime lifecycle and idempotency suites", rollbackRule: "Remove orchestration trait mapping from the server manifest" },
  "groq-whisper": { sourceKind: "service", placement: "All recorded microphone inputs", evidenceGate: "Server-only key, bounded upload, tenant auth, rate/budget evidence, and local/cloud smoke", resourceUrls: ["https://console.groq.com/docs/speech-to-text", "https://console.groq.com/docs/models"] },
};

const REPOSITORIES: readonly V96RepositoryReference[] = REPOSITORY_ROWS.map(([id, name, sourceUrl, sourceCommit, license, targetCapabilities, traits, runtime, executionPermissions, status]) => {
  const metadata = REFERENCE_METADATA[id] ?? { sourceKind: "repository" as const, placement: "Existing Veloce capability surface", evidenceGate: "Existing capability evidence", resourceUrls: [sourceUrl] };
  const activation = metadata.activation
    ?? (status === "enabled" ? "native-enabled" : status === "contract-only" ? "contract-active" : status === "gated" || status === "operator-only" ? "externally-gated" : "reference-only");
  return {
    id, name, sourceUrl, sourceCommit, license,
    provenance: "V96 STAR-plan catalog; pinned upstream reference or dated provider record",
    targetCapabilities, traits, runtime, executionPermissions, status,
    ...metadata,
    activation,
    ...(activation === "native-enabled" ? {
      implementationMapping: metadata.implementationMapping ?? "Existing Veloce native capability policy",
      activationEvidence: metadata.activationEvidence ?? "Existing focused capability evidence",
      rollbackRule: metadata.rollbackRule ?? "Remove the native mapping from the server manifest",
    } : {}),
  };
});

export const V96_REPOSITORY_CATALOG: readonly V96RepositoryReference[] = REPOSITORIES;

export function validateV96RepositoryReference(reference: Partial<V96RepositoryReference>) {
  const errors: string[] = [];
  if (!reference.id || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(reference.id)) errors.push("repository id is invalid");
  if (!reference.sourceUrl || !/^https:\/\/[^\s?#]+$/.test(reference.sourceUrl)) errors.push("repository sourceUrl must be a clean https URL");
  if (!reference.sourceCommit || (!/^[a-f0-9]{7,64}$/i.test(reference.sourceCommit) && !/^catalog-\d{4}-\d{2}-\d{2}$/.test(reference.sourceCommit))) errors.push("repository sourceCommit must be pinned");
  if (!reference.license?.trim() || ["unknown", "review-required", "unverified"].includes(reference.license.trim().toLowerCase())) errors.push("repository license must be known");
  if (!reference.provenance?.trim()) errors.push("repository provenance is required");
  if (!reference.targetCapabilities?.length) errors.push("repository targetCapabilities are required");
  if (!reference.traits?.length) errors.push("repository traits are required");
  if (!reference.executionPermissions?.length) errors.push("repository executionPermissions are required");
  if (!reference.runtime || !["dependency-free", "adapter", "operator-worker", "gpu-worker"].includes(reference.runtime)) errors.push("repository runtime class is required");
  if (!reference.status || !["cataloged", "contract-only", "pilot", "gated", "operator-only", "enabled"].includes(reference.status)) errors.push("repository status is required");
  if (reference.sourceKind && !["repository", "guide", "service"].includes(reference.sourceKind)) errors.push("repository sourceKind is invalid");
  if (reference.resourceUrls?.some((url) => !/^https:\/\/[^\s?]+$/.test(url))) errors.push("repository resourceUrls must be clean https URLs");
  if (!reference.resourceUrls?.length) errors.push("repository resourceUrls are required");
  if (!reference.placement?.trim()) errors.push("repository placement is required");
  if (!reference.evidenceGate?.trim()) errors.push("repository evidenceGate is required");
  if (reference.activation && !["native-enabled", "contract-active", "reference-only", "externally-gated"].includes(reference.activation)) errors.push("repository activation class is invalid");
  if (reference.activation === "native-enabled") {
    if (!reference.implementationMapping?.trim()) errors.push("native-enabled reference requires implementationMapping");
    if (!reference.activationEvidence?.trim()) errors.push("native-enabled reference requires activationEvidence");
    if (!reference.rollbackRule?.trim()) errors.push("native-enabled reference requires rollbackRule");
  }
  return errors;
}

export function validateV96RepositoryCatalog(catalog: readonly V96RepositoryReference[] = V96_REPOSITORY_CATALOG) {
  return catalog.flatMap((reference) => validateV96RepositoryReference(reference).map((error) => `${reference.id}: ${error}`));
}
