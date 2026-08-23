import { expect, test } from "@playwright/test";
import { V96_STARRED_PORTFOLIO, V96_STARRED_PORTFOLIO_EXPECTED_COUNT, validateV96StarredPortfolio } from "../src/lib/v96StarredPortfolio";
import { V96_REPOSITORY_CATALOG } from "../src/lib/v96RepositoryCatalog";

const ATTACHED_REPOSITORIES = [
  "https://github.com/InsForge/InsForge", "https://github.com/oblien/openship", "https://github.com/katanemo/plano",
  "https://github.com/goclone-dev/goclone", "https://github.com/JCodesMore/ai-website-cloner-template", "https://github.com/paperclipai/paperclip",
  "https://github.com/NousResearch/hermes-agent", "https://github.com/NousResearch/hermes-paperclip-adapter", "https://github.com/yc-software/qm",
  "https://github.com/shepherd-agents/shepherd", "https://github.com/bytedance/deer-flow", "https://github.com/ruvnet/ruflo",
  "https://github.com/0ldh/claude-code-agents-orchestra", "https://github.com/OpenBMB/ChatDev", "https://github.com/VoltAgent/voltagent",
  "https://github.com/OpenHands/OpenHands", "https://github.com/cline/cline", "https://github.com/PrimeIntellect-ai/prime-agent",
  "https://github.com/headroomlabs-ai/headroom", "https://github.com/topoteretes/cognee", "https://github.com/Graphify-Labs/graphify",
  "https://github.com/infiniflow/ragflow", "https://github.com/HKUDS/RAG-Anything", "https://github.com/jasontang-ai/Context-Engineering",
  "https://github.com/ScrapeGraphAI/Scrapegraph-ai", "https://github.com/firecrawl/firecrawl", "https://github.com/Zie619/n8n-workflows",
  "https://github.com/hoangsonww/Agentic-AI-Pipeline", "https://github.com/diwenne/openreply", "https://github.com/Arindam200/reddit-mcp",
  "https://github.com/elder-plinius/CL4R1T4S", "https://github.com/DietrichGebert/ponytail", "https://github.com/wshobson/agents",
  "https://github.com/alirezarezvani/claude-skills", "https://github.com/sickn33/agentic-awesome-skills", "https://github.com/freshtechbro/claudedesignskills",
  "https://github.com/affaan-m/ECC", "https://github.com/virgiliojr94/book-to-skill", "https://github.com/spencergoldade/cursor-designer",
  "https://github.com/0x4m4/hexstrike-ai", "https://github.com/vxcontrol/pentagi", "https://github.com/calesthio/OpenMontage",
  "https://github.com/harry0703/MoneyPrinterTurbo", "https://github.com/Anil-matcha/Open-Generative-AI", "https://github.com/duixcom/Duix-Avatar",
  "https://github.com/bradautomates/claude-video", "https://github.com/roboflow/supervision", "https://github.com/Fincept-Corporation/FinceptTerminal",
  "https://github.com/WeaveMindAI/weft", "https://github.com/vercel-labs/zerolang", "https://github.com/Giskard-AI/giskard-oss",
  "https://github.com/deepseek-ai/DeepSpec", "https://github.com/google-research/timesfm",
] as const;

test("the portfolio contains the complete 101-repository snapshot", () => {
  expect(V96_STARRED_PORTFOLIO).toHaveLength(V96_STARRED_PORTFOLIO_EXPECTED_COUNT);
  expect(validateV96StarredPortfolio()).toEqual([]);
  expect(V96_REPOSITORY_CATALOG.length).toBeGreaterThan(40);
});

test("every repository from the attached prompt is represented in the portfolio", () => {
  const portfolioUrls = new Set(V96_STARRED_PORTFOLIO.map((entry) => entry.sourceUrl));
  expect(ATTACHED_REPOSITORIES).toHaveLength(53);
  for (const url of ATTACHED_REPOSITORIES) expect(portfolioUrls.has(url)).toBe(true);
});
