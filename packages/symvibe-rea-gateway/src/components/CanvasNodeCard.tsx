import React, { useState } from 'react';
import {
  Play,
  RefreshCw,
  ArrowRight,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Plus,
  Loader2,
  Move,
  History,
} from 'lucide-react';
import {
  CanvasNode,
  AgentRunnerType,
  ReaTargetType,
  EvidenceConfidence,
  KanbanTaskItem,
} from '../types/symvibe';

interface CanvasNodeCardProps {
  node: CanvasNode;
  isSelected: boolean;
  allLockedFiles: { file: string; nodeId: string; runner: AgentRunnerType }[];
  repomixContextGlobal: string;
  reaSummaryGlobal: string;
  onSelect: (id: string) => void;
  onStartDrag: (e: React.PointerEvent, nodeId: string) => void;
  onUpdateNode: (nodeId: string, updater: (prev: CanvasNode) => CanvasNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onPipeEvidenceToStudio: (sourceNodeId: string) => void;
  onPipeEvidenceToTerminal: (sourceNodeId: string) => void;
  onSyncMemoryRecord: (title: string, summary: string, layer: 'Memory' | 'Research' | 'Work' | 'Decision' | 'Provenance', sourceNodeId: string) => void;
  onUpdateGatewayHealth: (gateway: any) => void;
}

const REA_PRESETS: Record<ReaTargetType, { label: string; target: string; sample: string }> = {
  binary: {
    label: 'Mach-O 64 Daemon',
    target: 'symvibe-daemon-arm64.macho (Apple Silicon + SQLite IPC)',
    sample:
      '7f 45 4c 46 02 01 01 00 | symvibe_ipc_dispatch @ 0x00401180 | /api/v1/board/snapshot | X-AgentOS-TokenRefresh | sqlite3_wal_checkpoint',
  },
  url: {
    label: 'Live Web / API Target',
    target: 'https://symvibe.com',
    sample:
      'GET / HTTP/2 | Infinite board for AI coding agents | Claude Code · Codex · Gemini | Voice Planner WebSocket /api/v1/planner',
  },
  har: {
    label: 'HAR Network Capture',
    target: 'agenticos-router-session.har (14 RPC frames)',
    sample:
      'POST /api/gateway/agenticos/dispatch 200 OK 138ms | X-AgentOS-Token: agtos_tk_9f82 | {"model":"gemini-4-argon","tools":["rea_inspect","repomix_pack"]}',
  },
  bundle: {
    label: 'Electron / JS Bundle',
    target: 'app.asar.unpacked/dist/main.bundle.js',
    sample:
      'ipcMain.handle("symvibe:spawn-pty", async (e, runner) => { return ptyPool.create(runner, { lockArbiter: true }); });',
  },
};

export const CanvasNodeCard: React.FC<CanvasNodeCardProps> = ({
  node,
  isSelected,
  allLockedFiles,
  repomixContextGlobal,
  reaSummaryGlobal,
  onSelect,
  onStartDrag,
  onUpdateNode,
  onDeleteNode,
  onPipeEvidenceToStudio,
  onPipeEvidenceToTerminal,
  onSyncMemoryRecord,
  onUpdateGatewayHealth,
}) => {
  const [reaTab, setReaTab] = useState<'evidence' | 'graph' | 'decompiled' | 'hex'>('evidence');
  const [confidenceFilter, setConfidenceFilter] = useState<'ALL' | EvidenceConfidence>('ALL');
  const [isBusy, setIsBusy] = useState(false);
  const [terminalInput, setTerminalInput] = useState('');
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [clonerCustomPrompt, setClonerCustomPrompt] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskFile, setNewTaskFile] = useState('src/adapters/symvibe-spatial-gateway.ts');

  // 1. Handlers for Veloce AgenticOS & Repomix Bridge Node
  const handleSyncGithubRepo = async () => {
    if (!node.bridgePayload) return;
    setIsBusy(true);
    try {
      const res = await fetch('/api/gateway/github-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: node.bridgePayload.repoUrl,
          branch: node.bridgePayload.branch,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.agentOsGateway) onUpdateGatewayHealth(data.agentOsGateway);
        onUpdateNode(node.id, (prev) => ({
          ...prev,
          bridgePayload: {
            ...prev.bridgePayload!,
            repoUrl: data.repoUrl,
            branch: data.branch,
            lastCommitHash: data.lastCommitHash,
            lastSyncAt: data.lastSyncAt,
            syncSource: data.syncSource,
            files: data.files,
            repomixDigest: data.repomixDigest,
            repomixTokenEstimate: data.repomixTokenEstimate,
          },
        }));
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleRepomixFile = (filePath: string) => {
    if (!node.bridgePayload) return;
    onUpdateNode(node.id, (prev) => {
      const bp = prev.bridgePayload!;
      const updatedFiles = bp.files.map((f) =>
        f.path === filePath ? { ...f, selectedForRepomix: !f.selectedForRepomix } : f
      );
      const selected = updatedFiles.filter((f) => f.selectedForRepomix);
      const digest = [
        `<repomix-pack repo="${bp.repoUrl}" branch="${bp.branch}" files="${selected.length}">`,
        ...selected.map(
          (f) => `  <file path="${f.path}" sha256="${f.sha256.slice(0, 16)}" size="${f.sizeBytes}" />`
        ),
        `</repomix-pack>`,
      ].join('\n');
      const tokenEst = selected.reduce((sum, f) => sum + Math.round(f.sizeBytes / 4), 240);
      return {
        ...prev,
        bridgePayload: {
          ...bp,
          files: updatedFiles,
          repomixDigest: digest,
          repomixTokenEstimate: tokenEst,
        },
      };
    });
  };

  // 2. Handlers for REA MCP Inspector + ResearchOS Provenance + Graphify Node
  const handleRunReaInspection = async () => {
    if (!node.reaPayload) return;
    setIsBusy(true);
    try {
      const res = await fetch('/api/rea/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: node.reaPayload.targetType,
          targetInput: node.reaPayload.targetInput,
          rawSampleContent: node.reaPayload.rawSampleContent,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.agentOsGateway) onUpdateGatewayHealth(data.agentOsGateway);
        onUpdateNode(node.id, (prev) => ({
          ...prev,
          reaPayload: {
            targetType: data.targetType,
            targetInput: data.targetInput,
            rawSampleContent: data.rawSampleContent,
            artifactSha256: data.artifactSha256,
            lastAnalyzedAt: data.lastAnalyzedAt,
            modelUsed: data.modelUsed,
            summary: data.summary,
            hexPreview: data.hexPreview,
            evidenceItems: data.evidenceItems,
            graphNodes: data.graphNodes,
            graphEdges: data.graphEdges,
            decompiledCode: data.decompiledCode,
          },
        }));
      }
    } finally {
      setIsBusy(false);
    }
  };

  // 3. Handlers for Paperclip + Claude Swarm Terminal Node
  const handleExecuteTerminal = async (customCmd?: string) => {
    if (!node.terminalPayload) return;
    const cmd = (customCmd ?? terminalInput).trim();
    if (!cmd) return;
    if (!customCmd) setTerminalInput('');
    setIsBusy(true);

    const otherLocks = allLockedFiles
      .filter((item) => item.nodeId !== node.id)
      .map((item) => item.file);

    const userEntryId = `th-${Date.now()}-usr`;
    const nowTime = new Date().toTimeString().slice(0, 8);

    onUpdateNode(node.id, (prev) => ({
      ...prev,
      terminalPayload: {
        ...prev.terminalPayload!,
        status: 'RUNNING',
        history: [
          ...prev.terminalPayload!.history,
          {
            id: userEntryId,
            timestamp: nowTime,
            kind: 'command',
            runner: prev.terminalPayload!.runner,
            text: cmd,
          },
        ],
      },
    }));

    try {
      const res = await fetch('/api/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runner: node.terminalPayload.runner,
          input: cmd,
          roleTitle: node.terminalPayload.roleTitle,
          repomixContext: repomixContextGlobal,
          reaEvidenceSummary: reaSummaryGlobal,
          otherLockedFiles: otherLocks,
        }),
      });
      const data = await res.json();
      if (data.agentOsGateway) onUpdateGatewayHealth(data.agentOsGateway);

      onUpdateNode(node.id, (prev) => {
        const tp = prev.terminalPayload!;
        const newLocks =
          data.lockedFile && !tp.lockedFiles.includes(data.lockedFile)
            ? [...tp.lockedFiles, data.lockedFile]
            : tp.lockedFiles;

        return {
          ...prev,
          terminalPayload: {
            ...tp,
            status: data.kind === 'conflict-alert' ? 'CONFLICT_WAIT' : 'IDLE',
            tokensUsed: tp.tokensUsed + (data.tokensUsed || 200),
            budgetUsedUsd: Number((tp.budgetUsedUsd + (data.costUsd || 0.01)).toFixed(3)),
            lockedFiles: newLocks,
            history: [
              ...tp.history,
              {
                id: `th-${Date.now()}-out`,
                timestamp: new Date().toTimeString().slice(0, 8),
                kind: data.kind || 'output',
                runner: tp.runner,
                mcpToolCalled: data.mcpToolCalled,
                tokensUsed: data.tokensUsed,
                costUsd: data.costUsd,
                lockedFile: data.lockedFile,
                text: data.outputText || data.error || 'Completed execution.',
              },
            ],
          },
        };
      });
    } finally {
      setIsBusy(false);
    }
  };

  // 4. Handlers for AI Website Cloner + OpenDesign 4-Stage Studio Node
  const handleRunClonerReconstruction = async () => {
    if (!node.previewPayload) return;
    setIsBusy(true);
    try {
      const res = await fetch('/api/cloner/reconstruct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetName: node.previewPayload.targetName,
          reaSummary: reaSummaryGlobal || node.previewPayload.referenceSummary,
          decompiledCode: node.previewPayload.componentSpecJson,
          customInstruction: clonerCustomPrompt || 'Include live interactive controls and SHA-256 verification status.',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.agentOsGateway) onUpdateGatewayHealth(data.agentOsGateway);
        onUpdateNode(node.id, (prev) => ({
          ...prev,
          previewPayload: {
            ...prev.previewPayload!,
            activeStage: 3,
            referenceSummary: data.referenceSummary || prev.previewPayload!.referenceSummary,
            componentSpecJson: data.componentSpecJson || prev.previewPayload!.componentSpecJson,
            isolatedBuildHtml: data.isolatedBuildHtml || prev.previewPayload!.isolatedBuildHtml,
            visualQaChecks: data.visualQaChecks || prev.previewPayload!.visualQaChecks,
            lastBuiltAt: data.lastBuiltAt,
          },
        }));
      }
    } finally {
      setIsBusy(false);
    }
  };

  // 5. Handlers for OpenGoat & Claude Swarm Kanban Board Node
  const handleCycleTaskColumn = (taskId: string) => {
    if (!node.kanbanPayload) return;
    const order: KanbanTaskItem['column'][] = ['RECON', 'IN_PROGRESS', 'VERIFIED'];
    onUpdateNode(node.id, (prev) => {
      const kp = prev.kanbanPayload!;
      const updated = kp.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const nextCol = order[(order.indexOf(t.column) + 1) % order.length];
        return { ...t, column: nextCol };
      });
      return {
        ...prev,
        kanbanPayload: {
          ...kp,
          tasks: updated,
        },
      };
    });
  };

  const handleAddKanbanTask = () => {
    if (!node.kanbanPayload || !newTaskTitle.trim()) return;
    const fileConflict = allLockedFiles.some((l) => l.file === newTaskFile.trim());
    const newTask: KanbanTaskItem = {
      id: `task-${Date.now()}`,
      title: newTaskTitle.trim(),
      column: 'RECON',
      ownerRunner: 'gemini-4-argon',
      targetFile: newTaskFile.trim() || 'src/adapters/symvibe-spatial-gateway.ts',
      budgetEstimateUsd: 0.18,
      evidenceRef: 'SHA-256: verified',
    };
    setNewTaskTitle('');
    onUpdateNode(node.id, (prev) => ({
      ...prev,
      kanbanPayload: {
        ...prev.kanbanPayload!,
        swarmConflictStatus: fileConflict ? 'FILE_LOCK_DETECTED' : 'NOMINAL',
        tasks: [...prev.kanbanPayload!.tasks, newTask],
      },
    }));
  };

  return (
    <div
      style={{
        transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
        width: `${node.width}px`,
        height: `${node.height}px`,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      className={`absolute top-0 left-0 flex flex-col bg-[#111827] rounded-xl border transition-colors select-none ${
        isSelected ? 'border-indigo-500 z-20' : 'border-slate-800 hover:border-slate-700 z-10'
      }`}
    >
      {/* Node Header */}
      <div
        onPointerDown={(e) => onStartDrag(e, node.id)}
        className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800 bg-[#0D131F] rounded-t-xl cursor-grab active:cursor-grabbing"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Move className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <h3 className="text-sm font-semibold text-slate-100 truncate font-display">
              {node.title}
            </h3>
          </div>
          <div className="text-xs text-slate-400 truncate mt-0.5 font-mono tabular-nums">
            {node.subtitle}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {Math.round(node.x)},{Math.round(node.y)}
          </span>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDeleteNode(node.id)}
            className="p-1 text-slate-500 hover:text-red-400 rounded hover:bg-slate-800/70 transition-colors cursor-pointer"
            title="Remove node from canvas"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Node Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
        {/* 1. Veloce AgenticOS & Repomix Bridge Node */}
        {node.type === 'agenticos-bridge' && node.bridgePayload && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={node.bridgePayload.repoUrl}
                onChange={(e) =>
                  onUpdateNode(node.id, (prev) => ({
                    ...prev,
                    bridgePayload: { ...prev.bridgePayload!, repoUrl: e.target.value },
                  }))
                }
                className="flex-1 bg-[#070A0F] border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                placeholder="https://github.com/dev4-gpt/local-AgenticOS"
              />
              <button
                type="button"
                onClick={handleSyncGithubRepo}
                disabled={isBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Sync & Pack
              </button>
            </div>

            {/* Unboxed Metadata Line */}
            <div className="flex items-center flex-wrap gap-1.5 text-xs text-slate-400 font-mono tabular-nums">
              <span className="text-emerald-400">CONNECTED</span>
              <span>·</span>
              <span>Commit {node.bridgePayload.lastCommitHash}</span>
              <span>·</span>
              <span>Repomix {node.bridgePayload.repomixTokenEstimate.toLocaleString()} tok</span>
              <span>·</span>
              <span>{node.bridgePayload.memoryRecordsCount} Memory Records</span>
            </div>

            <div className="border border-slate-800 rounded-lg bg-[#070A0F] divide-y divide-slate-800/80">
              <div className="px-3 py-1.5 text-xs font-medium text-slate-300 flex items-center justify-between">
                <span>Repomix Context Selection (dev4-gpt/local-AgenticOS)</span>
                <span className="text-slate-500 font-mono tabular-nums">SHA-256 Verified</span>
              </div>
              {node.bridgePayload.files.map((f) => (
                <div
                  key={f.path}
                  onClick={() => handleToggleRepomixFile(f.path)}
                  className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-900/80 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={f.selectedForRepomix}
                      onChange={() => {}}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                    <span className="font-mono text-slate-200 truncate">{f.path}</span>
                  </div>
                  <span className="text-slate-500 font-mono tabular-nums shrink-0">
                    {(f.sizeBytes / 1024).toFixed(1)} KB · {f.sha256.slice(0, 6)}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <div className="text-xs text-slate-400 font-mono">
                Generated Repomix XML Digest for Gemini 4 Argon:
              </div>
              <pre className="bg-[#070A0F] border border-slate-800 rounded-lg p-2.5 text-[11px] text-slate-300 font-mono overflow-x-auto max-h-24">
                {node.bridgePayload.repomixDigest}
              </pre>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  onSyncMemoryRecord(
                    `Repomix Snapshot (${node.bridgePayload!.lastCommitHash})`,
                    `Packed ${node.bridgePayload!.files.filter((f) => f.selectedForRepomix).length} files (${node.bridgePayload!.repomixTokenEstimate} tokens) from ${node.bridgePayload!.repoUrl}.`,
                    'Memory',
                    node.id
                  )
                }
                className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Save to AgenticOS Memory
              </button>
              <button
                type="button"
                onClick={() => onPipeEvidenceToTerminal(node.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-200 bg-indigo-950/60 hover:bg-indigo-900/70 border border-indigo-800/60 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Pipe Context to Argon Terminal
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 2. REA MCP Inspector + ResearchOS Provenance + Graphify Node */}
        {node.type === 'rea-inspector' && node.reaPayload && (
          <div className="space-y-3">
            {/* Target Mode Segmented Selector */}
            <div className="flex items-center gap-1 p-1 bg-[#070A0F] border border-slate-800 rounded-lg">
              {(['binary', 'url', 'har', 'bundle'] as ReaTargetType[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    const preset = REA_PRESETS[mode];
                    onUpdateNode(node.id, (prev) => ({
                      ...prev,
                      reaPayload: {
                        ...prev.reaPayload!,
                        targetType: mode,
                        targetInput: preset.target,
                        rawSampleContent: preset.sample,
                      },
                    }));
                  }}
                  className={`flex-1 py-1 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    node.reaPayload!.targetType === mode
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={node.reaPayload.targetInput}
                onChange={(e) =>
                  onUpdateNode(node.id, (prev) => ({
                    ...prev,
                    reaPayload: { ...prev.reaPayload!, targetInput: e.target.value },
                  }))
                }
                className="flex-1 bg-[#070A0F] border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                placeholder="Target URL, binary name, or HAR path..."
              />
              <button
                type="button"
                onClick={handleRunReaInspection}
                disabled={isBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Inspect via REA
              </button>
            </div>

            {/* Unboxed Provenance Metadata */}
            <div className="flex items-center flex-wrap gap-1.5 text-xs text-slate-400 font-mono tabular-nums">
              <span className="text-emerald-400">SHA-256: {node.reaPayload.artifactSha256.slice(0, 12)}…</span>
              <span>·</span>
              <span>Model: {node.reaPayload.modelUsed}</span>
              <span>·</span>
              <span>{node.reaPayload.evidenceItems.length} Findings</span>
            </div>

            {/* View Sub-Tabs */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-3">
                {(['evidence', 'graph', 'decompiled', 'hex'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setReaTab(t)}
                    className={`text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      reaTab === t ? 'text-indigo-400 underline underline-offset-4' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t === 'graph' ? 'Graphify DAG' : t}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {(['ALL', 'EXTRACTED', 'INFERRED'] as const).map((cf) => (
                  <button
                    key={cf}
                    type="button"
                    onClick={() => setConfidenceFilter(cf)}
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors cursor-pointer ${
                      confidenceFilter === cf
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {cf}
                  </button>
                ))}
              </div>
            </div>

            {reaTab === 'evidence' && (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {node.reaPayload.evidenceItems
                  .filter((item) => confidenceFilter === 'ALL' || item.confidence === confidenceFilter)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-lg bg-[#070A0F] border border-slate-800/90 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 font-mono tabular-nums text-[11px]">
                        <span className="font-semibold text-slate-100 truncate">{item.title}</span>
                        <span
                          className={
                            item.confidence === 'EXTRACTED' ? 'text-emerald-400 shrink-0' : 'text-amber-400 shrink-0'
                          }
                        >
                          {item.confidence} · {item.offsetOrLine}
                        </span>
                      </div>
                      <p className="text-slate-300 text-xs leading-snug">{item.finding}</p>
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                        Tool: {item.mcpTool} · Provenance Hash: {item.sha256}
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {reaTab === 'graph' && (
              <div className="p-3 rounded-lg bg-[#070A0F] border border-slate-800 space-y-2.5">
                <div className="text-[11px] text-slate-400 font-mono">
                  Graphify Evidence Topology (Solid = EXTRACTED · Amber = INFERRED)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {node.reaPayload.graphNodes.map((gn) => (
                    <div
                      key={gn.id}
                      className="p-2 rounded border border-slate-800 bg-[#0D131F] flex flex-col justify-between"
                    >
                      <div className="text-xs font-medium text-slate-100 truncate">{gn.label}</div>
                      <div className="text-[10px] font-mono tabular-nums text-slate-400 mt-1">
                        <span className={gn.confidence === 'EXTRACTED' ? 'text-emerald-400' : 'text-amber-400'}>
                          {gn.confidence}
                        </span>{' '}
                        · {gn.offsetOrPath}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 pt-1 border-t border-slate-800/80 font-mono text-[11px]">
                  {node.reaPayload.graphEdges.map((ge) => (
                    <div key={ge.id} className="flex items-center justify-between text-slate-300">
                      <span>
                        {ge.from} ──[{ge.relation}]──► {ge.to}
                      </span>
                      <span className={ge.confidence === 'EXTRACTED' ? 'text-emerald-400' : 'text-amber-400'}>
                        {ge.confidence}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reaTab === 'decompiled' && (
              <pre className="bg-[#070A0F] border border-slate-800 rounded-lg p-2.5 text-[11px] text-slate-200 font-mono overflow-x-auto max-h-44">
                {node.reaPayload.decompiledCode}
              </pre>
            )}

            {reaTab === 'hex' && (
              <pre className="bg-[#070A0F] border border-slate-800 rounded-lg p-2.5 text-[11px] text-emerald-300/90 font-mono overflow-x-auto max-h-44">
                {node.reaPayload.hexPreview.join('\n')}
              </pre>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => onPipeEvidenceToTerminal(node.id)}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Pipe Evidence to Terminal
              </button>
              <button
                type="button"
                onClick={() => onPipeEvidenceToStudio(node.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-200 bg-indigo-950/60 hover:bg-indigo-900/70 border border-indigo-800/60 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Pipe to 4-Stage Cloner Studio
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 3. Paperclip + Claude Swarm + OpenGoat Multi-Agent Terminal Node */}
        {node.type === 'terminal' && node.terminalPayload && (
          <div className="space-y-2.5 flex flex-col h-full">
            {/* Runner & Budget Telemetry Bar */}
            <div className="flex items-center justify-between gap-2 bg-[#070A0F] border border-slate-800 rounded-lg px-2.5 py-1.5">
              <div className="flex items-center gap-1.5">
                {(['gemini-4-argon', 'codex', 'claude-code'] as AgentRunnerType[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      onUpdateNode(node.id, (prev) => ({
                        ...prev,
                        terminalPayload: { ...prev.terminalPayload!, runner: r },
                      }))
                    }
                    className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      node.terminalPayload!.runner === r
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-300">
                ${node.terminalPayload.budgetUsedUsd.toFixed(2)} / ${node.terminalPayload.budgetLimitUsd.toFixed(2)}
              </div>
            </div>

            {/* File Locks & OpenGoat Role Info */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
              <span className="truncate">
                Owner: {node.terminalPayload.openGoatOwner} · {node.terminalPayload.tokensUsed.toLocaleString()} tok
              </span>
              <span className="flex items-center gap-1 text-amber-400 shrink-0">
                <Lock className="w-3 h-3" />
                {node.terminalPayload.lockedFiles.length} Locked
              </span>
            </div>

            {/* Terminal Stream Output */}
            <div className="bg-[#070A0F] border border-slate-800 rounded-lg p-2.5 font-mono text-[11px] space-y-2 max-h-44 overflow-y-auto">
              {(replayIndex !== null
                ? node.terminalPayload.history.slice(0, replayIndex + 1)
                : node.terminalPayload.history
              ).map((entry) => (
                <div key={entry.id} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 tabular-nums">
                    <span>
                      [{entry.timestamp}] {entry.runner} · {entry.kind.toUpperCase()}
                    </span>
                    {entry.costUsd !== undefined && (
                      <span>
                        {entry.tokensUsed} tok · ${entry.costUsd.toFixed(4)}
                      </span>
                    )}
                  </div>
                  <div
                    className={`whitespace-pre-wrap leading-relaxed ${
                      entry.kind === 'command'
                        ? 'text-indigo-300 font-semibold'
                        : entry.kind === 'conflict-alert'
                        ? 'text-red-400 font-semibold'
                        : entry.kind === 'mcp-tool'
                        ? 'text-emerald-300'
                        : 'text-slate-200'
                    }`}
                  >
                    {entry.kind === 'command' ? `$ ${entry.text}` : entry.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick CLI Presets & Replay Button */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => handleExecuteTerminal('agentos status')}
                  className="px-2 py-1 text-[11px] font-mono text-slate-300 bg-[#070A0F] hover:bg-slate-800 border border-slate-800 rounded whitespace-nowrap shrink-0 cursor-pointer"
                >
                  agentos status
                </button>
                <button
                  type="button"
                  onClick={() => handleExecuteTerminal('lock src/core/agentic-os-kernel.ts')}
                  className="px-2 py-1 text-[11px] font-mono text-slate-300 bg-[#070A0F] hover:bg-slate-800 border border-slate-800 rounded whitespace-nowrap shrink-0 cursor-pointer"
                >
                  test lock conflict
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  const len = node.terminalPayload!.history.length;
                  if (replayIndex === null) setReplayIndex(0);
                  else if (replayIndex + 1 < len) setReplayIndex(replayIndex + 1);
                  else setReplayIndex(null);
                }}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-indigo-300 bg-indigo-950/50 border border-indigo-800/50 rounded whitespace-nowrap shrink-0 cursor-pointer"
              >
                <History className="w-3 h-3" />
                {replayIndex === null ? 'Replay' : `Step ${replayIndex + 1}/${node.terminalPayload.history.length}`}
              </button>
            </div>

            {/* Command / Agent Prompt Input */}
            <div className="flex items-center gap-2 pt-0.5">
              <input
                type="text"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleExecuteTerminal();
                }}
                placeholder="Run CLI command or prompt Gemini 4 Argon..."
                className="flex-1 bg-[#070A0F] border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => handleExecuteTerminal()}
                disabled={isBusy}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isBusy ? 'Running...' : 'Run'}
              </button>
            </div>
          </div>
        )}

        {/* 4. AI Website Cloner + OpenDesign 4-Stage Reconstruction Studio Node */}
        {node.type === 'preview-studio' && node.previewPayload && (
          <div className="space-y-2.5">
            {/* 4-Stage Stepper */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-[#070A0F] border border-slate-800 rounded-lg">
              {(
                [
                  { s: 1, label: '1. Inspection' },
                  { s: 2, label: '2. Specs' },
                  { s: 3, label: '3. Build' },
                  { s: 4, label: '4. Visual QA' },
                ] as const
              ).map((item) => (
                <button
                  key={item.s}
                  type="button"
                  onClick={() =>
                    onUpdateNode(node.id, (prev) => ({
                      ...prev,
                      previewPayload: { ...prev.previewPayload!, activeStage: item.s },
                    }))
                  }
                  className={`py-1 px-1.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    node.previewPayload!.activeStage === item.s
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {node.previewPayload.activeStage === 1 && (
              <div className="p-3 rounded-lg bg-[#070A0F] border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-100">
                  Stage 1 · Reference Inspection & Provenance Source
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {node.previewPayload.referenceSummary}
                </p>
                <div className="text-[11px] font-mono text-emerald-400 tabular-nums">
                  Linked REA Inspector Node: {node.previewPayload.sourceReaNodeId || 'node-rea-inspector'}
                </div>
              </div>
            )}

            {node.previewPayload.activeStage === 2 && (
              <div className="space-y-1.5">
                <div className="text-xs text-slate-400 font-mono">
                  Stage 2 · Extracted Component Spec Contract (JSON):
                </div>
                <pre className="bg-[#070A0F] border border-slate-800 rounded-lg p-2.5 text-[11px] text-slate-200 font-mono overflow-x-auto max-h-48">
                  {node.previewPayload.componentSpecJson}
                </pre>
              </div>
            )}

            {node.previewPayload.activeStage === 3 && (
              <div className="border border-slate-800 rounded-lg overflow-hidden bg-[#090D14] h-52">
                <iframe
                  title={`Preview-${node.id}`}
                  srcDoc={node.previewPayload.isolatedBuildHtml}
                  sandbox="allow-scripts"
                  className="w-full h-full border-0"
                />
              </div>
            )}

            {node.previewPayload.activeStage === 4 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {node.previewPayload.visualQaChecks.map((qa) => (
                  <div
                    key={qa.id}
                    className="p-2.5 rounded-lg bg-[#070A0F] border border-slate-800 flex items-start gap-2.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="text-xs font-medium text-slate-100">{qa.criterion}</div>
                      <div className="text-[11px] text-slate-400">{qa.evidenceNote}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Regenerate Controls */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={clonerCustomPrompt}
                onChange={(e) => setClonerCustomPrompt(e.target.value)}
                placeholder="Customize reconstruction spec for Gemini 4 Argon..."
                className="flex-1 bg-[#070A0F] border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleRunClonerReconstruction}
                disabled={isBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Rebuild via Argon
              </button>
            </div>
          </div>
        )}

        {/* 5. OpenGoat & Claude Swarm Kanban Board Node */}
        {node.type === 'kanban' && node.kanbanPayload && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono tabular-nums">
              <span className="text-slate-300">
                {node.kanbanPayload.tasks.length} Tasks · Dependency DAG Active
              </span>
              <span
                className={
                  node.kanbanPayload.swarmConflictStatus === 'NOMINAL'
                    ? 'text-emerald-400'
                    : 'text-amber-400 flex items-center gap-1'
                }
              >
                {node.kanbanPayload.swarmConflictStatus !== 'NOMINAL' && (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                {node.kanbanPayload.swarmConflictStatus}
              </span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {node.kanbanPayload.tasks.map((task) => {
                const isFileLocked = allLockedFiles.some((l) => l.file === task.targetFile);
                return (
                  <div
                    key={task.id}
                    className="p-2.5 rounded-lg bg-[#070A0F] border border-slate-800 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-slate-100 leading-snug">
                        {task.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCycleTaskColumn(task.id)}
                        className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          task.column === 'VERIFIED'
                            ? 'border-emerald-800 text-emerald-300 bg-emerald-950/40'
                            : task.column === 'IN_PROGRESS'
                            ? 'border-indigo-800 text-indigo-300 bg-indigo-950/40'
                            : 'border-slate-700 text-slate-300 bg-slate-900'
                        }`}
                      >
                        {task.column}
                      </button>
                    </div>
                    <div className="flex items-center flex-wrap gap-1.5 text-[11px] text-slate-400 font-mono tabular-nums">
                      <span className="text-indigo-400">{task.ownerRunner}</span>
                      <span>·</span>
                      <span className="truncate max-w-[180px]">{task.targetFile}</span>
                      <span>·</span>
                      <span>${task.budgetEstimateUsd.toFixed(2)}</span>
                      {isFileLocked && (
                        <>
                          <span>·</span>
                          <span className="text-amber-400">LOCKED</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Add OpenGoat task..."
                className="flex-1 bg-[#070A0F] border border-slate-800 rounded-md px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
              <input
                type="text"
                value={newTaskFile}
                onChange={(e) => setNewTaskFile(e.target.value)}
                placeholder="Target file..."
                className="w-32 bg-[#070A0F] border border-slate-800 rounded-md px-2 py-1.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleAddKanbanTask}
                className="p-1.5 text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition-colors cursor-pointer"
                title="Add task"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* 6. Sticky Note & Decision Log Node */}
        {node.type === 'note' && node.notePayload && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Layer: {node.notePayload.category}</span>
              <span className="text-emerald-400">
                {node.notePayload.syncedToAgenticOs ? 'SYNCED TO AGENTICOS' : 'LOCAL DRAFT'}
              </span>
            </div>
            <textarea
              value={node.notePayload.content}
              onChange={(e) =>
                onUpdateNode(node.id, (prev) => ({
                  ...prev,
                  notePayload: {
                    ...prev.notePayload!,
                    content: e.target.value,
                    updatedAt: new Date().toISOString(),
                  },
                }))
              }
              rows={5}
              className="w-full bg-[#070A0F] border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 leading-relaxed"
            />
            <button
              type="button"
              onClick={() =>
                onSyncMemoryRecord(
                  node.title,
                  node.notePayload!.content,
                  'Decision',
                  node.id
                )
              }
              className="w-full py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
            >
              Commit Note to Veloce AgenticOS Memory Ledger
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
