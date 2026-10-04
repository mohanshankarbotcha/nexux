import React from 'react';
import {
  LayoutDashboard,
  Cpu,
  KeyRound,
  Code2,
  CheckCircle2,
  Clock,
  Coins,
  ArrowRight,
  Folder,
  Activity,
  AlertTriangle,
  Play,
} from 'lucide-react';
import { Task, UsageSummary, WorkspaceInfo } from '@nexus/core';
import { ProviderStatusItem, ScreenType } from '../../types/index.js';

interface DashboardScreenProps {
  tasks: Task[];
  usageSummary: UsageSummary | null;
  providers: ProviderStatusItem[];
  activeWorkspace: WorkspaceInfo | null;
  onNavigate: (screen: ScreenType) => void;
  onSelectTask?: (task: Task) => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  tasks,
  usageSummary,
  providers,
  activeWorkspace,
  onNavigate,
  onSelectTask,
}) => {
  const configuredProviders = providers.filter((p) => p.isConfigured);
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const runningTasks = tasks.filter((t) => t.status === 'running' || t.status === 'pending');

  return (
    <div className="h-full overflow-auto bg-[#070a12] p-8 select-text text-slate-200">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-sky-400 font-mono text-xs uppercase tracking-wider">
              <LayoutDashboard className="w-4 h-4" />
              <span>Workspace Overview</span>
            </div>
            <h1 className="text-2xl font-bold text-white font-mono">System & Task Dashboard</h1>
          </div>

          <button
            onClick={() => onNavigate('workspace')}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition-colors shadow-lg shadow-sky-600/20"
          >
            <Code2 className="w-4 h-4" />
            <span>Open Coding Workspace</span>
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span>Active Workspace</span>
              <Folder className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-base font-bold text-slate-100 truncate font-mono">
              {activeWorkspace ? activeWorkspace.name : 'None selected'}
            </div>
            <div className="text-[11px] text-slate-500 truncate font-mono">
              {activeWorkspace?.path || 'Open a directory to begin'}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span>Configured AI</span>
              <KeyRound className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-base font-bold text-slate-100 font-mono">
              {configuredProviders.length} / {providers.length} Providers
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              {configuredProviders.map((p) => p.name).join(', ') || 'Configure keys in setup'}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span>Coding Tasks</span>
              <CheckCircle2 className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-base font-bold text-slate-100 font-mono">
              {completedTasks.length} Completed
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              {runningTasks.length} in-progress, {tasks.length} total
            </div>
          </div>

          <div className="p-4 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span>Token Economics</span>
              <Coins className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-base font-bold text-slate-100 font-mono">
              {(usageSummary?.totalTokens || 0).toLocaleString()} tokens
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              Est. ${(usageSummary?.totalEstimatedCostUsd || 0).toFixed(4)} USD
            </div>
          </div>
        </div>

        {/* Recent Tasks List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Recent Agent Coding Tasks ({tasks.length})
            </h2>
            <button
              onClick={() => onNavigate('workspace')}
              className="text-xs text-sky-400 hover:underline flex items-center space-x-1"
            >
              <span>Launch New Task</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {tasks.length === 0 ? (
            <div className="p-8 rounded-xl bg-nexus-900/30 border border-nexus-border/60 text-center text-slate-500 space-y-3">
              <Clock className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-xs">No tasks executed yet. Start your first coding task in the workspace.</p>
              <button
                onClick={() => onNavigate('workspace')}
                className="px-3 py-1.5 rounded bg-nexus-800 hover:bg-nexus-700 text-slate-200 text-xs font-medium"
              >
                Go to Workspace
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 10).map((t) => (
                <div
                  key={t.id}
                  onClick={() => onSelectTask?.(t)}
                  className="p-3.5 rounded-lg bg-nexus-900/50 border border-nexus-border hover:border-nexus-border-bright transition-colors cursor-pointer space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 text-xs font-mono">{t.id}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase ${
                        t.status === 'completed'
                          ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                          : t.status === 'running'
                          ? 'bg-sky-950 border border-sky-800 text-sky-300 animate-pulse'
                          : t.status === 'failed'
                          ? 'bg-rose-950 border border-rose-800 text-rose-300'
                          : 'bg-nexus-850 text-slate-400'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 font-sans line-clamp-2">{t.prompt}</p>

                  <div className="flex items-center space-x-4 text-[11px] text-slate-500 font-mono pt-1">
                    <span>{new Date(t.createdAt).toLocaleString()}</span>
                    {t.changedFiles && t.changedFiles.length > 0 && (
                      <span className="text-sky-400">
                        {t.changedFiles.length} file{t.changedFiles.length === 1 ? '' : 's'} modified
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
