export type ClientAgentTab = {
  id: string;
  label: string;
  description: string;
};

export type ClientAgentDefinition = {
  route: string;
  provider: string;
  title: string;
  subtitle: string;
  model: string;
  credentialKey: string;
  accent: string;
  tabs: ClientAgentTab[];
  quickPrompts?: string[];
  modes?: string[];
};

const chat = (description = "Use the approved hosted provider thread."): ClientAgentTab => ({ id: "chat", label: "Chat", description });
const workspace = (description = "Review tenant-scoped jobs, artifacts, and handoffs."): ClientAgentTab => ({ id: "workspace", label: "Workspace", description });

export const CLIENT_AGENT_CATALOG: ClientAgentDefinition[] = [
  {
    route: "/claude", provider: "anthropic", title: "Claude", credentialKey: "ANTHROPIC_API_KEY", accent: "#d97757",
    subtitle: "Hosted Claude workspace with durable tenant history and artifacts.", model: "Claude via approved API",
    tabs: [chat(), workspace(), { id: "artifacts", label: "Artifacts", description: "Inspect tenant-owned outputs and authenticated downloads." }, { id: "ultracode", label: "Ultracode", description: "Prepare bounded build plans for review." }, { id: "ant", label: "Ant CLI", description: "Hosted adapter status for the Ant-compatible build lane." }, { id: "agents", label: "Agents", description: "Review the approved agent plan before execution." }],
  },
  {
    route: "/openclaw", provider: "openclaw", title: "OpenClaw", credentialKey: "OPENROUTER_API_KEY", accent: "#f472b6",
    subtitle: "Hosted OpenClaw-compatible workflow lane.", model: "OpenRouter approved model",
    tabs: [chat(), { id: "studio", label: "Studio", description: "Shape a hosted build brief and queue it for review." }, workspace(), { id: "control", label: "Control Room", description: "Inspect queue, policy, and approved adapter state." }],
  },
  {
    route: "/hermes", provider: "hermes", title: "Hermes", credentialKey: "OPENROUTER_API_KEY", accent: "#60a5fa",
    subtitle: "Hosted Hermes-compatible research and workflow lane.", model: "OpenRouter approved model",
    tabs: [chat(), { id: "talk", label: "Talk", description: "Prepare voice-assisted prompts for an approved speech lane." }, { id: "jarvis", label: "Hermes-Jarvis", description: "Turn a request into a governed execution plan." }, { id: "radar", label: "Hermes Oracle", description: "Review research signals and decisions." }, { id: "studio", label: "Studio", description: "Create a production brief for review." }, { id: "sessions", label: "Sessions", description: "Review durable hosted session history." }, { id: "outreach", label: "Outreach", description: "Draft outreach only; external delivery requires approval." }, { id: "moa", label: "Mixture", description: "Prepare an ensemble request for a reviewed provider lane." }, workspace(), { id: "mcps", label: "MCPs", description: "See approved hosted tool contracts; local MCP administration stays private." }, { id: "manage", label: "Manage", description: "Review provider, budget, and approval state." }, { id: "control", label: "Control Room", description: "Inspect worker state and policy evidence." }, { id: "goals", label: "Goal Mode", description: "Create a goal record and review its execution steps." }],
  },
  {
    route: "/antigravity", provider: "antigravity", title: "Antigravity", credentialKey: "GEMINI_API_KEY", accent: "#7c5cff",
    subtitle: "Hosted Gemini-backed planning workspace.", model: "Gemini via approved API",
    tabs: [chat(), workspace()],
  },
  {
    route: "/codex", provider: "codex", title: "Codex", credentialKey: "OPENAI_API_KEY", accent: "#22c55e",
    subtitle: "Hosted coding plans, durable sessions, and reviewable artifacts.", model: "OpenAI-compatible approved API",
    tabs: [chat(), { id: "goal", label: "Goal Mode", description: "Create a long-running hosted goal with approval checkpoints." }, { id: "sessions", label: "Sessions", description: "Review persisted hosted sessions." }, workspace()],
    modes: ["Ask", "Auto approve", "YOLO"],
  },
  {
    route: "/kimi", provider: "kimi", title: "Kimi Code", credentialKey: "MOONSHOT_API_KEY", accent: "#22b8e6",
    subtitle: "Hosted Kimi coding workspace with durable plans and artifacts.", model: "Kimi via approved API",
    tabs: [chat(), workspace()], modes: ["Quality", "Fast", "No think"],
  },
  {
    route: "/glm", provider: "glm", title: "GLM 5.2", credentialKey: "GLM_API_KEY", accent: "#14b8a6",
    subtitle: "Hosted GLM coding workspace.", model: "GLM via approved API",
    tabs: [chat(), workspace()],
  },
  {
    route: "/glm-code", provider: "glm-code", title: "GLM Code", credentialKey: "GLM_API_KEY", accent: "#f59e0b",
    subtitle: "Hosted GLM Code lane with reviewable code plans and outputs.", model: "GLM Code via approved API",
    tabs: [{ id: "terminal", label: "Terminal", description: "Prepare a hosted coding plan; Cloud Run never opens a laptop terminal." }, workspace()],
  },
  {
    route: "/grok", provider: "grok", title: "Grok Build", credentialKey: "XAI_API_KEY", accent: "#94a3b8",
    subtitle: "Hosted Grok build workspace.", model: "Grok via approved API",
    tabs: [chat(), workspace()],
  },
  {
    route: "/freeclaude", provider: "freeclaude", title: "Free Claude Code", credentialKey: "OPENROUTER_API_KEY", accent: "#10b981",
    subtitle: "Hosted free-model lane with tenant-owned plans and artifacts.", model: "OpenRouter approved free model",
    tabs: [{ id: "factory", label: "Agent Factory", description: "Compose a governed build request from voice or text." }, chat(), workspace()],
  },
  {
    route: "/fusion", provider: "fusion", title: "Fusion Boardroom", credentialKey: "OPENROUTER_API_KEY", accent: "#a855f7",
    subtitle: "Hosted multi-model deliberation with a reviewable verdict.", model: "OpenRouter approved panel",
    tabs: [{ id: "boardroom", label: "Boardroom", description: "Ask the panel; the verdict remains reviewable before action." }, workspace()],
    quickPrompts: ["SEO content council", "Title and thumbnail brain", "Fact-check", "Deep research", "Red-team my offer"],
  },
  {
    route: "/sakana", provider: "sakana", title: "Sakana Fugu Ultra", credentialKey: "SAKANA_API_KEY", accent: "#ec4899",
    subtitle: "Hosted vendor-agnostic ensemble workspace.", model: "Sakana via approved API",
    tabs: [{ id: "boardroom", label: "Boardroom", description: "Ask the whole approved board, then review its verdict." }, workspace()],
    quickPrompts: ["SEO content council", "Title and thumbnail brain", "Fact-check", "Deep research", "Red-team my offer"],
  },
  {
    route: "/local", provider: "openrouter", title: "Local Studio", credentialKey: "OPENROUTER_API_KEY", accent: "#14b8a6",
    subtitle: "Cloud equivalent of the local build studio; outputs land in tenant storage.", model: "Hosted approved model",
    tabs: [{ id: "build", label: "Build", description: "Create a hosted build plan from text or browser voice input." }, { id: "preview", label: "Preview", description: "Open reviewable generated artifacts when a hosted build adapter is enabled." }, workspace()],
  },
  {
    route: "/engine", provider: "openrouter", title: "Local Hermes Engine", credentialKey: "OPENROUTER_API_KEY", accent: "#38bdf8",
    subtitle: "Hosted equivalent of the local engine. It cannot access a laptop filesystem.", model: "Gemma-compatible hosted lane when approved",
    tabs: [{ id: "build", label: "Build", description: "Queue a hosted agent task after provider approval." }, workspace()],
  },
];

export const CLIENT_AGENT_BY_ROUTE = Object.fromEntries(CLIENT_AGENT_CATALOG.map((agent) => [agent.route, agent])) as Record<string, ClientAgentDefinition>;
