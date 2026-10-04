import React from 'react';
import { GitBranch, Activity, Coins, FolderGit2, CheckCircle2 } from 'lucide-react';
import { AgentRole, AgentStatus } from '@nexus/core';

interface StatusBarProps {
  workspacePath?: string;
  gitBranch?: string;
  activeRole?: AgentRole;
  activeStatus?: AgentStatus;
  totalTokens?: number;
  totalCostUsd?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  workspacePath,
  gitBranch = 'main',
  activeRole,
  activeStatus = 'idle',
  totalTokens = 0,
  totalCostUsd = 0,
}) => {
  return (
    <footer className="h-6 border-t border-nexus-border bg-nexus-950 px-3 flex items-center justify-between text-[11px] text-slate-400 select-none font-mono">
      {/* Left: Git & Workspace */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1 hover:text-slate-200 transition-colors cursor-default">
          <GitBranch className="w-3 h-3 text-sky-400" />
          <span>{gitBranch}</span>
        </div>

        {workspacePath && (
          <div className="flex items-center space-x-1 hover:text-slate-200 transition-colors truncate max-w-sm">
            <FolderGit2 className="w-3 h-3 text-slate-500" />
            <span className="truncate">{workspacePath}</span>
          </div>
        )}
      </div>

      {/* Center: Agent State */}
      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-1.5">
          <Activity
            className={`w-3 h-3 ${
              activeStatus !== 'idle' ? 'text-amber-400 animate-spin' : 'text-slate-500'
            }`}
          />
          <span className="capitalize">
            {activeRole ? `${activeRole} (${activeStatus})` : 'Agent: Ready'}
          </span>
        </div>
      </div>

      {/* Right: Tokens & Cost */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1 hover:text-slate-200">
          <Coins className="w-3 h-3 text-amber-400" />
          <span>
            {totalTokens.toLocaleString()} tokens (~${totalCostUsd.toFixed(4)})
          </span>
        </div>

        <div className="flex items-center space-x-1 text-slate-500 text-[10px]">
          <span>NEXUS v1.0.0</span>
        </div>
      </div>
    </footer>
  );
};
