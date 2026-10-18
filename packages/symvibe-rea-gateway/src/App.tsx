import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Save,
  Check,
  Terminal,
  SearchCode,
  GitBranch,
  LayoutGrid,
  Kanban,
  StickyNote,
} from 'lucide-react';
import { TopBar, WorkspaceViewTab } from './components/TopBar';
import { CanvasNodeCard } from './components/CanvasNodeCard';
import { AdapterMatrixDrawer } from './components/AdapterMatrixDrawer';
import { VoicePlannerModal } from './components/VoicePlannerModal';
import { INITIAL_WORKSPACE_STATE, DEFAULT_PREVIEW_HTML } from './data/defaultWorkspace';
import {
  SymvibeWorkspaceState,
  CanvasNode,
  CanvasNodeType,
  AgentRunnerType,
} from './types/symvibe';

export default function App() {
  const [workspace, setWorkspace] = useState<SymvibeWorkspaceState>(INITIAL_WORKSPACE_STATE);
  const [activeTab, setActiveTab] = useState<WorkspaceViewTab>('canvas');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('node-rea-inspector');
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Panning and node-dragging refs
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, camX: 0, camY: 0 });
  const draggingNodeRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Load persisted workspace on startup
  useEffect(() => {
    fetch('/api/workspace/load')
      .then((r) => r.json())
      .then((data) => {
        if (data.loadedFromDisk && data.workspace?.nodes?.length) {
          setWorkspace({
            ...data.workspace,
            agentOsGateway: data.agentOsGateway || INITIAL_WORKSPACE_STATE.agentOsGateway,
          });
        } else if (data.agentOsGateway) {
          setWorkspace((prev) => ({ ...prev, agentOsGateway: data.agentOsGateway }));
        }
      })
      .catch(() => {
        // Fallback to initial workspace state
      });
  }, []);

  const triggerToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 2600);
  };

  const handleSaveWorkspaceToDisk = async (customState?: SymvibeWorkspaceState) => {
    const stateToSave = customState || workspace;
    try {
      const res = await fetch('/api/workspace/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: stateToSave }),
      });
      const data = await res.json();
      if (data.agentOsGateway) {
        setWorkspace((prev) => ({ ...prev, agentOsGateway: data.agentOsGateway }));
      }
      triggerToast('Saved to .symvibe-workspace.json');
    } catch (_err) {
      triggerToast('Saved locally');
    }
  };

  // Compute global Repomix context and REA summary for cross-node piping
  const repomixContextGlobal = useMemo(() => {
    const bridge = workspace.nodes.find((n) => n.type === 'agenticos-bridge' && n.bridgePayload);
    return bridge?.bridgePayload?.repomixDigest || '';
  }, [workspace.nodes]);

  const reaSummaryGlobal = useMemo(() => {
    const rea = workspace.nodes.find((n) => n.type === 'rea-inspector' && n.reaPayload);
    if (!rea?.reaPayload) return '';
    return `${rea.reaPayload.summary}\nSHA-256: ${rea.reaPayload.artifactSha256}\n${rea.reaPayload.decompiledCode}`;
  }, [workspace.nodes]);

  const allLockedFiles = useMemo(() => {
    const list: { file: string; nodeId: string; runner: AgentRunnerType }[] = [];
    workspace.nodes.forEach((n) => {
      if (n.type === 'terminal' && n.terminalPayload) {
        n.terminalPayload.lockedFiles.forEach((f) => {
          list.push({ file: f, nodeId: n.id, runner: n.terminalPayload!.runner });
        });
      }
    });
    return list;
  }, [workspace.nodes]);

  // Canvas pointer handlers
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    isPanningRef.current = true;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      camX: workspace.camera.x,
      camY: workspace.camera.y,
    };
  };

  const handleStartNodeDrag = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    const targetNode = workspace.nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;
    setSelectedNodeId(nodeId);
    draggingNodeRef.current = {
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      origX: targetNode.x,
      origY: targetNode.y,
    };
  };

  const handleGlobalPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingNodeRef.current) {
      const { nodeId, startX, startY, origX, origY } = draggingNodeRef.current;
      const dx = (e.clientX - startX) / workspace.camera.zoom;
      const dy = (e.clientY - startY) / workspace.camera.zoom;
      const snappedX = Math.round((origX + dx) / 12) * 12;
      const snappedY = Math.round((origY + dy) / 12) * 12;

      setWorkspace((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === nodeId ? { ...n, x: snappedX, y: snappedY } : n
        ),
      }));
      return;
    }

    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setWorkspace((prev) => ({
        ...prev,
        camera: {
          ...prev.camera,
          x: panStartRef.current.camX + dx,
          y: panStartRef.current.camY + dy,
        },
      }));
    }
  };

  const handleGlobalPointerUp = () => {
    isPanningRef.current = false;
    draggingNodeRef.current = null;
  };

  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      setWorkspace((prev) => ({
        ...prev,
        camera: {
          ...prev.camera,
          zoom: Math.min(1.6, Math.max(0.4, Number((prev.camera.zoom + delta).toFixed(2)))),
        },
      }));
    }
  };

  const handleUpdateNode = (nodeId: string, updater: (prev: CanvasNode) => CanvasNode) => {
    setWorkspace((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? updater(n) : n)),
    }));
  };

  const handleDeleteNode = (nodeId: string) => {
    setWorkspace((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== nodeId),
      edges: prev.edges.filter((e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId),
    }));
  };

  const handleSpawnNode = (type: CanvasNodeType) => {
    const id = `node-${type}-${Date.now()}`;
    const offset = (workspace.nodes.length % 5) * 36;
    const baseX = Math.round((-workspace.camera.x + 280) / workspace.camera.zoom) + offset;
    const baseY = Math.round((-workspace.camera.y + 140) / workspace.camera.zoom) + offset;

    let newNode: CanvasNode = {
      id,
      type,
      title: 'Workspace Node',
      subtitle: 'Veloce AgenticOS Spatial Node',
      x: baseX,
      y: baseY,
      width: 480,
      height: 430,
    };

    if (type === 'terminal') {
      newNode = {
        ...newNode,
        title: `Agent Terminal · Gemini 4 Argon`,
        subtitle: 'Paperclip Session · MCP Tool Runner',
        terminalPayload: {
          runner: 'gemini-4-argon',
          roleTitle: 'Feature Synthesizer',
          openGoatOwner: 'Aryaman / AgenticOS',
          workingDir: '/workspace/local-AgenticOS',
          budgetLimitUsd: 2.0,
          budgetUsedUsd: 0.0,
          tokensUsed: 0,
          lockedFiles: [],
          status: 'IDLE',
          history: [
            {
              id: `th-${Date.now()}`,
              timestamp: new Date().toTimeString().slice(0, 8),
              kind: 'output',
              runner: 'gemini-4-argon',
              text: 'Initialized new Paperclip agent terminal session connected to Veloce AgenticOS adapter.',
            },
          ],
        },
      };
    } else if (type === 'rea-inspector') {
      newNode = {
        ...newNode,
        title: 'REA MCP Inspector + Provenance',
        subtitle: 'morluto/rea · SHA-256 + Graphify Engine',
        width: 510,
        height: 450,
        reaPayload: {
          targetType: 'url',
          targetInput: 'https://symvibe.com',
          rawSampleContent: 'GET / HTTP/2 | Infinite board for AI coding agents | Voice Planner',
          artifactSha256: '8f3a9b2c4e1d7f605a9e2b1c8d4f6a0b3c5e7f9a1b2c3d4e5f6a7b8c9d0e1f2a',
          lastAnalyzedAt: new Date().toISOString(),
          modelUsed: 'gemini-4-argon',
          summary: 'Ready to inspect URL, HAR capture, JS bundle, or native Mach-O/ELF binary.',
          hexPreview: ['00401180: 73 79 6d 76 69 62 65 5f  69 70 63 5f 64 69 73 70  |symvibe_ipc_disp|'],
          evidenceItems: [
            {
              id: `ev-${Date.now()}`,
              category: 'Endpoint',
              title: 'GET / (Symvibe Spatial Board Entry)',
              finding: 'Initial target queued for deterministic + Gemini 4 Argon inspection.',
              confidence: 'EXTRACTED',
              sha256: '8f3a9b2c4e1d7f60',
              offsetOrLine: 'HTTP Header + DOM',
              mcpTool: 'rea_inspect_url',
              reconstructedSnippet: 'export const BOARD_ORIGIN = "https://symvibe.com";',
            },
          ],
          graphNodes: [
            { id: 'gn-a', label: 'Target Entry', kind: 'endpoint', confidence: 'EXTRACTED', offsetOrPath: '/' },
          ],
          graphEdges: [],
          decompiledCode: '// Click "Inspect via REA" to run deterministic extraction + Gemini 4 Argon synthesis.',
        },
      };
    } else if (type === 'agenticos-bridge') {
      newNode = {
        ...newNode,
        title: 'Veloce AgenticOS & Repomix Bridge',
        subtitle: 'dev4-gpt/local-AgenticOS · Reuse/Extend/Build',
        bridgePayload: INITIAL_WORKSPACE_STATE.nodes[0].bridgePayload,
      };
    } else if (type === 'preview-studio') {
      newNode = {
        ...newNode,
        title: 'AI Website Cloner + OpenDesign Studio',
        subtitle: '4-Stage Pipeline: Inspection → Specs → Build → QA',
        width: 520,
        height: 450,
        previewPayload: {
          activeStage: 3,
          targetName: 'Reconstructed Veloce Component',
          referenceSummary: 'Ready to receive REA provenance specs.',
          componentSpecJson: '{\n  "component": "VeloceModule",\n  "provenance": "EXTRACTED"\n}',
          isolatedBuildHtml: DEFAULT_PREVIEW_HTML,
          visualQaChecks: INITIAL_WORKSPACE_STATE.nodes[5].previewPayload!.visualQaChecks,
          lastBuiltAt: new Date().toISOString(),
        },
      };
    } else if (type === 'kanban') {
      newNode = {
        ...newNode,
        title: 'OpenGoat & Swarm Task Board',
        subtitle: 'Role Ownership · File-Lock Arbiter',
        kanbanPayload: {
          boardTitle: 'Sprint Task Queue',
          swarmConflictStatus: 'NOMINAL',
          tasks: INITIAL_WORKSPACE_STATE.nodes[2].kanbanPayload!.tasks,
        },
      };
    } else if (type === 'note') {
      newNode = {
        ...newNode,
        title: 'AgenticOS Decision & Memory Note',
        subtitle: 'Synced with Veloce AgenticOS Provenance Ledger',
        width: 380,
        height: 310,
        notePayload: {
          category: 'DecisionLog',
          content: 'Document architectural boundaries or REA hypotheses here to sync with local-AgenticOS memory.',
          authorRunner: 'gemini-4-argon',
          syncedToAgenticOs: true,
          updatedAt: new Date().toISOString(),
        },
      };
    }

    setWorkspace((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    setSelectedNodeId(id);
    triggerToast(`Spawned ${newNode.title}`);
  };

  // Pipe REA Evidence or Repomix Context to Terminal
  const handlePipeEvidenceToTerminal = (sourceNodeId: string) => {
    const sourceNode = workspace.nodes.find((n) => n.id === sourceNodeId);
    const targetTerminal = workspace.nodes.find((n) => n.type === 'terminal' && n.terminalPayload);
    if (!sourceNode || !targetTerminal) return;

    const timestamp = new Date().toTimeString().slice(0, 8);
    const summaryMsg =
      sourceNode.type === 'rea-inspector' && sourceNode.reaPayload
        ? `[PIPED FROM REA INSPECTOR] SHA-256 ${sourceNode.reaPayload.artifactSha256.slice(0, 12)}… · ${sourceNode.reaPayload.evidenceItems.length} findings (${sourceNode.reaPayload.summary})`
        : `[PIPED FROM REPOMIX BRIDGE] Repo ${sourceNode.bridgePayload?.repoUrl} (${sourceNode.bridgePayload?.repomixTokenEstimate} tokens packed for Gemini 4 Argon)`;

    handleUpdateNode(targetTerminal.id, (prev) => ({
      ...prev,
      terminalPayload: {
        ...prev.terminalPayload!,
        history: [
          ...prev.terminalPayload!.history,
          {
            id: `th-pipe-${Date.now()}`,
            timestamp,
            kind: 'mcp-tool',
            runner: prev.terminalPayload!.runner,
            mcpToolCalled: 'veloce_pipe_context',
            text: summaryMsg,
          },
        ],
      },
    }));

    setSelectedNodeId(targetTerminal.id);
    triggerToast(`Piped provenance context to ${targetTerminal.title}`);
  };

  // Pipe REA Evidence to 4-Stage Cloner Studio
  const handlePipeEvidenceToStudio = (sourceNodeId: string) => {
    const sourceNode = workspace.nodes.find((n) => n.id === sourceNodeId);
    const studioNode = workspace.nodes.find((n) => n.type === 'preview-studio' && n.previewPayload);
    if (!sourceNode?.reaPayload || !studioNode) return;

    const rea = sourceNode.reaPayload;
    handleUpdateNode(studioNode.id, (prev) => ({
      ...prev,
      previewPayload: {
        ...prev.previewPayload!,
        activeStage: 2,
        sourceReaNodeId: sourceNode.id,
        referenceSummary: `${rea.summary} (SHA-256: ${rea.artifactSha256.slice(0, 16)})`,
        componentSpecJson: JSON.stringify(
          {
            target: rea.targetInput,
            artifactSha256: rea.artifactSha256.slice(0, 16),
            extractedEvidence: rea.evidenceItems.map((e) => ({
              title: e.title,
              confidence: e.confidence,
              offset: e.offsetOrLine,
            })),
          },
          null,
          2
        ),
      },
    }));

    setSelectedNodeId(studioNode.id);
    triggerToast('Piped REA SHA-256 specs into Stage 2 of Cloner Studio');
  };

  const handleSyncMemoryRecord = (
    title: string,
    summary: string,
    layer: 'Memory' | 'Research' | 'Work' | 'Decision' | 'Provenance',
    sourceNodeId: string
  ) => {
    const newRecord = {
      id: `mem-${Date.now()}`,
      layer,
      title,
      summary,
      sourceNodeId,
      sha256: Math.random().toString(16).slice(2, 18),
      createdAt: new Date().toISOString(),
    };
    setWorkspace((prev) => ({
      ...prev,
      memoryStore: [newRecord, ...prev.memoryStore],
    }));
    triggerToast(`Synced "${title}" to Veloce AgenticOS Memory`);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0B0F17] text-[#F8FAFC] overflow-hidden">
      {/* Strict 3-Zone Top Bar */}
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenVoicePlanner={() => setIsVoiceModalOpen(true)}
      />

      {/* Secondary Workspace Status & Camera Ribbon (only on Spatial Canvas view) */}
      {activeTab === 'canvas' && (
        <div className="flex items-center justify-between gap-4 px-6 py-2 bg-[#0D131F] border-b border-slate-800/90 text-xs select-none z-20">
          {/* Left: Reuse / Extend / Build Adapter Status Readout */}
          <div className="flex items-center gap-2 text-slate-400 font-mono tabular-nums overflow-x-auto">
            <span className="text-emerald-400 font-semibold">VELOCE AGENTICOS ADAPTER</span>
            <span>·</span>
            <span>REUSE: Memory, Tasks, Router</span>
            <span>·</span>
            <span>EXTEND: AgentOS Store, Token Refresh ({workspace.agentOsGateway.tokenRefresh.refreshCount}x), Rate Limit ({workspace.agentOsGateway.rateLimiter.currentWindowRequests}/{workspace.agentOsGateway.rateLimiter.maxRequestsPerWindow} RPM)</span>
            <span>·</span>
            <span>MODEL: {workspace.activeModel}</span>
          </div>

          {/* Right: Camera Bookmarks & Save */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                setWorkspace((prev) => ({
                  ...prev,
                  camera: { x: 40, y: 50, zoom: 0.85 },
                }))
              }
              className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Team 01: Recon & REA
            </button>
            <button
              type="button"
              onClick={() =>
                setWorkspace((prev) => ({
                  ...prev,
                  camera: { x: 40, y: -380, zoom: 0.85 },
                }))
              }
              className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Team 02: Terminals & Studio
            </button>
            <button
              type="button"
              onClick={() => handleSaveWorkspaceToDisk()}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-200 bg-indigo-950/60 hover:bg-indigo-900/70 border border-indigo-800/60 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Save Board
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area: Either Infinite Spatial Canvas OR Adapter/Provenance/Swarm Drawer */}
      {activeTab !== 'canvas' ? (
        <AdapterMatrixDrawer
          activeTab={activeTab}
          workspace={workspace}
          onBackToCanvas={() => setActiveTab('canvas')}
          onSaveWorkspaceToDisk={() => handleSaveWorkspaceToDisk()}
          onRefreshToken={async () => {
            const res = await fetch('/api/agentos/token-refresh', { method: 'POST' });
            const data = await res.json();
            if (data.tokenRefresh) {
              setWorkspace((prev) => ({
                ...prev,
                agentOsGateway: { ...prev.agentOsGateway, tokenRefresh: data.tokenRefresh },
              }));
              triggerToast(`Rotated AgentOS token: ${data.tokenRefresh.activeTokenId}`);
            }
          }}
          onResetRateLimits={async () => {
            const res = await fetch('/api/agentos/rate-limit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'reset' }),
            });
            const data = await res.json();
            if (data.rateLimiter) {
              setWorkspace((prev) => ({
                ...prev,
                agentOsGateway: { ...prev.agentOsGateway, rateLimiter: data.rateLimiter },
              }));
              triggerToast('Reset AgentOS rate-limit buckets');
            }
          }}
          onUpdateMaxRpm={async (rpm) => {
            const res = await fetch('/api/agentos/rate-limit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'configure', newMaxRpm: rpm }),
            });
            const data = await res.json();
            if (data.rateLimiter) {
              setWorkspace((prev) => ({
                ...prev,
                agentOsGateway: { ...prev.agentOsGateway, rateLimiter: data.rateLimiter },
              }));
              triggerToast(`Updated AgentOS max RPM to ${rpm}`);
            }
          }}
          onReleaseFileLock={(nodeId, filePath) => {
            handleUpdateNode(nodeId, (prev) => ({
              ...prev,
              terminalPayload: {
                ...prev.terminalPayload!,
                lockedFiles: prev.terminalPayload!.lockedFiles.filter((f) => f !== filePath),
              },
            }));
            triggerToast(`Released file lock on ${filePath}`);
          }}
          onUpdateTerminalBudget={(nodeId, newBudgetUsd) => {
            handleUpdateNode(nodeId, (prev) => ({
              ...prev,
              terminalPayload: {
                ...prev.terminalPayload!,
                budgetLimitUsd: newBudgetUsd,
              },
            }));
            triggerToast(`Increased runner budget cap to $${newBudgetUsd.toFixed(2)}`);
          }}
        />
      ) : (
        <div
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleGlobalPointerMove}
          onPointerUp={handleGlobalPointerUp}
          onWheel={handleWheelZoom}
          className="relative flex-1 canvas-grid overflow-hidden cursor-grab active:cursor-grabbing"
        >
          {/* Transformed Infinite Board Layer */}
          <div
            style={{
              transform: `translate3d(${workspace.camera.x}px, ${workspace.camera.y}px, 0) scale(${workspace.camera.zoom})`,
              transformOrigin: '0 0',
            }}
            className="absolute top-0 left-0 w-[2400px] h-[1600px]"
          >
            {/* 1. OpenGoat + ChatDev 2.0 Team Frames */}
            {workspace.teams.map((team) => (
              <div
                key={team.id}
                style={{
                  transform: `translate3d(${team.x}px, ${team.y}px, 0)`,
                  width: `${team.width}px`,
                  height: `${team.height}px`,
                }}
                className="absolute top-0 left-0 rounded-2xl border border-slate-800/80 bg-[#0D131F]/40 p-4 pointer-events-none select-none"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 font-display">
                    {team.name}
                  </span>
                  <span className="text-xs font-mono text-slate-500 tabular-nums">
                    Lead: {team.leadRunner} · {team.sourcePattern}
                  </span>
                </div>
              </div>
            ))}

            {/* 2. SVG Directed Evidence & Spec Pipes (Graphify EXTRACTED vs INFERRED) */}
            <svg className="absolute top-0 left-0 w-[2400px] h-[1600px] pointer-events-none z-0">
              {workspace.edges.map((edge) => {
                const fromNode = workspace.nodes.find((n) => n.id === edge.fromNodeId);
                const toNode = workspace.nodes.find((n) => n.id === edge.toNodeId);
                if (!fromNode || !toNode) return null;

                const startX = fromNode.x + fromNode.width / 2;
                const startY = fromNode.y + fromNode.height / 2;
                const endX = toNode.x + toNode.width / 2;
                const endY = toNode.y + toNode.height / 2;
                const midX = (startX + endX) / 2;
                const midY = (startY + endY) / 2;
                const pathD = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

                return (
                  <g key={edge.id}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={edge.confidence === 'EXTRACTED' ? '#6366F1' : '#D97706'}
                      strokeWidth={2}
                      strokeDasharray={edge.confidence === 'INFERRED' ? '6 4' : undefined}
                      opacity={0.75}
                    />
                    <rect
                      x={midX - 95}
                      y={midY - 11}
                      width={190}
                      height={22}
                      rx={4}
                      fill="#0B0F17"
                      stroke="#1F2937"
                    />
                    <text
                      x={midX}
                      y={midY + 3}
                      textAnchor="middle"
                      fill="#CBD5E1"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {edge.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* 3. Interactive Canvas Nodes */}
            {workspace.nodes.map((node) => (
              <CanvasNodeCard
                key={node.id}
                node={node}
                isSelected={selectedNodeId === node.id}
                allLockedFiles={allLockedFiles}
                repomixContextGlobal={repomixContextGlobal}
                reaSummaryGlobal={reaSummaryGlobal}
                onSelect={setSelectedNodeId}
                onStartDrag={handleStartNodeDrag}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onPipeEvidenceToStudio={handlePipeEvidenceToStudio}
                onPipeEvidenceToTerminal={handlePipeEvidenceToTerminal}
                onSyncMemoryRecord={handleSyncMemoryRecord}
                onUpdateGatewayHealth={(gw) =>
                  setWorkspace((prev) => ({ ...prev, agentOsGateway: gw }))
                }
              />
            ))}
          </div>

          {/* Toast Feedback Banner */}
          {saveToast && (
            <div className="absolute top-4 right-6 z-30 flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#111827] border border-emerald-700/80 text-xs font-mono text-emerald-300 shadow-lg">
              <Check className="w-3.5 h-3.5" />
              {saveToast}
            </div>
          )}

          {/* Floating Bottom-Center Spatial Creation Dock & Camera Controls */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111827]/95 border border-slate-800 shadow-xl"
          >
            <button
              type="button"
              onClick={() => handleSpawnNode('terminal')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              + Agent Terminal
            </button>
            <button
              type="button"
              onClick={() => handleSpawnNode('rea-inspector')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SearchCode className="w-3.5 h-3.5 text-emerald-400" />
              + REA Inspector
            </button>
            <button
              type="button"
              onClick={() => handleSpawnNode('agenticos-bridge')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
              + AgenticOS Bridge
            </button>
            <button
              type="button"
              onClick={() => handleSpawnNode('preview-studio')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-indigo-400" />
              + Cloner Studio
            </button>
            <button
              type="button"
              onClick={() => handleSpawnNode('kanban')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Kanban className="w-3.5 h-3.5 text-amber-400" />
              + Swarm Kanban
            </button>
            <button
              type="button"
              onClick={() => handleSpawnNode('note')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <StickyNote className="w-3.5 h-3.5 text-slate-400" />
              + Memory Note
            </button>

            <div className="h-4 w-[1px] bg-slate-800 mx-1" />

            {/* Camera Zoom Controls */}
            <button
              type="button"
              onClick={() =>
                setWorkspace((prev) => ({
                  ...prev,
                  camera: { ...prev.camera, zoom: Math.max(0.4, Number((prev.camera.zoom - 0.1).toFixed(2))) },
                }))
              }
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono tabular-nums text-slate-300 px-1">
              {Math.round(workspace.camera.zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() =>
                setWorkspace((prev) => ({
                  ...prev,
                  camera: { ...prev.camera, zoom: Math.min(1.6, Number((prev.camera.zoom + 0.1).toFixed(2))) },
                }))
              }
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                setWorkspace((prev) => ({
                  ...prev,
                  camera: { x: 40, y: 50, zoom: 0.85 },
                }))
              }
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Reset board camera"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Hybrid Voice & Board DAG Planner Modal */}
      <VoicePlannerModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        boardSummary={`Nodes: ${workspace.nodes.map((n) => n.title).join(', ')}. Locked files: ${allLockedFiles.map((l) => l.file).join(', ')}`}
        onApplyPlan={(planResult) => {
          setWorkspace((prev) => {
            const updatedNodes = prev.nodes.map((n) => {
              if (n.type === 'kanban' && n.kanbanPayload) {
                return {
                  ...n,
                  kanbanPayload: {
                    ...n.kanbanPayload,
                    tasks: [
                      {
                        id: `task-plan-${Date.now()}`,
                        title: planResult.newKanbanTaskTitle,
                        column: 'IN_PROGRESS' as const,
                        ownerRunner: planResult.targetRunner,
                        targetFile: planResult.targetFile,
                        budgetEstimateUsd: 0.22,
                        evidenceRef: `SHA-256: ${planResult.sha256.slice(0, 8)}`,
                      },
                      ...n.kanbanPayload.tasks,
                    ],
                  },
                };
              }
              if (n.id === 'node-terminal-argon' && n.terminalPayload) {
                return {
                  ...n,
                  terminalPayload: {
                    ...n.terminalPayload,
                    history: [
                      ...n.terminalPayload.history,
                      {
                        id: `th-plan-${Date.now()}`,
                        timestamp: new Date().toTimeString().slice(0, 8),
                        kind: 'mcp-tool' as const,
                        runner: planResult.targetRunner,
                        mcpToolCalled: 'symvibe_voice_planner',
                        text: `[VOICE PLANNER (${planResult.modelUsed})] ${planResult.terminalDirective}`,
                      },
                    ],
                  },
                };
              }
              return n;
            });

            return {
              ...prev,
              nodes: updatedNodes,
              memoryStore: [
                {
                  id: `mem-plan-${Date.now()}`,
                  layer: 'Decision',
                  title: planResult.memoryNoteTitle,
                  summary: planResult.memoryNoteSummary,
                  sourceNodeId: 'voice-planner',
                  sha256: planResult.sha256,
                  createdAt: new Date().toISOString(),
                },
                ...prev.memoryStore,
              ],
            };
          });
          triggerToast('Applied Voice Planner DAG mutations to canvas');
        }}
      />
    </div>
  );
}
