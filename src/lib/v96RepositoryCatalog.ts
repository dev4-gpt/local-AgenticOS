/**
 * Pinned upstream references used to derive Veloce capability traits.
 *
 * These are provenance records, not runtime dependencies. An entry may inform
 * a contract while remaining gated or operator-only.
 */

export type V96RepositoryStatus = "cataloged" | "contract-only" | "pilot" | "gated" | "enabled";
export type V96RepositoryRuntime = "dependency-free" | "adapter" | "operator-worker" | "gpu-worker";

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
] as const;

const REPOSITORIES: readonly V96RepositoryReference[] = REPOSITORY_ROWS.map(([id, name, sourceUrl, sourceCommit, license, targetCapabilities, traits, runtime, executionPermissions, status]) => ({
  id, name, sourceUrl, sourceCommit, license,
  provenance: "V96 STAR-plan catalog; pinned upstream reference or dated provider record",
  targetCapabilities, traits, runtime, executionPermissions, status,
}));

export const V96_REPOSITORY_CATALOG: readonly V96RepositoryReference[] = REPOSITORIES;

export function validateV96RepositoryReference(reference: Partial<V96RepositoryReference>) {
  const errors: string[] = [];
  if (!reference.id || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(reference.id)) errors.push("repository id is invalid");
  if (!reference.sourceUrl || !/^https:\/\/[^\s]+$/.test(reference.sourceUrl)) errors.push("repository sourceUrl must be https");
  if (!reference.sourceCommit || (!/^[a-f0-9]{7,64}$/i.test(reference.sourceCommit) && !/^catalog-\d{4}-\d{2}-\d{2}$/.test(reference.sourceCommit))) errors.push("repository sourceCommit must be pinned");
  if (!reference.license?.trim()) errors.push("repository license is required");
  if (!reference.provenance?.trim()) errors.push("repository provenance is required");
  if (!reference.targetCapabilities?.length) errors.push("repository targetCapabilities are required");
  if (!reference.traits?.length) errors.push("repository traits are required");
  if (!reference.executionPermissions) errors.push("repository executionPermissions are required");
  return errors;
}

export function validateV96RepositoryCatalog(catalog: readonly V96RepositoryReference[] = V96_REPOSITORY_CATALOG) {
  return catalog.flatMap((reference) => validateV96RepositoryReference(reference).map((error) => `${reference.id}: ${error}`));
}
