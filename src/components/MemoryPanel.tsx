"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Check, FolderOpen, RefreshCw, Search, FileText, Sparkles, Clock, Network } from "lucide-react";
import dynamic from "next/dynamic";
import Panel from "./Panel";

// Three.js bundle is heavy — keep it out of the initial render path.
const VaultGraph3D = dynamic(() => import("./VaultGraph3D"), { ssr: false });
const MemoryGalaxy = dynamic(() => import("./MemoryGalaxy"), { ssr: false });

interface NoteHit { path: string; title: string; preview: string; score: number; mtime: number; }
interface RecentNote { path: string; title: string; mtime: number; }
interface VaultCandidate { path: string; label: string; noteCount: number; hasObsidianConfig: boolean; source: "configured" | "common" | "scan"; }
interface VaultStatus { configured: boolean; activeVault: string | null; configPath: string; candidates: VaultCandidate[]; }

type Tab = "search" | "omi" | "recent" | "graph";

export default function MemoryPanel() {
  const [tab, setTab] = useState<Tab>("graph");
  const [galaxyMode, setGalaxyMode] = useState(true); // cinematic Memory Galaxy is the default wow view
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState<NoteHit[]>([]);
  const [omi, setOmi] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentNote[]>([]);
  const [open, setOpen] = useState<{ path: string; content: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [vaultPath, setVaultPath] = useState("");
  const [savingVault, setSavingVault] = useState(false);
  const [vaultMessage, setVaultMessage] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // initial recent fetch
  useEffect(() => {
    fetch("/api/memory/recent").then((r) => r.json()).then((j) => setRecent(j.recent ?? []));
    fetch("/api/memory/vault").then((r) => r.json()).then((j) => {
      setVaultStatus(j);
      setVaultPath(j.activeVault ?? j.candidates?.[0]?.path ?? "");
    }).catch(() => null);
  }, []);

  // debounced search
  useEffect(() => {
    if (!q.trim()) {
      setNotes([]); setOmi([]); setSearching(false);
      return;
    }
    setSearching(true);
    if (debTimer.current) clearTimeout(debTimer.current);
    debTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/memory/search?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        setNotes(j.notes ?? []);
        setOmi(j.omi ?? []);
        if (tab === "recent") setTab((j.omi?.length ?? 0) > (j.notes?.length ?? 0) ? "omi" : "search");
      } finally { setSearching(false); }
    }, 220);
    return () => { if (debTimer.current) clearTimeout(debTimer.current); };
  }, [q, tab]);

  // load full omi feed on first switch with empty q
  useEffect(() => {
    if (tab === "omi" && omi.length === 0 && !q.trim()) {
      fetch("/api/memory/omi?limit=60").then((r) => r.json()).then((j) => setOmi(j.items ?? []));
    }
  }, [tab, omi.length, q]);

  async function openNote(p: string) {
    const r = await fetch(`/api/memory/note?path=${encodeURIComponent(p)}`);
    if (!r.ok) return;
    const j = await r.json();
    setOpen({ path: j.path, content: j.content });
  }

  const tabs: { key: Tab; label: string; count?: number; icon: React.ReactNode }[] = [
    { key: "recent", label: "Recent", icon: <Clock size={12} />, count: recent.length },
    { key: "search", label: "Notes", icon: <FileText size={12} />, count: notes.length },
    { key: "omi", label: "Omi", icon: <Sparkles size={12} />, count: omi.length },
    { key: "graph", label: "Graph", icon: <Network size={12} /> },
  ];

  const connectedVault = vaultStatus?.configured && vaultStatus.activeVault;
  const noteCountLabel = connectedVault
    ? `${recent.length} recent note${recent.length === 1 ? "" : "s"}`
    : "Vault not connected";

  const highlight = (text: string) => {
    if (!q.trim()) return text;
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    return text.split(re).map((part, i) =>
      re.test(part)
        ? <mark key={i} className="bg-[rgba(168,85,247,0.25)] text-[var(--fg)] rounded px-0.5">{part}</mark>
        : <span key={i}>{part}</span>
    );
  };

  const fmtAgo = (ms: number) => {
    const d = Date.now() - ms;
    if (d < 60_000) return "just now";
    if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
    return `${Math.floor(d / 86_400_000)}d ago`;
  };

  return (
    <Panel
      title="Memory — Obsidian Vault"
      accent="system"
      icon={<Brain size={14} />}
      actions={
        <span className={`pill ${connectedVault ? "pill-info" : "pill-warn"}`}>
          {noteCountLabel}
        </span>
      }
      className="lg:col-span-3 min-h-[460px]"
    >
      {vaultStatus && !connectedVault && (
        <VaultSetupCard
          status={vaultStatus}
          vaultPath={vaultPath}
          saving={savingVault}
          message={vaultMessage}
          error={vaultError}
          onPath={setVaultPath}
          onPick={(path) => {
            setVaultPath(path);
            setVaultMessage(null);
            setVaultError(null);
          }}
          onRefresh={async () => {
            const r = await fetch("/api/memory/vault", { cache: "no-store" });
            const j = await r.json();
            setVaultStatus(j);
            setVaultPath(j.activeVault ?? j.candidates?.[0]?.path ?? vaultPath);
          }}
          onSave={async () => {
            setSavingVault(true);
            setVaultError(null);
            setVaultMessage(null);
            try {
              const r = await fetch("/api/memory/vault", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vaultRoot: vaultPath }),
              });
              const j = await r.json();
              if (!r.ok || !j.ok) throw new Error(j.error ?? "Unable to save vault.");
              setVaultMessage(`Saved to ${j.configPath}. Restart Agent OS so every tab reads this vault.`);
            } catch (error) {
              setVaultError(error instanceof Error ? error.message : "Unable to save vault.");
            } finally {
              setSavingVault(false);
            }
          }}
        />
      )}
      {tab === "graph" ? (
        <div className="flex flex-col h-full min-h-0">
          {/* Tab bar so user can still hop back out of the graph */}
          <div className="flex gap-1.5 mb-3">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1.5 border transition ${
                  tab === t.key
                    ? "bg-[rgba(168,85,247,0.15)] border-[rgba(168,85,247,0.5)] text-[var(--fg)]"
                    : "bg-[rgba(255,255,255,0.03)] border-[var(--panel-border)] text-[var(--fg-dim)] hover:text-[var(--fg)]"
                }`}
              >
                {t.icon}{t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="ml-1 text-[10px] text-[var(--fg-dimmer)] metric">{t.count}</span>
                )}
              </button>
            ))}
            <button
              onClick={() => setGalaxyMode((g) => !g)}
              className="ml-auto px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1.5 border transition bg-[rgba(168,85,247,0.12)] border-[rgba(168,85,247,0.4)] text-[var(--fg)] hover:border-[rgba(168,85,247,0.7)]"
              title="Toggle the cinematic Memory Galaxy view"
            >
              <Sparkles size={12} />{galaxyMode ? "Galaxy ✦" : "Clean graph"}
            </button>
          </div>
          <div className="flex-1 min-h-[600px] rounded-2xl border border-[var(--panel-border)] overflow-hidden relative bg-black">
            {galaxyMode ? <MemoryGalaxy onOpenNote={openNote} /> : <VaultGraph3D onOpenNote={openNote} />}
          </div>
          {open && (
            <div className="mt-3 panel border border-[var(--panel-border)] p-0 overflow-hidden max-h-[40vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--panel-border)] bg-[rgba(0,0,0,0.25)]">
                <div className="text-[11px] uppercase tracking-widest text-[var(--fg-dimmer)] truncate">{open.path}</div>
                <button onClick={() => setOpen(null)} className="text-[11px] text-[var(--fg-dim)] hover:text-[var(--fg)]">close ✕</button>
              </div>
              <pre className="scroll flex-1 min-h-0 overflow-auto p-4 text-[12.5px] leading-relaxed text-[var(--fg)] whitespace-pre-wrap">{open.content}</pre>
            </div>
          )}
        </div>
      ) : (
      <div className="flex flex-col lg:flex-row gap-4 h-full min-h-0">
        {/* Left: search + list */}
        <div className="lg:w-[380px] flex flex-col min-h-0 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--panel-border)] bg-[rgba(0,0,0,0.25)] mb-3">
            <Search size={14} className="text-[var(--fg-dimmer)]" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={connectedVault ? "Search your Obsidian vault..." : "Connect a vault to search notes..."}
              className="flex-1 bg-transparent outline-none text-sm text-[var(--fg)] placeholder:text-[var(--fg-dimmer)]"
            />
            {searching && <span className="text-[10px] text-[var(--fg-dimmer)] uppercase tracking-wider">…</span>}
          </div>

          <div className="flex gap-1.5 mb-3">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1.5 border transition ${
                  tab === t.key
                    ? "bg-[rgba(168,85,247,0.15)] border-[rgba(168,85,247,0.5)] text-[var(--fg)]"
                    : "bg-[rgba(255,255,255,0.03)] border-[var(--panel-border)] text-[var(--fg-dim)] hover:text-[var(--fg)]"
                }`}
              >
                {t.icon}{t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="ml-1 text-[10px] text-[var(--fg-dimmer)] metric">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="scroll flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
            {tab === "recent" && recent.map((n) => (
              <motion.button
                key={n.path}
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                onClick={() => openNote(n.path)}
                className="block w-full text-left px-3 py-2 rounded-lg border border-[var(--panel-border)] hover:border-[var(--panel-border-hot)] hover:bg-[rgba(255,255,255,0.03)] transition"
              >
                <div className="text-[13px] text-[var(--fg)] truncate">{n.title}</div>
                <div className="text-[10px] text-[var(--fg-dimmer)] flex justify-between mt-0.5">
                  <span className="truncate mr-2">{n.path}</span>
                  <span className="shrink-0">{fmtAgo(n.mtime)}</span>
                </div>
              </motion.button>
            ))}

            {tab === "search" && notes.map((n) => (
              <motion.button
                key={n.path}
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                onClick={() => openNote(n.path)}
                className="block w-full text-left px-3 py-2 rounded-lg border border-[var(--panel-border)] hover:border-[var(--panel-border-hot)] hover:bg-[rgba(255,255,255,0.03)] transition"
              >
                <div className="text-[13px] text-[var(--fg)] truncate">{highlight(n.title)}</div>
                <div className="text-[11px] text-[var(--fg-dim)] mt-0.5 leading-snug line-clamp-2">{highlight(n.preview)}</div>
                <div className="text-[10px] text-[var(--fg-dimmer)] mt-0.5 truncate">{n.path}</div>
              </motion.button>
            ))}
            {tab === "search" && q && notes.length === 0 && !searching && (
              <div className="text-[12px] text-[var(--fg-dim)] px-2">No notes match.</div>
            )}

            {tab === "omi" && omi.map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.01, 0.2) }}
                className="px-3 py-2 rounded-lg border border-[var(--panel-border)] text-[12.5px] leading-relaxed text-[var(--fg-dim)]"
              >
                <span className="text-[var(--fg)]">{highlight(line)}</span>
              </motion.div>
            ))}
            {tab === "omi" && q && omi.length === 0 && !searching && (
              <div className="text-[12px] text-[var(--fg-dim)] px-2">No memories match.</div>
            )}
          </div>
        </div>

        {/* Right: viewer */}
        <div className="flex-1 min-h-0 panel border border-[var(--panel-border)] p-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {open ? (
              <motion.div
                key={open.path}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col min-h-0"
              >
                <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--panel-border)] bg-[rgba(0,0,0,0.25)]">
                  <div className="text-[11px] uppercase tracking-widest text-[var(--fg-dimmer)] truncate">
                    {open.path}
                  </div>
                  <button
                    onClick={() => setOpen(null)}
                    className="text-[11px] text-[var(--fg-dim)] hover:text-[var(--fg)]"
                  >
                    close ✕
                  </button>
                </div>
                <pre className="scroll flex-1 min-h-0 overflow-auto p-4 text-[12.5px] leading-relaxed text-[var(--fg)] whitespace-pre-wrap font-[var(--font-geist-sans)]">
                  {open.content}
                </pre>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="h-full grid place-items-center text-center p-6"
              >
                <div>
                  <Brain size={28} className="mx-auto mb-3 text-[var(--fg-dimmer)]" />
                  <div className="text-sm text-[var(--fg-dim)]">
                    Select a note or memory to view.
                  </div>
                  <div className="text-[11px] text-[var(--fg-dimmer)] mt-2">
                    Vault: <code>{connectedVault ? vaultStatus?.activeVault : "not connected"}</code>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      )}
    </Panel>
  );
}


function VaultSetupCard({
  status,
  vaultPath,
  saving,
  message,
  error,
  onPath,
  onPick,
  onRefresh,
  onSave,
}: {
  status: VaultStatus;
  vaultPath: string;
  saving: boolean;
  message: string | null;
  error: string | null;
  onPath: (value: string) => void;
  onPick: (value: string) => void;
  onRefresh: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-[rgba(251,191,36,0.28)] bg-[rgba(251,191,36,0.07)] p-4">
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="grid place-items-center w-10 h-10 rounded-lg shrink-0 bg-[rgba(251,191,36,0.12)] border border-[rgba(251,191,36,0.25)] text-[var(--gold)]">
          <FolderOpen size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--fg)]">Connect your Obsidian vault</h3>
            <span className="text-[10px] uppercase tracking-widest text-[var(--fg-dimmer)]">Memory · Goals · Journal</span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--fg-dim)]">
            Pick the folder that contains your notes. Agent OS will only update <code>{status.configPath}</code> with <code>vaultRoot</code>.
          </p>

          {status.candidates.length > 0 && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {status.candidates.slice(0, 4).map((candidate) => (
                <button
                  key={candidate.path}
                  onClick={() => onPick(candidate.path)}
                  className="text-left rounded-lg border px-3 py-2 transition hover:border-[rgba(251,191,36,0.5)]"
                  style={{
                    borderColor: vaultPath === candidate.path ? "rgba(251,191,36,0.55)" : "var(--panel-border)",
                    background: vaultPath === candidate.path ? "rgba(251,191,36,0.11)" : "rgba(0,0,0,0.18)",
                  }}
                >
                  <div className="flex items-center gap-2 text-[12px] text-[var(--fg)]">
                    {vaultPath === candidate.path && <Check size={12} className="text-[var(--gold)]" />}
                    <span className="truncate">{candidate.label}</span>
                  </div>
                  <div className="mt-1 text-[10.5px] text-[var(--fg-dimmer)] truncate">{candidate.path}</div>
                  <div className="mt-1 text-[10px] text-[var(--fg-dim)]">
                    {candidate.hasObsidianConfig ? "Obsidian folder" : "Markdown folder"} · {candidate.noteCount} notes
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-col md:flex-row gap-2">
            <input
              value={vaultPath}
              onChange={(e) => onPath(e.target.value)}
              placeholder="/Users/you/Documents/Obsidian Vault"
              className="min-w-0 flex-1 rounded-lg border border-[var(--panel-border)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[rgba(251,191,36,0.5)]"
            />
            <button
              onClick={onRefresh}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--panel-border)] px-3 py-2 text-[12px] text-[var(--fg-dim)] hover:text-[var(--fg)]"
            >
              <RefreshCw size={13} /> Rescan
            </button>
            <button
              onClick={onSave}
              disabled={saving || !vaultPath.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[rgba(251,191,36,0.45)] bg-[rgba(251,191,36,0.14)] px-3 py-2 text-[12px] text-[var(--fg)] disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save vault"}
            </button>
          </div>

          {message && <div className="mt-2 text-[11.5px] text-[var(--fg-dim)]">{message}</div>}
          {error && <div className="mt-2 text-[11.5px] text-[var(--rust)]">{error}</div>}
        </div>
      </div>
    </div>
  );
}
