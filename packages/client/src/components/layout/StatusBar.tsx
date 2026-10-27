import React from 'react';
import { Activity, Coins, FolderGit2 } from 'lucide-react';
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
  activeRole,
  activeStatus = 'idle',
  totalTokens = 0,
  totalCostUsd = 0,
}) => {
  return (
    <footer className="h-6 flex-shrink-0 bg-[#111215] border-t border-[#2D313A] px-3 flex items-center justify-between text-[11px] text-[#A0A5B1] select-none font-mono z-30">
      {/* Left: Active Workspace Directory */}
      <div className="flex items-center gap-3 min-w-0 truncate">
        {workspacePath ? (
          <div className="flex items-center gap-1.5 hover:text-[#F8F8F9] transition-colors truncate max-w-sm cursor-default">
            <FolderGit2 className="w-3 h-3 text-[#6B7280] shrink-0" />
            <span className="truncate text-[10px]">{workspacePath}</span>
          </div>
        ) : (
          <span className="text-[10px] text-[#6B7280]">No active workspace</span>
        )}
      </div>

      {/* Center: Live Agent State */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <Activity
            className={`w-3 h-3 ${
              activeStatus !== 'idle' ? 'text-[#0FF0CB] animate-spin' : 'text-[#6B7280]'
            }`}
          />
          <span className="uppercase text-[10px] tracking-wider font-semibold">
            {activeRole ? `${activeRole} · ${activeStatus}` : 'AGENT IDLE'}
          </span>
        </div>
      </div>

      {/* Right: Real Tokens & Cost + Local Server */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-1.5 hover:text-[#F8F8F9] transition-colors">
          <Coins className="w-3 h-3 text-[#FFAB00]" />
          <span className="text-[10px]">
            {totalTokens > 0
              ? `${totalTokens.toLocaleString()} tok ($${totalCostUsd.toFixed(4)})`
              : '0 tok ($0.00)'}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[#6B7280] text-[10px]">
          <span>loopback: 127.0.0.1</span>
        </div>
      </div>
    </footer>
  );
};
