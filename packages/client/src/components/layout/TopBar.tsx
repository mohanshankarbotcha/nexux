import React from 'react';
import {
  Folder,
  Circle,
  Cpu,
  Search,
  Settings,
  Sparkles,
  StopCircle,
  Terminal,
  Activity,
  CheckCircle2,
  AlertCircle,
  Menu,
} from 'lucide-react';
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
  onCancelActiveTask: () => void;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  onOpenProviders: () => void;
  providers: ProviderStatusItem[];
  onToggleSidebar: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentScreen,
  activeWorkspace,
  onOpenWorkspaceModal,
  isConnected,
  activeTaskId,
  activeRole,
  activeStatus,
  onCancelActiveTask,
  onOpenCommandPalette,
  onOpenSettings,
  onOpenProviders,
  providers,
  onToggleSidebar,
}) => {
  const providerList = Array.isArray(providers) ? providers : [];
  const configuredProviders = providerList.filter((p) => p.isConfigured);
  const primaryProvider = configuredProviders[0] || providerList[0];
  const isAgentWorking = activeStatus === 'thinking' || activeStatus === 'executing_tool';

  const screenNames: Record<ScreenType, string> = {
    chat: 'CHAT',
    terminal: 'TERMINAL',
    workspace: 'WORKSPACE',
    usage: 'USAGE',
    welcome: 'WELCOME',
    dashboard: 'DASHBOARD',
    providers: 'PROVIDERS',
    settings: 'SETTINGS',
  };

  return (
    <header className="h-11 bg-nexus-950 border-b border-nexus-border flex items-center justify-between px-3 font-sans select-none z-10">
      {/* Left: Mode Title & Workspace Breadcrumb */}
      <div className="flex items-center space-x-3 truncate">
        <button
          onClick={onToggleSidebar}
          className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-nexus-850 transition-colors"
          title="Toggle Sidebar (Ctrl+B)"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className="font-bold text-slate-100 tracking-wider">
            {screenNames[currentScreen] || 'WORKSPACE'}
          </span>
          <span className="text-slate-600">/</span>
          <button
            onClick={onOpenWorkspaceModal}
            title={activeWorkspace?.path || 'Click to open workspace'}
            className="flex items-center space-x-1 text-slate-400 hover:text-sky-400 transition-colors truncate max-w-xs"
          >
            <Folder className="w-3.5 h-3.5 flex-shrink-0 text-sky-400" />
            <span className="truncate">{activeWorkspace ? activeWorkspace.name : 'Open Project...'}</span>
          </button>
        </div>
      </div>

      {/* Center: Live Task Status Indicator */}
      <div className="flex items-center space-x-2">
        {isAgentWorking ? (
          <div className="flex items-center space-x-2 px-2.5 py-1 rounded-full bg-nexus-900 border border-sky-500/40 text-[11px] font-mono text-sky-400 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
            <span className="capitalize">{activeRole}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-300">
              {activeStatus === 'thinking' ? 'Reasoning...' : 'Executing Tool...'}
            </span>
            <button
              onClick={onCancelActiveTask}
              title="Stop task execution"
              className="text-rose-400 hover:text-rose-300 ml-1 p-0.5"
            >
              <StopCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : activeTaskId ? (
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-nexus-900 border border-nexus-border text-[11px] font-mono text-slate-400">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Task Active</span>
          </div>
        ) : null}
      </div>

      {/* Right: Actions, Provider Status, Palette */}
      <div className="flex items-center space-x-2 text-xs font-mono">
        {/* Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-nexus-900 hover:bg-nexus-850 border border-nexus-border text-slate-400 hover:text-slate-200 transition-colors"
          title="Command Palette (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <span className="hidden md:inline text-[11px]">Command Palette</span>
          <kbd className="text-[10px] px-1 py-0.2 rounded bg-nexus-950 border border-nexus-border text-slate-400">
            Ctrl+K
          </kbd>
        </button>

        {/* Provider Indicator */}
        <button
          onClick={onOpenProviders}
          className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-nexus-900/60 hover:bg-nexus-850 border border-nexus-border text-slate-300 transition-colors"
          title="AI Provider Settings"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="hidden sm:inline text-[11px]">
            {primaryProvider?.isConfigured
              ? primaryProvider.defaultModel || primaryProvider.name
              : 'Setup AI Keys'}
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              configuredProviders.length > 0 ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
        </button>

        {/* Server Connection Status */}
        <div
          className="flex items-center space-x-1 px-2 py-1 rounded bg-nexus-900/40 text-[11px] text-slate-400"
          title={isConnected ? 'Backend Server Connected' : 'Server Disconnected'}
        >
          <Circle
            className={`w-2 h-2 ${
              isConnected ? 'text-emerald-400 fill-emerald-400' : 'text-rose-500 fill-rose-500'
            }`}
          />
          <span className="hidden lg:inline">{isConnected ? 'Online' : 'Offline'}</span>
        </div>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-nexus-850 transition-colors"
          title="Open Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
