import { SymvibeWorkspaceState } from '../types/symvibe';

export const DEFAULT_PREVIEW_HTML = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: #090D14; color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 16px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <div class="border border-slate-800 bg-[#0F1623] rounded-lg p-4 space-y-4">
    <div class="flex items-center justify-between border-b border-slate-800 pb-3">
      <div>
        <div class="text-xs text-indigo-400 mono">VELOCE AGENTICOS · RECONSTRUCTED MODULE</div>
        <h2 class="text-base font-semibold text-white mt-0.5">Multi-Model Router & IPC Telemetry Panel</h2>
      </div>
      <span class="text-xs mono text-emerald-400">SHA-256 VERIFIED</span>
    </div>
    <div class="grid grid-cols-3 gap-3 text-xs">
      <div class="border border-slate-800 bg-[#090D14] p-3 rounded">
        <div class="text-slate-400">Active Router</div>
        <div class="text-sm font-semibold text-white mt-1 mono">gemini-4-argon</div>
        <div class="text-slate-500 mt-1 mono">142ms · Tool Hybrid</div>
      </div>
      <div class="border border-slate-800 bg-[#090D14] p-3 rounded">
        <div class="text-slate-400">IPC Frame Opcode</div>
        <div class="text-sm font-semibold text-white mt-1 mono">0x4A · SYNC_MEM</div>
        <div class="text-slate-500 mt-1 mono">EXTRACTED @ 0x00401180</div>
      </div>
      <div class="border border-slate-800 bg-[#090D14] p-3 rounded">
        <div class="text-slate-400">Rate Bucket</div>
        <div class="text-sm font-semibold text-emerald-400 mt-1 mono">54 / 60 RPM</div>
        <div class="text-slate-500 mt-1 mono">AgentOS Enforced</div>
      </div>
    </div>
    <div class="border border-slate-800 bg-[#090D14] p-3 rounded space-y-2">
      <div class="flex items-center justify-between text-xs">
        <span class="text-slate-300 font-medium">Reconstructed Dispatch Queue</span>
        <button onclick="document.getElementById('dispatch-out').innerText = 'Dispatched IPC 0x4A frame at ' + new Date().toLocaleTimeString()" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs cursor-pointer">
          Trigger IPC Frame
        </button>
      </div>
      <div id="dispatch-out" class="text-xs mono text-slate-400">Ready: awaiting dispatch trigger from Veloce AgenticOS adapter...</div>
    </div>
  </div>
</body>
</html>`;

export const INITIAL_WORKSPACE_STATE: SymvibeWorkspaceState = {
  camera: {
    x: 40,
    y: 50,
    zoom: 0.85,
  },
  activeModel: 'gemini-4-argon',
  teams: [
    {
      id: 'team-veloce-recon',
      name: 'Team 01 · Veloce AgenticOS Bridge & REA Provenance Recon',
      sourcePattern: 'OpenGoat Role Ownership · ResearchOS-Web SHA-256 Provenance',
      x: 20,
      y: 20,
      width: 1120,
      height: 540,
      leadRunner: 'gemini-4-argon',
      sharedGoal: 'Inspect target binaries/APIs with REA MCP, verify SHA-256 provenance, and sync with dev4-gpt/local-AgenticOS without colliding with Codex.',
    },
    {
      id: 'team-synthesis-studio',
      name: 'Team 02 · Multi-Runner Execution & 4-Stage Reconstruction Studio',
      sourcePattern: 'Paperclip Sessions · Claude Swarm Budgets · AI Website Cloner + OpenDesign',
      x: 20,
      y: 590,
      width: 1620,
      height: 530,
      leadRunner: 'codex',
      sharedGoal: 'Convert extracted REA + Repomix specs into isolated builds, enforce file-lock & budget rules, and run Visual QA.',
    },
  ],
  nodes: [
    {
      id: 'node-agenticos-bridge',
      type: 'agenticos-bridge',
      title: 'Veloce AgenticOS & Repomix Bridge',
      subtitle: 'dev4-gpt/local-AgenticOS · Reuse / Extend / Build Adapter',
      x: 45,
      y: 75,
      width: 510,
      height: 460,
      teamId: 'team-veloce-recon',
      bridgePayload: {
        repoUrl: 'https://github.com/dev4-gpt/local-AgenticOS',
        branch: 'main',
        lastCommitHash: 'a94e7c2',
        lastSyncAt: '2026-10-17T18:50:00Z',
        syncSource: 'Live GitHub + Local-First Adapter Contract',
        memoryRecordsCount: 14,
        repomixTokenEstimate: 3840,
        files: [
          {
            path: 'src/core/agentic-os-kernel.ts',
            sizeBytes: 6420,
            language: 'TypeScript',
            selectedForRepomix: true,
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            contentPreview: `export interface AgenticOSKernel {\n  memory: LocalMemoryStore;\n  tasks: WorkQueueScheduler;\n  sessions: MultiAgentSessionHub;\n  router: ClaudeCodeMultiModelRouter;\n}`,
          },
          {
            path: 'src/router/claude-code-multi-model.ts',
            sizeBytes: 4890,
            language: 'TypeScript',
            selectedForRepomix: true,
            sha256: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
            contentPreview: `export async function routeAgentTask(task: AgentTask, preferredModel: 'gemini-4-argon' | 'codex' | 'claude-code') {\n  // Routes reasoning & code tasks across local and hosted runners\n}`,
          },
          {
            path: 'src/adapters/symvibe-spatial-gateway.ts',
            sizeBytes: 3120,
            language: 'TypeScript',
            selectedForRepomix: true,
            sha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
            contentPreview: `export class SymvibeSpatialGatewayAdapter {\n  // Mounts Symvibe + REA infinite canvas directly into Veloce AgenticOS\n}`,
          },
          {
            path: 'src/memory/provenance-ledger.ts',
            sizeBytes: 5180,
            language: 'TypeScript',
            selectedForRepomix: false,
            sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
            contentPreview: `export interface ProvenanceRecord {\n  artifactSha256: string;\n  confidence: 'EXTRACTED' | 'INFERRED';\n}`,
          },
        ],
        repomixDigest: `<repomix-pack repo="dev4-gpt/local-AgenticOS" branch="main" files="3">\n  <file path="src/core/agentic-os-kernel.ts" sha256="e3b0c442...b855" />\n  <file path="src/router/claude-code-multi-model.ts" sha256="7f83b165...9069" />\n  <file path="src/adapters/symvibe-spatial-gateway.ts" sha256="4b227777...bf8a" />\n</repomix-pack>`,
      },
    },
    {
      id: 'node-rea-inspector',
      type: 'rea-inspector',
      title: 'REA MCP Inspector + ResearchOS Provenance',
      subtitle: 'morluto/rea · Graphify EXTRACTED / INFERRED Engine',
      x: 595,
      y: 75,
      width: 520,
      height: 460,
      teamId: 'team-veloce-recon',
      reaPayload: {
        targetType: 'binary',
        targetInput: 'symvibe-daemon-arm64.macho (Mach-O 64-bit Apple Silicon + IPC HAR)',
        rawSampleContent: `7f 45 4c 46 02 01 01 00 | symvibe_ipc_dispatch @ 0x00401180 | /api/v1/board/snapshot | /api/v1/planner/voice | X-AgentOS-TokenRefresh | sqlite3_step`,
        artifactSha256: '8f3a9b2c4e1d7f605a9e2b1c8d4f6a0b3c5e7f9a1b2c3d4e5f6a7b8c9d0e1f2a',
        lastAnalyzedAt: '2026-10-17T18:50:15Z',
        modelUsed: 'gemini-4-argon',
        summary: 'Deterministic binary + IPC inspection identified 4 core RPC dispatch handlers, SQLite WAL state persistence, and a dual-stage voice planner frame protocol.',
        hexPreview: [
          '00401180: cf fa ed fe 0c 00 00 01  00 00 00 00 02 00 00 00  |................|',
          '00401190: 73 79 6d 76 69 62 65 5f  69 70 63 5f 64 69 73 70  |symvibe_ipc_disp|',
          '004011a0: 2f 61 70 69 2f 76 31 2f  62 6f 61 72 64 2f 73 79  |/api/v1/board/sy|',
          '004011b0: 58 2d 41 67 65 6e 74 4f  53 2d 54 6f 6b 65 6e 00  |X-AgentOS-Token.|',
        ],
        evidenceItems: [
          {
            id: 'ev-1',
            category: 'Symbol',
            title: 'symvibe_ipc_dispatch_frame',
            finding: 'Mach-O symbol table export handling board node state diffs and terminal PTY multiplex frames.',
            confidence: 'EXTRACTED',
            sha256: '8f3a9b2c4e1d7f60',
            offsetOrLine: '0x00401180 (.text)',
            mcpTool: 'rea_disassemble_binary',
            reconstructedSnippet: 'export function dispatchIpcFrame(opcode: number, payload: Uint8Array): FrameAck',
          },
          {
            id: 'ev-2',
            category: 'Endpoint',
            title: 'POST /api/v1/board/snapshot',
            finding: 'Serializes active spatial canvas bounding boxes + Repomix digest for planner orchestration.',
            confidence: 'EXTRACTED',
            sha256: '4c91e07a3b82d119',
            offsetOrLine: '0x004011A0 (.rodata)',
            mcpTool: 'rea_extract_strings',
            reconstructedSnippet: 'app.post("/api/planner/plan", async (req, res) => { /* DAG synthesis */ })',
          },
          {
            id: 'ev-3',
            category: 'AuthFlow',
            title: 'X-AgentOS-TokenRefresh Header Contract',
            finding: 'Rotating session bearer header required by AgentOS execution proxy to avoid stale token drops.',
            confidence: 'EXTRACTED',
            sha256: '9d0e1f2a8f3a9b2c',
            offsetOrLine: '0x004011B0 (.rodata)',
            mcpTool: 'rea_xref_trace',
            reconstructedSnippet: 'headers["X-AgentOS-Token"] = await tokenRefreshManager.getValidToken()',
          },
          {
            id: 'ev-4',
            category: 'StateSchema',
            title: 'Inferred Multi-Runner File Lock Arbiter',
            finding: 'Cross-reference pattern between PTY spawner and SQLite transaction log indicates optimistic file locking per agent.',
            confidence: 'INFERRED',
            sha256: '1a2b3c4d5e6f7081',
            offsetOrLine: 'XREF 0x00401180 -> 0x00402410',
            mcpTool: 'gemini-4-argon-synthesizer',
            reconstructedSnippet: 'interface SwarmFileLock { filePath: string; ownerRunner: AgentRunnerType; }',
          },
        ],
        graphNodes: [
          { id: 'gn-1', label: 'symvibe_ipc_dispatch', kind: 'binary', confidence: 'EXTRACTED', offsetOrPath: '0x00401180' },
          { id: 'gn-2', label: '/api/v1/board/snapshot', kind: 'endpoint', confidence: 'EXTRACTED', offsetOrPath: '0x004011A0' },
          { id: 'gn-3', label: 'AgentOS Token Proxy', kind: 'module', confidence: 'EXTRACTED', offsetOrPath: '0x004011B0' },
          { id: 'gn-4', label: 'Swarm Lock Arbiter', kind: 'store', confidence: 'INFERRED', offsetOrPath: '0x00402410' },
        ],
        graphEdges: [
          { id: 'ge-1', from: 'gn-1', to: 'gn-2', relation: 'calls_endpoint', confidence: 'EXTRACTED' },
          { id: 'ge-2', from: 'gn-2', to: 'gn-3', relation: 'validates_token', confidence: 'EXTRACTED' },
          { id: 'ge-3', from: 'gn-1', to: 'gn-4', relation: 'acquires_lock', confidence: 'INFERRED' },
        ],
        decompiledCode: `// Reconstructed by REA MCP + Gemini 4 Argon (SHA-256: 8f3a9b2c...)\nexport interface IpcDispatchFrame {\n  opcode: 0x4A | 0x4B;\n  agentRunner: 'gemini-4-argon' | 'codex' | 'claude-code';\n  lockedFiles: string[];\n  payloadSha256: string;\n}\n\nexport async function handleSymvibeIpc(frame: IpcDispatchFrame) {\n  if (frame.opcode === 0x4A) {\n    return { status: 'VERIFIED', syncedAt: new Date().toISOString() };\n  }\n}`,
      },
    },
    {
      id: 'node-kanban-board',
      type: 'kanban',
      title: 'OpenGoat & Claude Swarm Task Board',
      subtitle: 'Role Ownership · Dependency DAG · File-Lock Arbiter',
      x: 1165,
      y: 75,
      width: 475,
      height: 460,
      kanbanPayload: {
        boardTitle: 'Veloce AgenticOS Spatial Integration Sprint',
        swarmConflictStatus: 'NOMINAL',
        tasks: [
          {
            id: 'task-1',
            title: 'Extract IPC & Token Refresh specs via REA MCP',
            column: 'VERIFIED',
            ownerRunner: 'gemini-4-argon',
            targetFile: 'src/adapters/symvibe-spatial-gateway.ts',
            budgetEstimateUsd: 0.12,
            evidenceRef: 'SHA-256: 8f3a9b2c',
          },
          {
            id: 'task-2',
            title: 'Harden AgentOS rate-limiter & persistent store',
            column: 'IN_PROGRESS',
            ownerRunner: 'claude-code',
            dependsOnTaskId: 'task-1',
            targetFile: 'server.ts',
            budgetEstimateUsd: 0.28,
            evidenceRef: 'SHA-256: 9d0e1f2a',
          },
          {
            id: 'task-3',
            title: 'Synthesize 4-stage isolated UI preview from REA spec',
            column: 'IN_PROGRESS',
            ownerRunner: 'gemini-4-argon',
            dependsOnTaskId: 'task-1',
            targetFile: 'src/components/PreviewStudio.tsx',
            budgetEstimateUsd: 0.35,
            evidenceRef: 'SHA-256: 4c91e07a',
          },
          {
            id: 'task-4',
            title: 'Mount VeloceAgenticOSAdapter bridge into main repo',
            column: 'RECON',
            ownerRunner: 'codex',
            dependsOnTaskId: 'task-2',
            targetFile: 'src/core/agentic-os-kernel.ts',
            budgetEstimateUsd: 0.20,
          },
        ],
      },
    },
    {
      id: 'node-terminal-argon',
      type: 'terminal',
      title: 'Agent Terminal 01 · Gemini 4 Argon',
      subtitle: 'Paperclip Session · Reasoning, REA Synthesis & Spec Builder',
      x: 45,
      y: 645,
      width: 510,
      height: 450,
      teamId: 'team-synthesis-studio',
      terminalPayload: {
        runner: 'gemini-4-argon',
        roleTitle: 'Lead Architect & REA Synthesizer',
        openGoatOwner: 'Aryaman / AgenticOS Core',
        workingDir: '/workspace/local-AgenticOS/symvibe-gateway',
        budgetLimitUsd: 2.50,
        budgetUsedUsd: 0.34,
        tokensUsed: 14280,
        lockedFiles: ['src/adapters/symvibe-spatial-gateway.ts'],
        status: 'IDLE',
        history: [
          {
            id: 'th-1',
            timestamp: '18:49:10',
            kind: 'command',
            runner: 'gemini-4-argon',
            text: 'rea-cli inspect symvibe-daemon-arm64.macho --provenance --graphify',
          },
          {
            id: 'th-2',
            timestamp: '18:49:12',
            kind: 'mcp-tool',
            runner: 'gemini-4-argon',
            mcpToolCalled: 'rea_disassemble_binary',
            tokensUsed: 1840,
            costUsd: 0.06,
            text: '[MCP] Verified SHA-256 8f3a9b2c... Extracted 3 deterministic symbols + 1 inferred lock schema.',
          },
          {
            id: 'th-3',
            timestamp: '18:50:02',
            kind: 'output',
            runner: 'gemini-4-argon',
            tokensUsed: 2410,
            costUsd: 0.09,
            text: 'Generated VeloceAgenticOSAdapter contract and piped Stage 2 Component Specs to Preview Studio.',
          },
        ],
      },
    },
    {
      id: 'node-terminal-codex',
      type: 'terminal',
      title: 'Agent Terminal 02 · Codex / Claude Router',
      subtitle: 'Paperclip Session · Upstream Repo & AgentOS Gateway Runner',
      x: 580,
      y: 645,
      width: 495,
      height: 450,
      teamId: 'team-synthesis-studio',
      terminalPayload: {
        runner: 'codex',
        roleTitle: 'Upstream Repo & Gateway Hardener',
        openGoatOwner: 'Codex Parallel Stream',
        workingDir: '/workspace/local-AgenticOS',
        budgetLimitUsd: 2.00,
        budgetUsedUsd: 0.41,
        tokensUsed: 18920,
        lockedFiles: ['src/core/agentic-os-kernel.ts'],
        status: 'IDLE',
        history: [
          {
            id: 'th-c1',
            timestamp: '18:48:30',
            kind: 'command',
            runner: 'codex',
            text: 'repomix --include "src/core/**,src/router/**" --style xml',
          },
          {
            id: 'th-c2',
            timestamp: '18:48:33',
            kind: 'output',
            runner: 'codex',
            tokensUsed: 3840,
            costUsd: 0.08,
            text: 'Packed 3 files (3,840 tokens) from dev4-gpt/local-AgenticOS with zero merge conflicts.',
          },
          {
            id: 'th-c3',
            timestamp: '18:50:20',
            kind: 'mcp-tool',
            runner: 'codex',
            mcpToolCalled: 'agentos_verify_gateway',
            tokensUsed: 1290,
            costUsd: 0.05,
            text: '[AgentOS] Persistent Store: ACTIVE · Token Refresh: ROTATED · Rate Limiter: 60 RPM enforced.',
          },
        ],
      },
    },
    {
      id: 'node-preview-studio',
      type: 'preview-studio',
      title: 'AI Website Cloner + OpenDesign Studio',
      subtitle: '4-Stage Pipeline: Inspection → Specs → Isolated Build → Visual QA',
      x: 1100,
      y: 645,
      width: 525,
      height: 450,
      teamId: 'team-synthesis-studio',
      previewPayload: {
        activeStage: 3,
        targetName: 'Veloce AgenticOS IPC & Router Telemetry Module',
        sourceReaNodeId: 'node-rea-inspector',
        lastBuiltAt: '2026-10-17T18:50:30Z',
        referenceSummary: 'Derived from REA Mach-O symbol 0x00401180 (symvibe_ipc_dispatch) and AgentOS token refresh contract.',
        componentSpecJson: JSON.stringify(
          {
            component: 'VeloceRouterTelemetryPanel',
            provenanceSha256: '8f3a9b2c4e1d7f60',
            props: ['activeRouterModel', 'ipcOpcode', 'rateBucketStatus'],
            actions: ['triggerIpcFrame(0x4A)', 'refreshAgentOsToken()'],
          },
          null,
          2
        ),
        isolatedBuildHtml: DEFAULT_PREVIEW_HTML,
        visualQaChecks: [
          {
            id: 'qa-1',
            criterion: 'Displays verified SHA-256 provenance digest from ResearchOS-Web ledger',
            passed: true,
            evidenceNote: 'Header badge renders SHA-256 VERIFIED status with tabular numerals.',
          },
          {
            id: 'qa-2',
            criterion: 'Exposes interactive IPC Frame 0x4A trigger wired to DOM state handler',
            passed: true,
            evidenceNote: 'Trigger IPC Frame button updates #dispatch-out with live timestamp.',
          },
          {
            id: 'qa-3',
            criterion: 'Renders AgentOS rate-limit bucket utilization (RPM) with semantic color contrast',
            passed: true,
            evidenceNote: 'Shows 54 / 60 RPM in high-contrast emerald mono typography.',
          },
        ],
      },
    },
  ],
  edges: [
    {
      id: 'edge-bridge-to-rea',
      fromNodeId: 'node-agenticos-bridge',
      toNodeId: 'node-rea-inspector',
      label: 'Repomix Context + Repo Targets',
      confidence: 'EXTRACTED',
      lastTransferredAt: '18:50:05',
    },
    {
      id: 'edge-rea-to-argon',
      fromNodeId: 'node-rea-inspector',
      toNodeId: 'node-terminal-argon',
      label: 'SHA-256 Evidence + Graphify DAG',
      confidence: 'EXTRACTED',
      lastTransferredAt: '18:50:12',
    },
    {
      id: 'edge-argon-to-preview',
      fromNodeId: 'node-terminal-argon',
      toNodeId: 'node-preview-studio',
      label: 'Stage 2 Specs → Stage 3 Build',
      confidence: 'INFERRED',
      lastTransferredAt: '18:50:30',
    },
    {
      id: 'edge-rea-to-kanban',
      fromNodeId: 'node-rea-inspector',
      toNodeId: 'node-kanban-board',
      label: 'Recon Tasks & Lock Rules',
      confidence: 'EXTRACTED',
      lastTransferredAt: '18:50:18',
    },
  ],
  adapterSubsystems: [
    {
      id: 'sub-memory',
      name: 'AgenticOS Memory & Provenance Ledger',
      tier: 'REUSE',
      sourceRepo: 'dev4-gpt/local-AgenticOS',
      status: 'CONNECTED',
      description: 'Connects to existing AgenticOS Memory & Decision Log without duplicating storage.',
      endpointOrContract: 'VeloceAgenticOSAdapter.memory.sync()',
      callsCount: 28,
      lastLatencyMs: 14,
      details: 'Bi-directional sync active; preserves ResearchOS-Web SHA-256 provenance hashes.',
    },
    {
      id: 'sub-tasks',
      name: 'Work Queue & Task Ownership',
      tier: 'REUSE',
      sourceRepo: 'dev4-gpt/local-AgenticOS + OpenGoat',
      status: 'CONNECTED',
      description: 'Reuses local-AgenticOS task definitions enriched with OpenGoat role ownership.',
      endpointOrContract: 'VeloceAgenticOSAdapter.tasks.dispatch()',
      callsCount: 19,
      lastLatencyMs: 18,
      details: 'Maps Kanban board tasks directly to AgenticOS work queue items.',
    },
    {
      id: 'sub-router',
      name: 'Multi-Model Router (Gemini 4 Argon / Codex / Claude)',
      tier: 'REUSE',
      sourceRepo: 'dev4-gpt/Claude-code-multi-model',
      status: 'CONNECTED',
      description: 'Routes complex planning & tool calls to gemini-4-argon and TTS to gemini-3.8-flash-lite-tts.',
      endpointOrContract: 'VeloceAgenticOSAdapter.router.invoke()',
      callsCount: 42,
      lastLatencyMs: 142,
      details: 'Hybrid routing active: gemini-4-argon for reasoning + gemini-3.8-flash-lite-tts for audio.',
    },
    {
      id: 'sub-agentos-storage',
      name: 'AgentOS Persistent Workspace Storage',
      tier: 'EXTEND',
      sourceRepo: 'dev4-gpt/AgentOS (Gap #1 Closed)',
      status: 'HARDENED',
      description: 'Completes unfinished AgentOS README item: durable disk persistence for gateway & canvas state.',
      endpointOrContract: 'POST /api/workspace/save (.symvibe-workspace.json)',
      callsCount: 16,
      lastLatencyMs: 9,
      details: 'Persists canvas nodes, edges, memory items, and token state to disk automatically.',
    },
    {
      id: 'sub-agentos-token',
      name: 'AgentOS Automatic Token Refresh Manager',
      tier: 'EXTEND',
      sourceRepo: 'dev4-gpt/AgentOS (Gap #2 Closed)',
      status: 'HARDENED',
      description: 'Completes unfinished AgentOS README item: automatic bearer token rotation and expiry renewal.',
      endpointOrContract: 'POST /api/agentos/token-refresh',
      callsCount: 11,
      lastLatencyMs: 12,
      details: 'Rotates HMAC session tokens before TTL expiry across MCP tool invocations.',
    },
    {
      id: 'sub-agentos-ratelimit',
      name: 'AgentOS Sliding-Window Rate-Limit Enforcer',
      tier: 'EXTEND',
      sourceRepo: 'dev4-gpt/AgentOS (Gap #3 Closed)',
      status: 'HARDENED',
      description: 'Completes unfinished AgentOS README item: per-runner and per-tool RPM token bucket enforcement.',
      endpointOrContract: 'POST /api/agentos/rate-limit',
      callsCount: 64,
      lastLatencyMs: 4,
      details: 'Enforces 60 RPM global & per-agent quotas with live telemetry.',
    },
    {
      id: 'sub-rea-provenance',
      name: 'REA MCP + ResearchOS Provenance + Graphify Engine',
      tier: 'BUILD',
      sourceRepo: 'morluto/rea + ResearchOS-Web + Graphify',
      status: 'CONNECTED',
      description: 'Deterministic binary/HAR/JS/URL parser with SHA-256 verification and EXTRACTED vs INFERRED graph.',
      endpointOrContract: 'POST /api/rea/inspect',
      callsCount: 15,
      lastLatencyMs: 185,
      details: 'Computes real crypto SHA-256 digests and synthesizes reconstruction code via gemini-4-argon.',
    },
    {
      id: 'sub-cloner-studio',
      name: '4-Stage Cloner & OpenDesign Artifact Studio',
      tier: 'BUILD',
      sourceRepo: 'AI Website Cloner + nexu-io/open-design',
      status: 'CONNECTED',
      description: 'Reference Inspection → Component Specs → Isolated Build → Visual QA pipeline on canvas.',
      endpointOrContract: 'POST /api/cloner/reconstruct',
      callsCount: 9,
      lastLatencyMs: 210,
      details: 'Compiles REA evidence into live sandboxed HTML/Tailwind previews with automated QA checks.',
    },
  ],
  agentOsGateway: {
    persistentStorage: {
      enabled: true,
      filePath: '.symvibe-workspace.json',
      lastSavedAt: '2026-10-17T18:50:30Z',
      bytesWritten: 28460,
      recordsCount: 24,
    },
    tokenRefresh: {
      activeTokenId: 'agtos_tk_9f82d41a7c3e',
      issuedAt: '2026-10-17T18:45:00Z',
      expiresAt: '2026-10-17T19:45:00Z',
      refreshCount: 3,
      autoRefreshEnabled: true,
    },
    rateLimiter: {
      windowSeconds: 60,
      maxRequestsPerWindow: 60,
      currentWindowRequests: 14,
      blockedRequests: 0,
      perAgentQuotas: {
        'gemini-4-argon': { used: 7, limit: 25 },
        'codex': { used: 4, limit: 20 },
        'claude-code': { used: 3, limit: 15 },
      },
    },
  },
  memoryStore: [
    {
      id: 'mem-1',
      layer: 'Decision',
      title: 'Adapter Boundary for Veloce AgenticOS',
      summary: 'Connect to existing local-AgenticOS Memory, Tasks, Sessions, and Routing rather than rebuilding; run canvas standalone and mount via VeloceAgenticOSAdapter.',
      sourceNodeId: 'node-agenticos-bridge',
      sha256: '4b227777d4dd1fc6',
      createdAt: '2026-10-17T18:47:00Z',
    },
    {
      id: 'mem-2',
      layer: 'Provenance',
      title: 'Symvibe Mach-O IPC Dispatch 0x00401180',
      summary: 'EXTRACTED symbol symvibe_ipc_dispatch_frame verified via SHA-256 8f3a9b2c4e1d7f60; handles PTY multiplex and board state snapshots.',
      sourceNodeId: 'node-rea-inspector',
      sha256: '8f3a9b2c4e1d7f60',
      createdAt: '2026-10-17T18:49:15Z',
    },
    {
      id: 'mem-3',
      layer: 'Work',
      title: 'AgentOS Gateway Hardening Completed',
      summary: 'Closed the 3 unfinished items from AgentOS README: JSON persistent storage, automatic token refresh rotation, and per-agent RPM rate limiting.',
      sourceNodeId: 'node-terminal-codex',
      sha256: '9d0e1f2a8f3a9b2c',
      createdAt: '2026-10-17T18:50:20Z',
    },
  ],
};
