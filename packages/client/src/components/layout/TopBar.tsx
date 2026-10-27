import React from 'react';
import { Search } from 'lucide-react';
import { AgentRole, AgentStatus, WorkspaceInfo } from '@nexus/core';
import { ProviderStatusItem, ScreenType } from '../../types/index.js';

interface TopBarProps {
  currentScreen: ScreenType;
  activeWorkspace: WorkspaceInfo | null;
  onOpenWorkspaceModal: () => void;
  isConnected: boolean;
  activeTaskId: string | null;
  activeRole: AgentRole;
  activeStatus: AgentStatus;
  activeModel?: string;
  onCancelActiveTask: () => void;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  onOpenProviders: () => void;
  providers: ProviderStatusItem[];
  onToggleSidebar?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeWorkspace,
  onOpenWorkspaceModal,
  isConnected,
  onOpenCommandPalette,
  onOpenProviders,
  providers,
}) => {
  const providerList = Array.isArray(providers) ? providers : [];
  const anyConfigured = providerList.some((p) => p.isConfigured);

  // Compute operational status truthfully
  let statusText = 'Operational';
  let dotColor = 'bg-[#31EC56]';
  let textColor = 'text-[#31EC56]';

  if (!isConnected) {
    statusText = 'Disconnected';
    dotColor = 'bg-[#E7473C]';
    textColor = 'text-[#E7473C]';
  } else if (!anyConfigured) {
    statusText = 'Setup Required';
    dotColor = 'bg-[#FFAB00]';
    textColor = 'text-[#FFAB00]';
  }

  const workspaceName = activeWorkspace?.name || 'No Project Open';

  return (
    <header className="h-12 flex-shrink-0 bg-[#111215] border-b border-[#2D313A] z-30 flex items-center justify-between px-4 select-none">
      {/* Left: Brand & Active Project Context */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-serif font-bold text-[#F8F8F9] text-base tracking-tight">
            NEXUS<span className="text-[#106EBE]">.AI</span>
          </span>
        </div>

        <div className="h-4 w-[1px] bg-[#2D313A]" />

        <button
          onClick={onOpenWorkspaceModal}
          title={activeWorkspace ? `Active Workspace: ${activeWorkspace.path}` : 'Click to open workspace'}
          className="flex items-center gap-1.5 font-mono text-[11px] text-[#A0A5B1] hover:text-[#F8F8F9] transition-colors truncate max-w-xs cursor-pointer"
        >
          <span className="text-[#6B7280]">workspace</span>
          <span className="text-[#2D313A]">/</span>
          <span className="text-[#F8F8F9] truncate font-semibold">{workspaceName}</span>
        </button>
      </div>

      {/* Center: Command Palette Trigger */}
      <div className="flex items-center justify-center flex-1 max-w-md px-4">
        <button
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded bg-[#16181D] border border-[#2D313A] text-[#A0A5B1] text-xs hover:border-[#383D48] transition-colors cursor-pointer group"
          title="Open Command Palette (Ctrl+K)"
        >
          <div className="flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 text-[#6B7280] group-hover:text-[#A0A5B1]" />
            <span className="font-serif text-[12px] truncate">Search files, symbols, commands...</span>
          </div>
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#1A1D23] border border-[#2D313A] text-[10px] font-mono text-[#A0A5B1]">
            <span>Ctrl</span>
            <span>+</span>
            <span>K</span>
          </div>
        </button>
      </div>

      {/* Right: Real Operational Health Status */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onOpenProviders}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#16181D] border border-[#2D313A] hover:border-[#383D48] transition-colors cursor-pointer"
          title="Click to view Provider & Gateway Status"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
          <span className={`font-mono text-[11px] ${textColor}`}>{statusText}</span>
        </button>
      </div>
    </header>
  );
};
