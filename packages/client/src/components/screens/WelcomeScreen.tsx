import React, { useState } from 'react';
import {
  Folder,
  KeyRound,
  Code2,
  Sparkles,
  ShieldCheck,
  Zap,
  Terminal,
  ArrowRight,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { WorkspaceInfo } from '@nexus/core';
import { ScreenType } from '../../types/index.js';

interface WelcomeScreenProps {
  recentWorkspaces: WorkspaceInfo[];
  onOpenWorkspace: (path: string) => void;
  onNavigate: (screen: ScreenType) => void;
  isProviderConfigured: boolean;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  recentWorkspaces,
  onOpenWorkspace,
  onNavigate,
  isProviderConfigured,
}) => {
  const [folderInput, setFolderInput] = useState('');

  const handleOpenFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderInput.trim()) return;
    onOpenWorkspace(folderInput.trim());
  };

  return (
    <div className="h-full overflow-auto bg-[#070a12] p-8 flex flex-col items-center justify-center select-none text-slate-200">
      <div className="max-w-4xl w-full space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-sky-950/60 border border-sky-500/30 text-sky-300 text-xs font-mono">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Autonomous AI Coding Agent Workspace</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white font-mono">
            NEXUS<span className="text-sky-400">.AI</span>
          </h1>
          <p className="text-slate-400 max-w-xl mx-auto text-sm leading-relaxed">
            Multi-agent engineering runtime equipped with repository exploration, dynamic planning,
            targeted file editing, verification tool execution, and real-time telemetry.
          </p>
        </div>

        {/* Quick Setup Alerts if provider not configured */}
        {!isProviderConfigured && (
          <div className="p-4 rounded-lg bg-amber-950/30 border border-amber-500/30 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <KeyRound className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <h4 className="text-xs font-semibold text-amber-200">
                  AI Model Providers Not Configured
                </h4>
                <p className="text-xs text-amber-300/80">
                  Configure your OpenAI or Google Gemini API key to activate autonomous coding.
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('providers')}
              className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-medium text-xs transition-colors shrink-0"
            >
              Configure Keys
            </button>
          </div>
        )}

        {/* Action Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Open Folder Card */}
          <div className="p-5 rounded-xl bg-nexus-900/60 border border-nexus-border/90 hover:border-nexus-border-bright transition-all space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-sky-950 flex items-center justify-center border border-sky-800/40 text-sky-400">
                <Folder className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-100">Open Project Directory</h3>
                <p className="text-xs text-slate-400">Mount any local repository or workspace</p>
              </div>
            </div>

            <form onSubmit={handleOpenFolder} className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="C:\path\to\your\project"
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  className="flex-1 bg-nexus-950 border border-nexus-border focus:border-sky-500 text-slate-200 px-3 py-2 rounded text-xs font-mono focus:outline-none"
                />
                {typeof window !== 'undefined' && window.nexusDesktop?.openDirectoryPicker && (
                  <button
                    type="button"
                    onClick={async () => {
                      const chosen = await window.nexusDesktop?.openDirectoryPicker();
                      if (chosen) {
                        setFolderInput(chosen);
                        onOpenWorkspace(chosen);
                      }
                    }}
                    className="px-3 py-2 rounded bg-nexus-800 hover:bg-nexus-700 text-slate-300 font-medium text-xs border border-nexus-border transition-colors shrink-0"
                  >
                    Browse...
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!folderInput.trim()}
                  className="px-3 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium text-xs transition-colors shrink-0"
                >
                  Open
                </button>
              </div>
              <button
                type="button"
                onClick={() => onOpenWorkspace(window.location.pathname ? 'c:/Users/BMS/Desktop/nexux' : '.')}
                className="text-[11px] text-sky-400 hover:underline font-mono"
              >
                Use current project workspace (c:\Users\BMS\Desktop\nexux)
              </button>
            </form>
          </div>

          {/* Quick Actions & Navigation Card */}
          <div className="p-5 rounded-xl bg-nexus-900/60 border border-nexus-border/90 hover:border-nexus-border-bright transition-all space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-950 flex items-center justify-center border border-indigo-800/40 text-indigo-400">
                <Code2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-100">Jump to Workspace</h3>
                <p className="text-xs text-slate-400">Access editor, terminal dock, and agent panel</p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => onNavigate('workspace')}
                className="w-full flex items-center justify-between p-2.5 rounded bg-nexus-850 hover:bg-nexus-800 border border-nexus-border text-xs text-slate-200 transition-colors"
              >
                <span className="font-medium">Open Coding IDE Workspace</span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('providers')}
                className="w-full flex items-center justify-between p-2.5 rounded bg-nexus-850 hover:bg-nexus-800 border border-nexus-border text-xs text-slate-200 transition-colors"
              >
                <span className="font-medium">Manage Model Providers & Keys</span>
                <KeyRound className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Recent Workspaces */}
        {recentWorkspaces.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
              <Clock className="w-3.5 h-3.5" />
              <span>Recent Workspaces</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {recentWorkspaces.slice(0, 4).map((ws) => (
                <div
                  key={ws.id}
                  onClick={() => onOpenWorkspace(ws.path)}
                  className="flex items-center justify-between p-3 rounded-lg bg-nexus-900/40 border border-nexus-border hover:border-sky-500/50 hover:bg-nexus-850/60 cursor-pointer transition-all group"
                >
                  <div className="flex items-center space-x-2.5 truncate">
                    <Folder className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-semibold text-slate-200 truncate">{ws.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono truncate">{ws.path}</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-sky-400 transition-colors shrink-0 ml-2" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feature Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-nexus-border/60">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2 text-sky-400 text-xs font-semibold">
              <Zap className="w-4 h-4" />
              <span>6 Specialist Agents</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Coordinator, Explorer, Planner, Coder, Debugger, and Reviewer work in tandem to execute tasks.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Zero-Data-Loss Safety</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Strict path traversal protection, file overwrite guards, process tree kill timeouts, and local credential storage.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center space-x-2 text-purple-400 text-xs font-semibold">
              <Terminal className="w-4 h-4" />
              <span>Full Verification Loop</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every code change is verified with targeted test and build commands before task completion is certified.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
