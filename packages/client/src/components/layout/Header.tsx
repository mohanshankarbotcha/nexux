import React from 'react';
import {
  Code2,
  Cpu,
  Folder,
  LayoutDashboard,
  KeyRound,
  BarChart3,
  Settings,
  Circle,
  AlertTriangle,
  XCircle,
  Play,
} from 'lucide-react';
import { ScreenType } from '../../types/index.js';
import { WorkspaceInfo } from '@nexus/core';

interface HeaderProps {
  currentScreen: ScreenType;
  onScreenChange: (screen: ScreenType) => void;
  activeWorkspace: WorkspaceInfo | null;
  onOpenWorkspaceModal: () => void;
  isConnected: boolean;
  activeTaskId: string | null;
  onCancelActiveTask?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentScreen,
  onScreenChange,
  activeWorkspace,
  onOpenWorkspaceModal,
  isConnected,
  activeTaskId,
  onCancelActiveTask,
}) => {
  return (
    <header className="h-12 border-b border-nexus-border bg-nexus-900/90 backdrop-blur px-3 flex items-center justify-between select-none z-30">
      {/* Left: Brand & Workspace */}
      <div className="flex items-center space-x-4">
        <div
          onClick={() => onScreenChange('welcome')}
          className="flex items-center space-x-2 cursor-pointer group"
        >
          <div className="w-7 h-7 rounded bg-gradient-to-tr from-sky-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:scale-105 transition-transform">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm tracking-wider text-slate-100 font-mono">
            NEXUS<span className="text-sky-400">.AI</span>
          </span>
        </div>

        {/* Workspace directory chip */}
        <button
          onClick={onOpenWorkspaceModal}
          className="flex items-center space-x-2 text-xs bg-nexus-850 hover:bg-nexus-800 border border-nexus-border hover:border-nexus-border-bright text-slate-300 px-2.5 py-1 rounded transition-colors max-w-xs truncate"
          title={activeWorkspace ? activeWorkspace.path : 'Open Workspace'}
        >
          <Folder className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="truncate">
            {activeWorkspace ? activeWorkspace.name : 'Open Folder...'}
          </span>
        </button>

        {activeTaskId && (
          <div className="flex items-center space-x-2 bg-sky-950/70 border border-sky-600/40 text-sky-300 text-xs px-2.5 py-0.5 rounded-full animate-pulse">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
            <span>Agent Active ({activeTaskId.slice(0, 10)})</span>
            {onCancelActiveTask && (
              <button
                onClick={onCancelActiveTask}
                className="hover:text-red-300 ml-1"
                title="Cancel Task"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Center: Navigation Screens */}
      <nav className="flex items-center space-x-1 bg-nexus-950 p-0.5 rounded border border-nexus-border/80">
        <button
          onClick={() => onScreenChange('workspace')}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
            currentScreen === 'workspace'
              ? 'bg-nexus-800 text-sky-300 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-nexus-850/50'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Workspace</span>
        </button>

        <button
          onClick={() => onScreenChange('dashboard')}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
            currentScreen === 'dashboard'
              ? 'bg-nexus-800 text-sky-300 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-nexus-850/50'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => onScreenChange('providers')}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
            currentScreen === 'providers'
              ? 'bg-nexus-800 text-sky-300 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-nexus-850/50'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Providers</span>
        </button>

        <button
          onClick={() => onScreenChange('usage')}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
            currentScreen === 'usage'
              ? 'bg-nexus-800 text-sky-300 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-nexus-850/50'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Usage</span>
        </button>

        <button
          onClick={() => onScreenChange('settings')}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
            currentScreen === 'settings'
              ? 'bg-nexus-800 text-sky-300 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-nexus-850/50'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
      </nav>

      {/* Right: Connection & Status */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1.5 text-xs">
          <Circle
            className={`w-2 h-2 fill-current ${
              isConnected ? 'text-emerald-400' : 'text-red-400 animate-pulse'
            }`}
          />
          <span className="text-slate-400 font-mono text-[11px]">
            {isConnected ? 'ONLINE' : 'DISCONNECTED'}
          </span>
        </div>
      </div>
    </header>
  );
};
