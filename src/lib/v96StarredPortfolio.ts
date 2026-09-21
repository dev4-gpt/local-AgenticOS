import { V96_REPOSITORY_CATALOG, type V96ActivationClass, type V96RepositoryRuntime } from "@/lib/v96RepositoryCatalog";

export const V96_STARRED_PORTFOLIO_SNAPSHOT_DATE = "2026-08-20";
export const V96_STARRED_PORTFOLIO_SOURCE = "https://github.com/dev4-gpt?tab=stars";
export const V96_STARRED_PORTFOLIO_EXPECTED_COUNT = 101;

export type V96PortfolioLicenseStatus = "confirmed" | "custom" | "missing" | "unresolved";
export type V96PortfolioCategory = "research" | "quality" | "orchestration" | "knowledge" | "routing" | "media" | "security" | "reference";

export interface V96StarredPortfolioEntry {
  id: string;
  fullName: string;
  name: string;
  sourceUrl: string;
  sourceCommit: string;
  license: string;
  licenseStatus: V96PortfolioLicenseStatus;
  provenance: string;
  extractedBehavior: string;
  category: V96PortfolioCategory;
  targetCapabilities: readonly string[];
  runtime: V96RepositoryRuntime;
  executionPermissions: readonly string[];
  placement: string;
  activation: V96ActivationClass;
  evidenceGate: string;
  rollbackRule: string;
  securityNotes: string;
}

type StarredRow = readonly [fullName: string, name: string, sourceUrl: string, sourceCommit: string, license: string];

const STARRED_ROWS: readonly StarredRow[] = [
  ["D4Vinci/Scrapling", "Scrapling", "https://github.com/D4Vinci/Scrapling", "cb00f1bba8f5ab91a454c2b2c87d0018fc66e6ae", "BSD-3-Clause"],
  ["x1xhlol/system-prompts-and-models-of-ai-tools", "system-prompts-and-models-of-ai-tools", "https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools", "1e4203a7d88873c1b37ab2d1c07074fea498c274", "GPL-3.0"],
  ["multica-ai/andrej-karpathy-skills", "andrej-karpathy-skills", "https://github.com/multica-ai/andrej-karpathy-skills", "2c606141936f1eeef17fa3043a72095b4765b9c2", ""],
  ["ComposioHQ/awesome-claude-skills", "awesome-claude-skills", "https://github.com/ComposioHQ/awesome-claude-skills", "be2a406907dbc61b73e6827ded415c96139d13a2", ""],
  ["travisvn/awesome-claude-skills", "awesome-claude-skills", "https://github.com/travisvn/awesome-claude-skills", "1da55aa810f206d3fe2005e7e3989b15a275d942", ""],
  ["jina-ai/reader", "reader", "https://github.com/jina-ai/reader", "1574bfd380d249c86c82db4dace0d9c8fe17e2b1", "Apache-2.0"],
  ["apify/crawlee", "crawlee", "https://github.com/apify/crawlee", "b0e828ae4c30920ccbab095847f3b2191caf5001", "Apache-2.0"],
  ["unclecode/crawl4ai", "crawl4ai", "https://github.com/unclecode/crawl4ai", "7e801521428ee12509994d39151006f64055ebe3", "Apache-2.0"],
  ["aman556/DevOps-System-Design", "DevOps-System-Design", "https://github.com/aman556/DevOps-System-Design", "119dcea7b82ef62746b7308d36b8be8bee4338dd", ""],
  ["jj-vcs/jj", "jj", "https://github.com/jj-vcs/jj", "7007d08537a872dd708f112e2b289ca5a681c692", "Apache-2.0"],
  ["charlie947/social-media-skills", "social-media-skills", "https://github.com/charlie947/social-media-skills", "69d9488e880cceaf418329dfa64b44b9bf022174", "MIT"],
  ["jhaizhou-ops/pinrule", "pinrule", "https://github.com/jhaizhou-ops/pinrule", "2aa78c30c73c8d562db2a39730c1a8e12a5d5293", "MIT"],
  ["appsmithorg/appsmith", "appsmith", "https://github.com/appsmithorg/appsmith", "5c89c11224a65952e10dd9f5dc1eaad68a18da3b", "Apache-2.0"],
  ["agentsmd/agents.md", "agents.md", "https://github.com/agentsmd/agents.md", "d1ac7f063d20e70015ed6732664049ae4ba9d74e", "MIT"],
  ["guy-hartstein/company-research-agent", "company-research-agent", "https://github.com/guy-hartstein/company-research-agent", "52c904c8169f0a36ee8c1de46d5745aee731a0b4", "Apache-2.0"],
  ["garrytan/gstack", "gstack", "https://github.com/garrytan/gstack", "51932eceef9cf45ad5fbf2b19e15615f96df2872", "MIT"],
  ["goabiaryan/awesome-gpu-engineering", "awesome-gpu-engineering", "https://github.com/goabiaryan/awesome-gpu-engineering", "bb8cf16e32a780dd84e2fb1184e2b4695ed0e3b6", ""],
  ["AI-Builder-Club/skills", "skills", "https://github.com/AI-Builder-Club/skills", "d4cd90f5915b10412595733a0fbdca96f65115b1", ""],
  ["deepbeepmeep/Wan2GP", "Wan2GP", "https://github.com/deepbeepmeep/Wan2GP", "022622cfa4ccc0058fcdac8c4f03d3224b43e009", "NOASSERTION"],
  ["semantica-agi/semantica", "semantica", "https://github.com/semantica-agi/semantica", "58b77ddcf56df2e257014f18b206b3920fdd2818", "MIT"],
  ["Bennettxai/FounderOS-DEMO", "FounderOS-DEMO", "https://github.com/Bennettxai/FounderOS-DEMO", "7b1260857232ee9ac9ad4b0c709a6f231b22a0de", "MIT"],
  ["addyosmani/agent-skills", "agent-skills", "https://github.com/addyosmani/agent-skills", "df1edb2e05487d0aa6d93c747141e0aed1187f25", "MIT"],
  ["lfnovo/open-notebook", "open-notebook", "https://github.com/lfnovo/open-notebook", "a7de90d38aaf18ee85fd661854d35c11e44613e2", "MIT"],
  ["petergyang/no-ai-slop", "no-ai-slop", "https://github.com/petergyang/no-ai-slop", "d30eddb9e04562234f2070b5ee63ca4649d9a05e", "MIT"],
  ["ayghri/i-have-adhd", "i-have-adhd", "https://github.com/ayghri/i-have-adhd", "e7555fcaf612dfa1739dc86610ea926a906db614", "MIT"],
  ["every-app/open-seo", "open-seo", "https://github.com/every-app/open-seo", "cd6a782092556d6f7a0e3ab1cdb66a4dada30e28", "MIT"],
  ["usestrix/strix", "strix", "https://github.com/usestrix/strix", "6f88b7d7d5b6f57833b73a5384079e229e21aa2f", "Apache-2.0"],
  ["diegosouzapw/OmniRoute", "OmniRoute", "https://github.com/diegosouzapw/OmniRoute", "41ffb08e4a4a4f14e8178641c7874712789a038d", "MIT"],
  ["virgiliojr94/book-to-skill", "book-to-skill", "https://github.com/virgiliojr94/book-to-skill", "3a97a7115ab3c82edf47f315b544fbcefdd8559c", "MIT"],
  ["Anil-matcha/Open-Generative-AI", "Open-Generative-AI", "https://github.com/Anil-matcha/Open-Generative-AI", "2bbee22d534b10b148b358ea3edba52afab794c4", "MIT"],
  ["roboflow/supervision", "supervision", "https://github.com/roboflow/supervision", "31738b2293a09129341bd95331cdcbcbae313ca3", "MIT"],
  ["ScrapeGraphAI/Scrapegraph-ai", "Scrapegraph-ai", "https://github.com/ScrapeGraphAI/Scrapegraph-ai", "bc73824b9c6d8afc6058138484e9926499fe37cf", "MIT"],
  ["SkyworkAI/SkyReels-V2", "SkyReels-V2", "https://github.com/SkyworkAI/SkyReels-V2", "9351d13152207cc04de780e055346b08ade0b851", "NOASSERTION"],
  ["SonarSource/sonarqube-cli", "sonarqube-cli", "https://github.com/SonarSource/sonarqube-cli", "222ba3e8919fee5cc078b70b4a7d0ad502d94305", "NOASSERTION"],
  ["yc-software/qm", "qm", "https://github.com/yc-software/qm", "568252bd4e6da5288b239573abef972f3e16b3f9", "MIT"],
  ["shepherd-agents/shepherd", "shepherd", "https://github.com/shepherd-agents/shepherd", "4b44f4e8822a919a74b4bf9c13d9370dbf4cd9be", "MIT"],
  ["headroomlabs-ai/headroom", "headroom", "https://github.com/headroomlabs-ai/headroom", "b88b9078d8eda7b91e1543b33fa44d793869afa6", "Apache-2.0"],
  ["PrimeIntellect-ai/prime-agent", "prime-agent", "https://github.com/PrimeIntellect-ai/prime-agent", "af0b8e00b9f704e834787fd321065ca78281f2aa", "MIT"],
  ["diwenne/openreply", "openreply", "https://github.com/diwenne/openreply", "80fa38780e2973a0299c05019bc0d0657044220c", "MIT"],
  ["msitarzewski/agency-agents", "agency-agents", "https://github.com/msitarzewski/agency-agents", "ebe9c99acb5c96f9468de368d8bead775387d1a7", "MIT"],
  ["oblien/openship", "openship", "https://github.com/oblien/openship", "92fffe4f7291969fc65ac067b85018d414561a2a", "Apache-2.0"],
  ["freshtechbro/claudedesignskills", "claudedesignskills", "https://github.com/freshtechbro/claudedesignskills", "1da73febff0c3e1dfefc07f8a5ef8f7d1dfdb6cd", "MIT"],
  ["codejunkie99/meridian-company-os", "meridian-company-os", "https://github.com/codejunkie99/meridian-company-os", "79309eb13bdcad5ea76d3fc56b1a42bd80c01302", "MIT"],
  ["0x4m4/hexstrike-ai", "hexstrike-ai", "https://github.com/0x4m4/hexstrike-ai", "d689933ff579d839c676c82b231f8e98326c5f04", "MIT"],
  ["vxcontrol/pentagi", "pentagi", "https://github.com/vxcontrol/pentagi", "ea665308baaff015b226f308438a68d929d0f29b", "MIT"],
  ["goclone-dev/goclone", "goclone", "https://github.com/goclone-dev/goclone", "1fcaa12f76dc1af09422470d550fed82f3cc7e9d", "MIT"],
  ["JCodesMore/ai-website-cloner-template", "ai-website-cloner-template", "https://github.com/JCodesMore/ai-website-cloner-template", "92872bc40ced2c5edb4d5dc9fd3970d40c77f4ca", "MIT"],
  ["spencergoldade/cursor-designer", "cursor-designer", "https://github.com/spencergoldade/cursor-designer", "30b15ac1d67a7cdc0986f3a20ceb91943e683cec", "GPL-3.0"],
  ["maxbogo/awesome-ai-tools-for-ui", "awesome-ai-tools-for-ui", "https://github.com/maxbogo/awesome-ai-tools-for-ui", "f26e77e58791e3a64b08a7ef2b249afe506405cd", ""],
  ["resemble-ai/chatterbox", "chatterbox", "https://github.com/resemble-ai/chatterbox", "5de7a54aa4e5e2baadb0182dde554908b48b85c2", "MIT"],
  ["cline/cline", "cline", "https://github.com/cline/cline", "16875140fbc7bae51aad79c203837b4f51e54aa5", "Apache-2.0"],
  ["ItzCrazyKns/Vane", "Vane", "https://github.com/ItzCrazyKns/Vane", "7dc5d088f7262fbc5e39037f84940a8a2193c5fb", "MIT"],
  ["OpenHands/OpenHands", "OpenHands", "https://github.com/OpenHands/OpenHands", "f2dd33090592f8777e3f2d1a519ddb44866e595e", "MIT"],
  ["calesthio/OpenMontage", "OpenMontage", "https://github.com/calesthio/OpenMontage", "1bab711820828c2e5fc1f87ed274a32587cb048f", "AGPL-3.0"],
  ["duixcom/Duix-Avatar", "Duix-Avatar", "https://github.com/duixcom/Duix-Avatar", "1328feb5871448c8fa3d0e45b3bbc87e7c1d458a", "NOASSERTION"],
  ["Fincept-Corporation/FinceptTerminal", "FinceptTerminal", "https://github.com/Fincept-Corporation/FinceptTerminal", "c388a881628cdb3c5bbdd5f35a8511abd69f47b7", "NOASSERTION"],
  ["Shubhamsaboo/awesome-llm-apps", "awesome-llm-apps", "https://github.com/Shubhamsaboo/awesome-llm-apps", "813a55e1a6a80d2329b55287b4f33cbf661538ea", "Apache-2.0"],
  ["bradautomates/claude-video", "claude-video", "https://github.com/bradautomates/claude-video", "83da59fa78c3eee9e20f515fe75c438bb5166efd", "MIT"],
  ["HKUDS/RAG-Anything", "RAG-Anything", "https://github.com/HKUDS/RAG-Anything", "d8cdaa66c074a6351b9ee6ab1dd54f43bb56e436", "MIT"],
  ["infiniflow/ragflow", "ragflow", "https://github.com/infiniflow/ragflow", "618c4599b10e792a5eaf3dee9c1cbe7c741c4803", "Apache-2.0"],
  ["deepseek-ai/DeepSpec", "DeepSpec", "https://github.com/deepseek-ai/DeepSpec", "005e03b81cec38b7da6399833d609ee89a2587f2", "MIT"],
  ["alirezarezvani/claude-skills", "claude-skills", "https://github.com/alirezarezvani/claude-skills", "aa8d778811a557a2c28ccadda4cf3d0bd028a4cc", "MIT"],
  ["DietrichGebert/ponytail", "ponytail", "https://github.com/DietrichGebert/ponytail", "2ed6c52c9d7e5e56942508591085fd45dea277d3", "MIT"],
  ["google/agents-cli", "agents-cli", "https://github.com/google/agents-cli", "66976f5cf53c39995dce1cdb3638c6b5e7cb2e4b", "Apache-2.0"],
  ["InsForge/InsForge", "InsForge", "https://github.com/InsForge/InsForge", "268d79d274b07317ffb8ceb14d09485625910592", "Apache-2.0"],
  ["topoteretes/cognee", "cognee", "https://github.com/topoteretes/cognee", "fd5045f6b60522c1953fc1ae258e041ba53602d8", "Apache-2.0"],
  ["VoltAgent/voltagent", "voltagent", "https://github.com/VoltAgent/voltagent", "35efe178d76b191d0399c9d8bdb576bcbb162f79", "MIT"],
  ["ashishpatel26/500-AI-Agents-Projects", "500-AI-Agents-Projects", "https://github.com/ashishpatel26/500-AI-Agents-Projects", "9beeb721c2af551bacaab827a76bddaecaa0ca5e", "MIT"],
  ["hoangsonww/Agentic-AI-Pipeline", "Agentic-AI-Pipeline", "https://github.com/hoangsonww/Agentic-AI-Pipeline", "443716a7d227b0d36cd73b82f134ccf00aa34185", "Apache-2.0"],
  ["NirDiamant/agents-towards-production", "agents-towards-production", "https://github.com/NirDiamant/agents-towards-production", "df724c58c16a49924b830694ebfc744d67e037d3", "NOASSERTION"],
  ["elder-plinius/CL4R1T4S", "CL4R1T4S", "https://github.com/elder-plinius/CL4R1T4S", "c3b01557b062e419ccc03e7cf810f9b8bf0ac558", "AGPL-3.0"],
  ["bytedance/deer-flow", "deer-flow", "https://github.com/bytedance/deer-flow", "a5acc25de6742b2166b3f41c97bd895822277b94", "MIT"],
  ["langchain-ai/deepagents", "deepagents", "https://github.com/langchain-ai/deepagents", "1e4f50794167250dc7d7fd2b352aed684ca1ae69", "MIT"],
  ["firecrawl/firecrawl", "firecrawl", "https://github.com/firecrawl/firecrawl", "1c522c1ed2b6e9763e48ed7202e08328043db7a0", "AGPL-3.0"],
  ["affaan-m/ECC", "ECC", "https://github.com/affaan-m/ECC", "d8409a4b0813771235555e32e3d8046a73988bfa", "MIT"],
  ["rohitg00/ai-engineering-from-scratch", "ai-engineering-from-scratch", "https://github.com/rohitg00/ai-engineering-from-scratch", "7c3323508a5186739feecd76838ba1ae962c736f", "MIT"],
  ["harry0703/MoneyPrinterTurbo", "MoneyPrinterTurbo", "https://github.com/harry0703/MoneyPrinterTurbo", "d84f4f344f1434286603994eedc7f46330f456b3", "MIT"],
  ["Giskard-AI/giskard-oss", "giskard-oss", "https://github.com/Giskard-AI/giskard-oss", "39f4bb2502334d9f594c5b751966d1f4dfcd74f2", "Apache-2.0"],
  ["0ldh/claude-code-agents-orchestra", "claude-code-agents-orchestra", "https://github.com/0ldh/claude-code-agents-orchestra", "e18d323bb3b7b4cf064f292a430861daff92a9af", "MIT"],
  ["katanemo/plano", "plano", "https://github.com/katanemo/plano", "003c36aea896ce6fa98567329588baa582e41f9c", "Apache-2.0"],
  ["sickn33/agentic-awesome-skills", "agentic-awesome-skills", "https://github.com/sickn33/agentic-awesome-skills", "e2b6ad15c704e47819b0e2393d04b42a9dcf4fc5", "MIT"],
  ["ruvnet/ruflo", "ruflo", "https://github.com/ruvnet/ruflo", "fa13ee4ad60ac2090b1480656eb233521790d640", "MIT"],
  ["Arindam200/reddit-mcp", "reddit-mcp", "https://github.com/Arindam200/reddit-mcp", "5c5636371315386dfcf4cea73123ea4f6c06842a", "MIT"],
  ["Arindam200/awesome-ai-apps", "awesome-ai-apps", "https://github.com/Arindam200/awesome-ai-apps", "e7ff378756044f37307b9264963ca59e6c924bc9", "MIT"],
  ["vercel-labs/zerolang", "zerolang", "https://github.com/vercel-labs/zerolang", "afcc72da649fe4d4c670ac1489c2197d37436051", "Apache-2.0"],
  ["Graphify-Labs/graphify", "graphify", "https://github.com/Graphify-Labs/graphify", "b14b52e94ec3d9840413d81777f4c134eac0a40d", "Apache-2.0"],
  ["OpenBMB/ChatDev", "ChatDev", "https://github.com/OpenBMB/ChatDev", "4fb2db0ea90375ce1059f44fe03ffbd191a7a169", "Apache-2.0"],
  ["NousResearch/hermes-paperclip-adapter", "hermes-paperclip-adapter", "https://github.com/NousResearch/hermes-paperclip-adapter", "937ea71a34f5efcaa3834b11fdd08cfc1c99cb2c", "MIT"],
  ["NousResearch/hermes-agent", "hermes-agent", "https://github.com/NousResearch/hermes-agent", "dbbd8937aec18e0739aec9ba58f1d24f6cb12698", "MIT"],
  ["paperclipai/paperclip", "paperclip", "https://github.com/paperclipai/paperclip", "5a1ce7aed8238036dc92dcc944c71e08fe6ebc50", "MIT"],
  ["WeaveMindAI/weft", "weft", "https://github.com/WeaveMindAI/weft", "0f5c2cb7dc4d434554f367c894b839556d00615f", "NOASSERTION"],
  ["kyegomez/OpenMythos", "OpenMythos", "https://github.com/kyegomez/OpenMythos", "155430a88d2a98322fc4c79b2a067792c3c9579a", "MIT"],
  ["MadAppGang/claudish", "claudish", "https://github.com/MadAppGang/claudish", "4daf80403122e61b395d0feb550d049fdd151cc1", ""],
  ["google-research/timesfm", "timesfm", "https://github.com/google-research/timesfm", "3dae50b20d7a724981e8ea36cda75578f80dd2dc", "Apache-2.0"],
  ["sipeed/picoclaw", "picoclaw", "https://github.com/sipeed/picoclaw", "bbf6893ca7afad27f1d00a0f5a45982a549c6ed6", "MIT"],
  ["codecrafters-io/build-your-own-x", "build-your-own-x", "https://github.com/codecrafters-io/build-your-own-x", "aa17439b62f384511a5561ce308e9598b94d8989", ""],
  ["donnemartin/system-design-primer", "system-design-primer", "https://github.com/donnemartin/system-design-primer", "ae9bbd7b02d90b9866215de185217d33f39ab733", "NOASSERTION"],
  ["jasontang-ai/Context-Engineering", "Context-Engineering", "https://github.com/jasontang-ai/Context-Engineering", "6158def66a2d2174ed8356cf376e5f44e10d78ea", "MIT"],
  ["wshobson/agents", "agents", "https://github.com/wshobson/agents", "367cb6a4a182cf7e9b0a17c9429f7411ddd9cf35", "MIT"],
  ["Zie619/n8n-workflows", "n8n-workflows", "https://github.com/Zie619/n8n-workflows", "94007c1445d9258a7da116646b79473e7c7c3282", "MIT"],
  ["huggingface/agents-course", "agents-course", "https://github.com/huggingface/agents-course", "8c0832eae634ebb34541c65265caa6da4c5d2c57", "Apache-2.0"],
] as const;

const repositoryKey = (url: string) => url.replace(/\/+$/, "").replace(/\.git$/i, "").toLowerCase();
const existingByUrl = new Map(V96_REPOSITORY_CATALOG.map((reference) => [repositoryKey(reference.sourceUrl), reference]));

const GROUPS: Record<V96PortfolioCategory, {
  behavior: string;
  capabilities: readonly string[];
  runtime: V96RepositoryRuntime;
  permissions: readonly string[];
  placement: string;
  evidenceGate: string;
}> = {
  research: { behavior: "bounded web retrieval, extraction, crawling, search, or citation-oriented research", capabilities: ["research", "knowledge"], runtime: "operator-worker", permissions: ["read-public-source", "write-citations"], placement: "Research and Knowledge provider plane", evidenceGate: "URL policy, SSRF/egress controls, citation parity, rate limits, budget, deletion lineage, and rollback" },
  quality: { behavior: "instruction scope, quality review, anti-drift, anti-slop, evaluation, or engineering verification", capabilities: ["quality", "review"], runtime: "dependency-free", permissions: ["read-reference", "write-review"], placement: "Quality, Build, and Review traits", evidenceGate: "Focused contract tests, redacted evidence, permission review, and rollback mapping" },
  orchestration: { behavior: "agent roles, playbooks, orchestration, resumability, workspaces, or workflow coordination", capabilities: ["orchestration", "workflow"], runtime: "operator-worker", permissions: ["read-reference", "write-review"], placement: "Playbooks, Workspace, and Control Room", evidenceGate: "Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence" },
  knowledge: { behavior: "retrieval, notebook, graph, memory, context engineering, or knowledge compilation", capabilities: ["knowledge", "notebook"], runtime: "adapter", permissions: ["read-artifacts", "write-citations"], placement: "Knowledge and Notebook contracts", evidenceGate: "Tenant ownership, provenance, retention, deletion lineage, citation parity, and reviewed activation" },
  routing: { behavior: "provider routing, context compression, cost control, specifications, or model efficiency", capabilities: ["provider-routing", "budget"], runtime: "adapter", permissions: ["write-review"], placement: "Shared Provider Adapter and Routing traits", evidenceGate: "Allowlist, deterministic fallback, budget trace, redacted route evidence, and quality parity" },
  media: { behavior: "image, video, audio, avatar, montage, or visual-quality generation and processing", capabilities: ["media", "artifacts"], runtime: "gpu-worker", permissions: ["read-artifacts", "write-review"], placement: "Media and isolated artifact workers", evidenceGate: "Provider license, artifact ownership, fixture quality, cost/VRAM bounds, approval, and rollback" },
  security: { behavior: "authorized security assessment, penetration testing, or security analysis", capabilities: ["security-assessment"], runtime: "operator-worker", permissions: ["write-review"], placement: "Security operator worker", evidenceGate: "Explicit staging target, signed scope, egress allowlist, maintenance window, approval, cleanup, and rollback" },
  reference: { behavior: "education, curation, language/runtime experimentation, or general architectural reference", capabilities: ["reference"], runtime: "dependency-free", permissions: ["read-reference"], placement: "Governed architectural reference register", evidenceGate: "License, provenance, behavior review, permission review, and explicit adoption decision" },
};

function categoryFor(fullName: string): V96PortfolioCategory {
  const value = fullName.toLowerCase();
  if (/(scrapling|crawlee|crawl4ai|jina-ai\/reader|open-seo|scrapegraph|firecrawl|company-research|vane|reddit-mcp)/.test(value)) return "research";
  if (/(strix|hexstrike|pentagi)/.test(value)) return "security";
  if (/(wan2gp|open-generative|skyreels|supervision|openmontage|chatterbox|duix-avatar|claude-video|moneyprinter)/.test(value)) return "media";
  if (/(rag-anything|ragflow|cognee|graphify|open-notebook|semantica|context-engineering|timesfm)/.test(value)) return "knowledge";
  if (/(omniroute|headroom|plano|deepspec|pinrule|zerolang|jj-vcs)/.test(value)) return "routing";
  if (/(agency-agents|gstack|openhands|cline|hermes|paperclip|chatdev|deer-flow|deepagents|ruflo|voltagent|qm|shepherd|prime-agent|openship|insforge|n8n-workflows|agentic-ai-pipeline|claudish|picoclaw)/.test(value)) return "orchestration";
  if (/(agent-skills|skills|agents\.md|awesome-claude-skills|claude-skills|no-ai-slop|i-have-adhd|sonarqube|giskard|ecc|ponytail|system-prompts|karpathy|build-your-own-x|system-design|agents-towards-production|awesome-ai|cursor-designer|claudedesignskills)/.test(value)) return "quality";
  return "reference";
}

function licenseStatusFor(license: string): V96PortfolioLicenseStatus {
  if (!license) return "missing";
  if (license === "NOASSERTION") return "unresolved";
  if (/community|custom/i.test(license)) return "custom";
  return "confirmed";
}

function idFor(fullName: string) {
  return fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 62);
}

function entryFor(row: StarredRow): V96StarredPortfolioEntry {
  const [fullName, name, sourceUrl, sourceCommit, rawLicense] = row;
  const existing = existingByUrl.get(repositoryKey(sourceUrl));
  const category = categoryFor(fullName);
  const group = GROUPS[category];
  const licenseStatus = licenseStatusFor(rawLicense);
  const license = rawLicense || "NOASSERTION";
  const restrictedLicense = licenseStatus === "missing" || licenseStatus === "unresolved" || /GPL|AGPL/i.test(license);
  const activation = existing?.activation ?? "reference-only";
  const gatedCategory = category === "security" || category === "media";
  const safeActivation: V96ActivationClass = restrictedLicense
    ? "reference-only"
    : gatedCategory && activation === "native-enabled"
      ? "externally-gated"
      : activation;
  return {
    id: existing?.id ?? idFor(fullName),
    fullName,
    name,
    sourceUrl,
    sourceCommit,
    license,
    licenseStatus,
    provenance: `GitHub starred snapshot ${V96_STARRED_PORTFOLIO_SNAPSHOT_DATE}; exact default-branch or tag commit and license metadata resolved from GitHub`,
    extractedBehavior: group.behavior,
    category,
    targetCapabilities: existing?.targetCapabilities ?? group.capabilities,
    runtime: existing?.runtime ?? group.runtime,
    executionPermissions: existing?.executionPermissions ?? group.permissions,
    placement: existing?.placement ?? group.placement,
    activation: safeActivation,
    evidenceGate: existing?.evidenceGate ?? group.evidenceGate,
    rollbackRule: existing?.rollbackRule ?? "Remove the reference from the activation manifest; no upstream runtime is installed",
    securityNotes: [
      restrictedLicense ? "license requires non-vendoring/legal review" : "license metadata resolved from GitHub",
      gatedCategory ? "execution remains separately gated" : "no runtime activation implied by catalog presence",
    ].join("; "),
  };
}

export const V96_STARRED_PORTFOLIO: readonly V96StarredPortfolioEntry[] = STARRED_ROWS.map(entryFor);

export function validateV96StarredPortfolio(entries: readonly V96StarredPortfolioEntry[] = V96_STARRED_PORTFOLIO) {
  const errors: string[] = [];
  const ids = new Set<string>();
  const urls = new Set<string>();
  if (entries.length !== V96_STARRED_PORTFOLIO_EXPECTED_COUNT) errors.push(`portfolio snapshot must contain exactly ${V96_STARRED_PORTFOLIO_EXPECTED_COUNT} entries (got ${entries.length})`);
  for (const entry of entries) {
    if (ids.has(entry.id)) errors.push(`${entry.fullName}: duplicate id`);
    ids.add(entry.id);
    if (urls.has(entry.sourceUrl)) errors.push(`${entry.fullName}: duplicate source URL`);
    urls.add(entry.sourceUrl);
    if (!/^https:\/\/[^\s?#]+$/.test(entry.sourceUrl)) errors.push(`${entry.fullName}: source URL is not clean`);
    if (!/^[a-f0-9]{40}$/.test(entry.sourceCommit)) errors.push(`${entry.fullName}: source commit is not a 40-character SHA`);
    if (!entry.license.trim()) errors.push(`${entry.fullName}: license is missing`);
    if (!entry.provenance.trim() || !entry.extractedBehavior.trim()) errors.push(`${entry.fullName}: provenance/behavior is missing`);
    if (!entry.targetCapabilities.length || !entry.executionPermissions.length) errors.push(`${entry.fullName}: capability/permission mapping is missing`);
    if (!entry.placement.trim() || !entry.evidenceGate.trim() || !entry.rollbackRule.trim()) errors.push(`${entry.fullName}: placement/evidence/rollback is missing`);
    if (entry.licenseStatus !== "confirmed" && entry.activation !== "reference-only") errors.push(`${entry.fullName}: unresolved license cannot activate`);
    if (entry.activation === "native-enabled" && !existingByUrl.has(repositoryKey(entry.sourceUrl))) errors.push(`${entry.fullName}: native activation lacks a Veloce implementation mapping`);
    if (entry.executionPermissions.includes("execute-shell") || entry.executionPermissions.includes("arbitrary-network")) errors.push(`${entry.fullName}: unsafe permission expansion`);
  }
  return errors;
}

export function portfolioSummary(entries: readonly V96StarredPortfolioEntry[] = V96_STARRED_PORTFOLIO) {
  return {
    snapshotDate: V96_STARRED_PORTFOLIO_SNAPSHOT_DATE,
    total: entries.length,
    nativeEnabled: entries.filter((entry) => entry.activation === "native-enabled").length,
    contractActive: entries.filter((entry) => entry.activation === "contract-active").length,
    gated: entries.filter((entry) => entry.activation === "externally-gated").length,
    referenceOnly: entries.filter((entry) => entry.activation === "reference-only").length,
    unresolvedLicenses: entries.filter((entry) => entry.licenseStatus === "missing" || entry.licenseStatus === "unresolved").length,
  };
}
