import React from 'react';
import {
  MessageSquare,
  Terminal,
  Code2,
  BarChart3,
  Plus,
  Folder,
  FolderOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Cpu,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { WorkspaceInfo } from '@nexus/core';
import { ProviderStatusItem, ScreenType } from '../../types/index.js';

interface SidebarProps {
  currentScreen: ScreenType;
  onScreenChange: (screen: ScreenType) => void;
  activeWorkspace: WorkspaceInfo | null;
  recentWorkspaces: WorkspaceInfo[];
  onOpenWorkspace: (path: string) => void;
  onOpenWorkspaceModal: () => void;
  onNewTask: () => void;
  onOpenSettings: () => void;
  onOpenProviders: () => void;
  providers: ProviderStatusItem[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentScreen,
  onScreenChange,
  activeWorkspace,
  recentWorkspaces,
  onOpenWorkspace,
  onOpenWorkspaceModal,
  onNewTask,
  onOpenSettings,
  onOpenProviders,
  providers,
  isCollapsed,
  onToggleCollapse,
}) => {
  const navItems: { id: ScreenType; label: string; icon: React.ReactNode; shortcut: string }[] = [
    {
      id: 'chat',
      label: 'CHAT',
      icon: <MessageSquare className="w-4 h-4 flex-shrink-0" />,
      shortcut: 'C',
    },
    {
      id: 'terminal',
      label: 'TERMINAL',
      icon: <Terminal className="w-4 h-4 flex-shrink-0" />,
      shortcut: 'T',
    },
    {
      id: 'workspace',
      label: 'WORKSPACE',
      icon: <Code2 className="w-4 h-4 flex-shrink-0" />,
      shortcut: 'W',
    },
    {
      id: 'usage',
      label: 'USAGE',
      icon: <BarChart3 className="w-4 h-4 flex-shrink-0" />,
      shortcut: 'U',
    },
  ];

  // Provider summary
  const providerList = Array.isArray(providers) ? providers : [];
  const configuredProviders = providerList.filter((p) => p.isConfigured);
  const geminiConfigured = providerList.find((p) => p.id === 'gemini')?.isConfigured;
  const openAiConfigured = providerList.find((p) => p.id === 'openai')?.isConfigured;
  const workspaceList = Array.isArray(recentWorkspaces) ? recentWorkspaces : [];

  return (
    <aside
      className={`h-full bg-nexus-950 border-r border-nexus-border flex flex-col justify-between select-none transition-all duration-200 z-20 ${
        isCollapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Top Section */}
      <div className="flex flex-col">
        {/* Branding */}
        <div className="h-12 border-b border-nexus-border flex items-center justify-between px-3.5 bg-nexus-950">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-sky-500/20">
              <span className="font-mono font-bold text-white text-xs">N</span>
            </div>
            {!isCollapsed && (
              <div className="flex items-baseline space-x-1.5 overflow-hidden">
                <span className="font-mono font-bold text-xs tracking-wider text-slate-100">
                  NEXUS<span className="text-sky-400">.AI</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">v1.0</span>
              </div>
            )}
          </div>

          <button
            onClick={onToggleCollapse}
            title={isCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-nexus-850 transition-colors"
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* New Task Action */}
        <div className="p-2.5">
          <button
            onClick={onNewTask}
            title="Start New Coding Task"
            className={`w-full flex items-center justify-center space-x-2 py-1.5 rounded-lg bg-sky-600/90 hover:bg-sky-500 text-white font-mono text-xs font-semibold shadow-sm shadow-sky-600/20 transition-all ${
              isCollapsed ? 'px-0' : 'px-3'
            }`}
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            {!isCollapsed && <span>New Task</span>}
          </button>
        </div>

        {/* Primary Navigation Modes */}
        <nav className="px-2 space-y-1">
          {navItems.map((item) => {
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onScreenChange(item.id)}
                title={item.label}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-mono transition-colors group ${
                  isActive
                    ? 'bg-nexus-850 text-sky-400 font-semibold border border-nexus-border-bright/60'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-nexus-900 border border-transparent'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
              >
                <div className="flex items-center space-x-2.5">
                  <span className={`${isActive ? 'text-sky-400' : 'text-slate-400 group-hover:text-slate-300'}`}>
                    {item.icon}
                  </span>
                  {!isCollapsed && <span className="tracking-wide text-[11px]">{item.label}</span>}
                </div>

                {!isCollapsed && (
                  <kbd className="text-[10px] text-slate-600 group-hover:text-slate-500 font-mono">
                    {item.shortcut}
                  </kbd>
                )}
              </button>
            );
          })}
        </nav>

        {/* Projects Section */}
        {!isCollapsed && (
          <div className="mt-5 px-3">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-500 pb-1.5">
              <span>PROJECTS</span>
              <button
                onClick={onOpenWorkspaceModal}
                title="Open Folder"
                className="text-slate-400 hover:text-sky-400 p-0.5 rounded transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
              {workspaceList.length === 0 ? (
                <div className="py-2 text-[11px] text-slate-600 font-mono italic">
                  No projects open.
                </div>
              ) : (
                workspaceList.map((ws) => {
                  const isCurrent = activeWorkspace?.path === ws.path;
                  return (
                    <button
                      key={ws.path}
                      onClick={() => onOpenWorkspace(ws.path)}
                      title={ws.path}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left text-xs font-mono transition-colors ${
                        isCurrent
                          ? 'bg-nexus-900 text-slate-200 font-semibold border-l-2 border-sky-400'
                          : 'text-slate-400 hover:text-slate-300 hover:bg-nexus-900/60'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <Folder className={`w-3.5 h-3.5 flex-shrink-0 ${isCurrent ? 'text-sky-400' : 'text-slate-500'}`} />
                        <span className="truncate text-[11px]">{ws.name}</span>
                      </div>
                      {isCurrent && (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Section: Provider Status & Settings */}
      <div className="p-2 border-t border-nexus-border space-y-1">
        {/* Provider Status Pill */}
        <button
          onClick={onOpenProviders}
          title="Configure AI Providers"
          className={`w-full flex items-center rounded-lg p-2 transition-colors hover:bg-nexus-900 text-left ${
            isCollapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Cpu className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Providers</span>
                <div className="flex items-center space-x-1.5 text-[11px] font-mono text-slate-300">
                  <span className="flex items-center space-x-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${geminiConfigured ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span>Gemini</span>
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="flex items-center space-x-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${openAiConfigured ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span>OpenAI</span>
                  </span>
                </div>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <span className="text-[10px] text-slate-500 font-mono">
              {configuredProviders.length}/2
            </span>
          )}
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Workspace Settings (Ctrl+,)"
          className={`w-full flex items-center rounded-lg p-2 text-slate-400 hover:text-slate-200 hover:bg-nexus-900 transition-colors ${
            isCollapsed ? 'justify-center' : 'space-x-2.5'
          }`}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!isCollapsed && <span className="text-xs font-mono">Settings</span>}
        </button>
      </div>
    </aside>
  );
};
