import React from 'react';

export type WorkspaceViewTab = 'canvas' | 'adapter' | 'provenance' | 'swarm';

interface TopBarProps {
  activeTab: WorkspaceViewTab;
  onSelectTab: (tab: WorkspaceViewTab) => void;
  onOpenVoicePlanner: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenVoicePlanner,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0B0F17] border-b border-slate-800 select-none z-30 relative">
      {/* Zone 1: Single text element wordmark */}
      <a
        href="#canvas"
        onClick={(e) => {
          e.preventDefault();
          onSelectTab('canvas');
        }}
        className="text-lg font-bold tracking-tight text-slate-50 font-display whitespace-nowrap shrink-0"
      >
        Symvibe
      </a>

      {/* Zone 2: 4 concise single-line text navigation links */}
      <nav className="flex items-center gap-6 text-sm font-medium text-slate-400">
        <a
          href="#canvas"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('canvas');
          }}
          className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-100 hover:underline underline-offset-4 ${
            activeTab === 'canvas' ? 'text-slate-50 underline decoration-indigo-500 decoration-2' : ''
          }`}
        >
          Spatial Canvas
        </a>
        <a
          href="#adapter"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('adapter');
          }}
          className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-100 hover:underline underline-offset-4 ${
            activeTab === 'adapter' ? 'text-slate-50 underline decoration-indigo-500 decoration-2' : ''
          }`}
        >
          AgenticOS Adapter
        </a>
        <a
          href="#provenance"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('provenance');
          }}
          className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-100 hover:underline underline-offset-4 ${
            activeTab === 'provenance' ? 'text-slate-50 underline decoration-indigo-500 decoration-2' : ''
          }`}
        >
          REA Provenance
        </a>
        <a
          href="#swarm"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('swarm');
          }}
          className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-100 hover:underline underline-offset-4 ${
            activeTab === 'swarm' ? 'text-slate-50 underline decoration-indigo-500 decoration-2' : ''
          }`}
        >
          Swarm & Budgets
        </a>
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenVoicePlanner}
          className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Voice Planner
        </button>
      </div>
    </header>
  );
};
