import React, { useState } from 'react';
import {
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Database,
  KeyRound,
  Gauge,
  Copy,
  Check,
  Lock,
  Unlock,
  ArrowLeft,
} from 'lucide-react';
import {
  SymvibeWorkspaceState,
  AdapterTier,
  EvidenceConfidence,
} from '../types/symvibe';
import { WorkspaceViewTab } from './TopBar';

interface AdapterMatrixDrawerProps {
  activeTab: WorkspaceViewTab;
  workspace: SymvibeWorkspaceState;
  onBackToCanvas: () => void;
  onSaveWorkspaceToDisk: () => Promise<void>;
  onRefreshToken: () => Promise<void>;
  onResetRateLimits: () => Promise<void>;
  onUpdateMaxRpm: (rpm: number) => Promise<void>;
  onReleaseFileLock: (nodeId: string, filePath: string) => void;
  onUpdateTerminalBudget: (nodeId: string, newBudgetUsd: number) => void;
}

const VELOCE_ADAPTER_SDK_CODE = `// Drop-in Adapter for https://github.com/dev4-gpt/local-AgenticOS
// Connects Veloce AgenticOS (Memory, Tasks, Sessions, Multi-Model Router)
// to the Symvibe + REA Spatial Workspace without duplicating existing OS primitives.

export interface VeloceAgenticOSHost {
  memory: {
    appendProvenance(record: { title: string; summary: string; sha256: string; confidence: 'EXTRACTED' | 'INFERRED' }): Promise<void>;
  };
  tasks: {
    syncOpenGoatTask(task: { id: string; title: string; ownerRunner: string; targetFile: string }): Promise<void>;
  };
  router: {
    invokeModel(model: 'gemini-4-argon' | 'codex' | 'claude-code', prompt: string): Promise<string>;
  };
}

export async function mountSymvibeSpatialAdapter(
  gatewayOrigin: string,
  hostOs?: VeloceAgenticOSHost
) {
  const stateRes = await fetch(\`\${gatewayOrigin}/api/workspace/load\`);
  const { workspace, agentOsGateway } = await stateRes.json();

  if (hostOs) {
    for (const mem of workspace.memoryStore || []) {
      await hostOs.memory.appendProvenance({
        title: mem.title,
        summary: mem.summary,
        sha256: mem.sha256,
        confidence: 'EXTRACTED',
      });
    }
  }

  return {
    workspace,
    agentOsGateway,
    inspectWithRea: (targetType: string, targetInput: string) =>
      fetch(\`\${gatewayOrigin}/api/rea/inspect\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetInput }),
      }).then((r) => r.json()),
  };
}`;

export const AdapterMatrixDrawer: React.FC<AdapterMatrixDrawerProps> = ({
  activeTab,
  workspace,
  onBackToCanvas,
  onSaveWorkspaceToDisk,
  onRefreshToken,
  onResetRateLimits,
  onUpdateMaxRpm,
  onReleaseFileLock,
  onUpdateTerminalBudget,
}) => {
  const [tierFilter, setTierFilter] = useState<'ALL' | AdapterTier>('ALL');
  const [copiedSdk, setCopiedSdk] = useState(false);
  const [provenanceFilter, setProvenanceFilter] = useState<'ALL' | EvidenceConfidence>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [rpmInput, setRpmInput] = useState(workspace.agentOsGateway.rateLimiter.maxRequestsPerWindow);

  // GitHub Push & Export state
  const [pushRepoUrl, setPushRepoUrl] = useState('https://github.com/dev4-gpt/local-AgenticOS');
  const [pushBranch, setPushBranch] = useState('feat/symvibe-rea-spatial-adapter');
  const [pushSubdir, setPushSubdir] = useState('packages/symvibe-rea-gateway');
  const [isPushingGh, setIsPushingGh] = useState(false);
  const [pushResult, setPushResult] = useState<{
    ok?: boolean;
    branchUrl?: string;
    commitSha?: string;
    filesPushed?: number;
    error?: string;
  } | null>(null);

  if (activeTab === 'canvas') return null;

  const handleCopySdk = () => {
    navigator.clipboard.writeText(VELOCE_ADAPTER_SDK_CODE);
    setCopiedSdk(true);
    setTimeout(() => setCopiedSdk(false), 2000);
  };

  const handlePushToGitHub = async () => {
    setIsPushingGh(true);
    setPushResult(null);
    try {
      const res = await fetch('/api/gateway/github-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: pushRepoUrl,
          branch: pushBranch,
          targetSubdir: pushSubdir,
          commitMessage: 'feat(symvibe-rea): add Veloce AgenticOS spatial canvas & REA provenance gateway',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPushResult({ error: data.error || 'GitHub push failed' });
      } else {
        setPushResult({
          ok: true,
          branchUrl: data.branchUrl,
          commitSha: data.commitSha,
          filesPushed: data.filesPushed,
        });
      }
    } catch (err: any) {
      setPushResult({ error: err?.message || 'Network error while pushing to GitHub' });
    } finally {
      setIsPushingGh(false);
    }
  };

  const handleDownloadGitBundle = async () => {
    const res = await fetch('/api/gateway/export-bundle');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'symvibe-rea-agenticos-bundle.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const allReaEvidence = workspace.nodes
    .filter((n) => n.type === 'rea-inspector' && n.reaPayload)
    .flatMap((n) =>
      n.reaPayload!.evidenceItems.map((ev) => ({
        ...ev,
        nodeTitle: n.title,
        artifactSha256: n.reaPayload!.artifactSha256,
      }))
    );

  const terminalNodes = workspace.nodes.filter((n) => n.type === 'terminal' && n.terminalPayload);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0B0F17] p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Contextual View Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="text-xs font-mono text-indigo-400 tabular-nums">
              VELOCE AGENTICOS · REUSE / EXTEND / BUILD ARCHITECTURE
            </div>
            <h1 className="text-2xl font-bold text-slate-50 font-display mt-1">
              {activeTab === 'adapter' && 'Veloce AgenticOS Adapter & Hardened AgentOS Gateway'}
              {activeTab === 'provenance' && 'REA + ResearchOS-Web SHA-256 Provenance & Graphify Ledger'}
              {activeTab === 'swarm' && 'Paperclip + Claude Swarm + OpenGoat Session & Budget Console'}
            </h1>
          </div>
          <button
            type="button"
            onClick={onBackToCanvas}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Return to Infinite Canvas
          </button>
        </div>

        {/* VIEW 1: AGENTICOS ADAPTER & HARDENED AGENTOS GATEWAY */}
        {activeTab === 'adapter' && (
          <div className="space-y-8">
            {/* Hardened AgentOS Gateway Controls (Closing the 3 AgentOS README Gaps) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-100 font-display">
                  01. Hardened AgentOS Gateway Controls (3 README Gaps Closed)
                </h2>
                <span className="text-xs font-mono text-emerald-400 tabular-nums">
                  ALL 3 GAPS VERIFIED & ENFORCED
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Gap 1: Persistent Storage */}
                <div className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      <Database className="w-4 h-4 text-indigo-400" />
                      Persistent Workspace Store
                    </span>
                    <span className="text-xs font-mono text-emerald-400">HARDENED</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Closes AgentOS persistent storage gap with durable JSON state snapshots synced on disk.
                  </p>
                  <div className="text-xs font-mono text-slate-300 tabular-nums space-y-1 pt-1">
                    <div>File: {workspace.agentOsGateway.persistentStorage.filePath}</div>
                    <div>
                      Size: {workspace.agentOsGateway.persistentStorage.bytesWritten.toLocaleString()} bytes ·{' '}
                      {workspace.agentOsGateway.persistentStorage.recordsCount} records
                    </div>
                    <div className="text-slate-500">
                      Saved: {new Date(workspace.agentOsGateway.persistentStorage.lastSavedAt).toLocaleTimeString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onSaveWorkspaceToDisk}
                    className="w-full py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
                  >
                    Flush Workspace to Disk Now
                  </button>
                </div>

                {/* Gap 2: Automatic Token Refresh */}
                <div className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-indigo-400" />
                      Token Refresh Lifecycle
                    </span>
                    <span className="text-xs font-mono text-emerald-400">HARDENED</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Closes AgentOS token refresh gap by automatically rotating session bearer tokens before expiry.
                  </p>
                  <div className="text-xs font-mono text-slate-300 tabular-nums space-y-1 pt-1">
                    <div>Active Token: {workspace.agentOsGateway.tokenRefresh.activeTokenId}</div>
                    <div>Rotations: {workspace.agentOsGateway.tokenRefresh.refreshCount} completed</div>
                    <div className="text-slate-500">
                      Expires: {new Date(workspace.agentOsGateway.tokenRefresh.expiresAt).toLocaleTimeString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onRefreshToken}
                    className="w-full py-2 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                  >
                    Rotate Bearer Token Now
                  </button>
                </div>

                {/* Gap 3: Rate-Limit Enforcement */}
                <div className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-indigo-400" />
                      Rate-Limit Enforcer
                    </span>
                    <span className="text-xs font-mono text-emerald-400">HARDENED</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Closes AgentOS rate-limit enforcement gap with sliding-window global & per-runner RPM buckets.
                  </p>
                  <div className="text-xs font-mono text-slate-300 tabular-nums space-y-1 pt-1">
                    <div>
                      Window Usage: {workspace.agentOsGateway.rateLimiter.currentWindowRequests} /{' '}
                      {workspace.agentOsGateway.rateLimiter.maxRequestsPerWindow} RPM
                    </div>
                    <div>Blocked Over-Quota Calls: {workspace.agentOsGateway.rateLimiter.blockedRequests}</div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="number"
                      value={rpmInput}
                      onChange={(e) => setRpmInput(Number(e.target.value))}
                      className="w-20 bg-[#070A0F] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => onUpdateMaxRpm(rpmInput)}
                      className="flex-1 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                    >
                      Set Max RPM
                    </button>
                    <button
                      type="button"
                      onClick={onResetRateLimits}
                      className="px-3 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/70 border border-indigo-800/60 rounded-lg transition-colors cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Reuse / Extend / Build Matrix Table */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-100 font-display">
                  02. Veloce AgenticOS Reuse / Extend / Build Disposition Matrix
                </h2>
                <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-lg">
                  {(['ALL', 'REUSE', 'EXTEND', 'BUILD'] as const).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setTierFilter(tier)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        tierFilter === tier
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-[#111827]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-[#0D131F] text-slate-400 font-mono">
                      <th className="py-3 px-4">Tier</th>
                      <th className="py-3 px-4">Subsystem</th>
                      <th className="py-3 px-4">Source Repo / Pattern</th>
                      <th className="py-3 px-4">Adapter Contract / Endpoint</th>
                      <th className="py-3 px-4 text-right">Calls · Latency</th>
                      <th className="py-3 px-4 text-right">Availability</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {workspace.adapterSubsystems
                      .filter((s) => tierFilter === 'ALL' || s.tier === tierFilter)
                      .map((sub) => (
                        <tr key={sub.id} className="hover:bg-slate-900/60 transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold">
                            <span
                              className={
                                sub.tier === 'REUSE'
                                  ? 'text-emerald-400'
                                  : sub.tier === 'EXTEND'
                                  ? 'text-amber-400'
                                  : 'text-indigo-400'
                              }
                            >
                              {sub.tier}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-100">{sub.name}</div>
                            <div className="text-slate-400 mt-0.5">{sub.description}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300">{sub.sourceRepo}</td>
                          <td className="py-3 px-4 font-mono text-indigo-300">{sub.endpointOrContract}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                            {sub.callsCount} calls · {sub.lastLatencyMs}ms
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-emerald-400">
                            {sub.status}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Drop-In Adapter Code Export for dev4-gpt/local-AgenticOS */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-100 font-display">
                    03. Drop-In Veloce AgenticOS Adapter Module (Zero Conflict with Codex)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mount this adapter inside <code className="text-indigo-300">dev4-gpt/local-AgenticOS</code> when ready to connect your local OS kernel to this spatial workspace.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopySdk}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedSdk ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSdk ? 'Copied Adapter Code' : 'Copy VeloceAgenticOSAdapter.ts'}
                </button>
              </div>
              <pre className="p-4 rounded-xl bg-[#070A0F] border border-slate-800 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
                {VELOCE_ADAPTER_SDK_CODE}
              </pre>
            </div>

            {/* Section 04: Direct GitHub Branch Push & Bundle Export */}
            <div className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-100 font-display">
                    04. Push to GitHub (`dev4-gpt/local-AgenticOS` Feature Branch)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pushes all 15 source files to a dedicated branch (<code className="text-indigo-300">{pushBranch}</code>) under <code className="text-indigo-300">{pushSubdir}</code> so it never conflicts with Codex’s active commits on <code className="text-slate-300">main</code>.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadGitBundle}
                    className="px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Download Source Bundle (.json)
                  </button>
                  <button
                    type="button"
                    onClick={handlePushToGitHub}
                    disabled={isPushingGh}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isPushingGh ? 'Pushing Branch...' : 'Push Branch to GitHub'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-slate-400 font-mono">Target Repository URL</label>
                  <input
                    type="text"
                    value={pushRepoUrl}
                    onChange={(e) => setPushRepoUrl(e.target.value)}
                    className="w-full bg-[#070A0F] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-mono">Target Feature Branch</label>
                  <input
                    type="text"
                    value={pushBranch}
                    onChange={(e) => setPushBranch(e.target.value)}
                    className="w-full bg-[#070A0F] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-mono">Subdirectory in Repo (empty for root)</label>
                  <input
                    type="text"
                    value={pushSubdir}
                    onChange={(e) => setPushSubdir(e.target.value)}
                    className="w-full bg-[#070A0F] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                  />
                </div>
              </div>

              {pushResult?.error && (
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200 font-mono">
                  {pushResult.error}
                </div>
              )}

              {pushResult?.ok && (
                <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-200 font-mono flex items-center justify-between">
                  <span>
                    Pushed {pushResult.filesPushed} files to commit {pushResult.commitSha?.slice(0, 7)}
                  </span>
                  <a
                    href={pushResult.branchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-emerald-300 hover:text-white"
                  >
                    Open Branch on GitHub
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: REA PROVENANCE & RESEARCHOS SHA-256 LEDGER */}
        {activeTab === 'provenance' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter symbols, endpoints, SHA-256 hashes, or MCP tools..."
                className="flex-1 max-w-md bg-[#111827] border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              />
              <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-lg">
                {(['ALL', 'EXTRACTED', 'INFERRED'] as const).map((cf) => (
                  <button
                    key={cf}
                    type="button"
                    onClick={() => setProvenanceFilter(cf)}
                    className={`px-3 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                      provenanceFilter === cf
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cf}
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden bg-[#111827]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0D131F] text-slate-400 font-mono">
                    <th className="py-3 px-4">Confidence</th>
                    <th className="py-3 px-4">Symbol / Finding</th>
                    <th className="py-3 px-4">Offset / Line</th>
                    <th className="py-3 px-4">MCP Tool</th>
                    <th className="py-3 px-4">SHA-256 Provenance Digest</th>
                    <th className="py-3 px-4">Reconstructed Contract</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {allReaEvidence
                    .filter((item) => provenanceFilter === 'ALL' || item.confidence === provenanceFilter)
                    .filter(
                      (item) =>
                        !searchQuery.trim() ||
                        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        item.finding.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        item.sha256.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((item) => (
                      <tr key={item.id} className="hover:bg-slate-900/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold">
                          <span className={item.confidence === 'EXTRACTED' ? 'text-emerald-400' : 'text-amber-400'}>
                            {item.confidence}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-100 font-mono">{item.title}</div>
                          <div className="text-slate-400 mt-0.5">{item.finding}</div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-300">{item.offsetOrLine}</td>
                        <td className="py-3 px-4 font-mono text-indigo-300">{item.mcpTool}</td>
                        <td className="py-3 px-4 font-mono tabular-nums text-emerald-400">{item.sha256}</td>
                        <td className="py-3 px-4 font-mono text-slate-300">{item.reconstructedSnippet}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Synced Veloce AgenticOS Memory & Provenance Ledger */}
            <div className="space-y-3 pt-2">
              <h2 className="text-base font-semibold text-slate-100 font-display">
                Synced Veloce AgenticOS Memory & Decision Ledger
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {workspace.memoryStore.map((mem) => (
                  <div key={mem.id} className="p-4 rounded-xl bg-[#111827] border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-400">
                      <span className="text-indigo-400">{mem.layer}</span>
                      <span>SHA-256: {mem.sha256.slice(0, 10)}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-100">{mem.title}</div>
                    <p className="text-xs text-slate-300 leading-relaxed">{mem.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: SWARM & BUDGETS CONSOLE (Paperclip + Claude Swarm + OpenGoat) */}
        {activeTab === 'swarm' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {terminalNodes.map((tn) => {
                const tp = tn.terminalPayload!;
                const pct = Math.min(100, Math.round((tp.budgetUsedUsd / tp.budgetLimitUsd) * 100));
                return (
                  <div key={tn.id} className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-mono text-indigo-400">
                          RUNNER: {tp.runner.toUpperCase()} · OWNER: {tp.openGoatOwner}
                        </div>
                        <h3 className="text-base font-bold text-slate-100 font-display mt-0.5">
                          {tn.title} ({tp.roleTitle})
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-emerald-400 tabular-nums">
                        {tp.tokensUsed.toLocaleString()} tokens
                      </span>
                    </div>

                    {/* Budget Bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                        <span className="text-slate-400">Paperclip Session Budget</span>
                        <span className="text-slate-100">
                          ${tp.budgetUsedUsd.toFixed(2)} / ${tp.budgetLimitUsd.toFixed(2)} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-[#070A0F] rounded-full overflow-hidden border border-slate-800">
                        <div
                          style={{ width: `${pct}%` }}
                          className="h-full bg-indigo-500 transition-all"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => onUpdateTerminalBudget(tn.id, tp.budgetLimitUsd + 1.0)}
                          className="px-2.5 py-1 text-xs font-mono text-slate-200 bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
                        >
                          +$1.00 Budget Cap
                        </button>
                      </div>
                    </div>

                    {/* Active File Locks */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        Claude Swarm Exclusive File Locks ({tp.lockedFiles.length})
                      </div>
                      {tp.lockedFiles.length === 0 ? (
                        <div className="text-xs text-slate-500 font-mono">No active file locks held by this runner.</div>
                      ) : (
                        <div className="space-y-1.5">
                          {tp.lockedFiles.map((lf) => (
                            <div
                              key={lf}
                              className="flex items-center justify-between px-3 py-1.5 rounded bg-[#070A0F] border border-slate-800 font-mono text-xs"
                            >
                              <span className="text-slate-200 truncate">{lf}</span>
                              <button
                                type="button"
                                onClick={() => onReleaseFileLock(tn.id, lf)}
                                className="flex items-center gap-1 text-amber-400 hover:text-amber-300 cursor-pointer"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                                Release Lock
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
