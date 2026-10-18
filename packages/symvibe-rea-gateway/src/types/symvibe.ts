export type AdapterTier = 'REUSE' | 'EXTEND' | 'BUILD';

export type AvailabilityStatus = 'CONNECTED' | 'HARDENED' | 'STANDALONE_EMULATED' | 'RATE_LIMITED';

export interface AdapterSubsystem {
  id: string;
  name: string;
  tier: AdapterTier;
  sourceRepo: string;
  status: AvailabilityStatus;
  description: string;
  endpointOrContract: string;
  callsCount: number;
  lastLatencyMs: number;
  details: string;
}

export interface AgentOsGatewayHealth {
  persistentStorage: {
    enabled: boolean;
    filePath: string;
    lastSavedAt: string;
    bytesWritten: number;
    recordsCount: number;
  };
  tokenRefresh: {
    activeTokenId: string;
    issuedAt: string;
    expiresAt: string;
    refreshCount: number;
    autoRefreshEnabled: boolean;
  };
  rateLimiter: {
    windowSeconds: number;
    maxRequestsPerWindow: number;
    currentWindowRequests: number;
    blockedRequests: number;
    perAgentQuotas: Record<string, { used: number; limit: number }>;
  };
}

export type EvidenceConfidence = 'EXTRACTED' | 'INFERRED';

export interface ProvenanceEvidenceItem {
  id: string;
  category: 'Endpoint' | 'Symbol' | 'Header' | 'StateSchema' | 'BinarySection' | 'AuthFlow' | 'DOMStructure';
  title: string;
  finding: string;
  confidence: EvidenceConfidence;
  sha256: string;
  offsetOrLine: string;
  mcpTool: string;
  reconstructedSnippet: string;
}

export interface GraphifyNode {
  id: string;
  label: string;
  kind: 'binary' | 'module' | 'endpoint' | 'component' | 'store';
  confidence: EvidenceConfidence;
  offsetOrPath: string;
}

export interface GraphifyEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
  confidence: EvidenceConfidence;
}

export type ReaTargetType = 'url' | 'har' | 'bundle' | 'binary';

export interface ReaInspectionPayload {
  targetType: ReaTargetType;
  targetInput: string;
  rawSampleContent: string;
  artifactSha256: string;
  lastAnalyzedAt: string;
  modelUsed: string;
  summary: string;
  hexPreview: string[];
  evidenceItems: ProvenanceEvidenceItem[];
  graphNodes: GraphifyNode[];
  graphEdges: GraphifyEdge[];
  decompiledCode: string;
}

export type AgentRunnerType = 'gemini-4-argon' | 'codex' | 'claude-code';

export interface TerminalHistoryEntry {
  id: string;
  timestamp: string;
  kind: 'command' | 'agent-prompt' | 'mcp-tool' | 'output' | 'conflict-alert';
  runner: AgentRunnerType;
  text: string;
  mcpToolCalled?: string;
  tokensUsed?: number;
  costUsd?: number;
  lockedFile?: string;
}

export interface TerminalNodePayload {
  runner: AgentRunnerType;
  roleTitle: string;
  openGoatOwner: string;
  workingDir: string;
  budgetLimitUsd: number;
  budgetUsedUsd: number;
  tokensUsed: number;
  lockedFiles: string[];
  status: 'IDLE' | 'RUNNING' | 'CONFLICT_WAIT';
  history: TerminalHistoryEntry[];
}

export interface ClonerVisualQaCheck {
  id: string;
  criterion: string;
  passed: boolean;
  evidenceNote: string;
}

export interface PreviewStudioPayload {
  activeStage: 1 | 2 | 3 | 4;
  targetName: string;
  sourceReaNodeId?: string;
  referenceSummary: string;
  componentSpecJson: string;
  isolatedBuildHtml: string;
  visualQaChecks: ClonerVisualQaCheck[];
  lastBuiltAt: string;
}

export interface RepoFileEntry {
  path: string;
  sizeBytes: number;
  language: string;
  selectedForRepomix: boolean;
  contentPreview: string;
  sha256: string;
}

export interface AgenticOsBridgePayload {
  repoUrl: string;
  branch: string;
  lastCommitHash: string;
  lastSyncAt: string;
  syncSource: string;
  files: RepoFileEntry[];
  repomixDigest: string;
  repomixTokenEstimate: number;
  memoryRecordsCount: number;
}

export interface KanbanTaskItem {
  id: string;
  title: string;
  column: 'RECON' | 'IN_PROGRESS' | 'VERIFIED';
  ownerRunner: AgentRunnerType;
  dependsOnTaskId?: string;
  targetFile: string;
  budgetEstimateUsd: number;
  evidenceRef?: string;
}

export interface KanbanNodePayload {
  boardTitle: string;
  swarmConflictStatus: 'NOMINAL' | 'FILE_LOCK_DETECTED';
  tasks: KanbanTaskItem[];
}

export interface StickyNotePayload {
  category: 'Architecture' | 'Memory' | 'DecisionLog' | 'Hypothesis';
  content: string;
  authorRunner: string;
  syncedToAgenticOs: boolean;
  updatedAt: string;
}

export type CanvasNodeType =
  | 'agenticos-bridge'
  | 'rea-inspector'
  | 'terminal'
  | 'preview-studio'
  | 'kanban'
  | 'note';

export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  teamId?: string;
  bridgePayload?: AgenticOsBridgePayload;
  reaPayload?: ReaInspectionPayload;
  terminalPayload?: TerminalNodePayload;
  previewPayload?: PreviewStudioPayload;
  kanbanPayload?: KanbanNodePayload;
  notePayload?: StickyNotePayload;
}

export interface CanvasEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label: string;
  confidence: EvidenceConfidence;
  lastTransferredAt?: string;
}

export interface TeamFrame {
  id: string;
  name: string;
  sourcePattern: string;
  x: number;
  y: number;
  width: number;
  height: number;
  leadRunner: AgentRunnerType;
  sharedGoal: string;
}

export interface AgenticOsMemoryItem {
  id: string;
  layer: 'Memory' | 'Research' | 'Work' | 'Decision' | 'Provenance';
  title: string;
  summary: string;
  sourceNodeId: string;
  sha256: string;
  createdAt: string;
}

export interface SymvibeWorkspaceState {
  camera: {
    x: number;
    y: number;
    zoom: number;
  };
  activeModel: string;
  teams: TeamFrame[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  adapterSubsystems: AdapterSubsystem[];
  agentOsGateway: AgentOsGatewayHealth;
  memoryStore: AgenticOsMemoryItem[];
}
