import React from 'react';
import {
  MessageSquare,
  Code2,
  BarChart3,
  Sliders,
  Settings,
  FolderOpen,
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
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentScreen,
  onScreenChange,
  activeWorkspace,
  onOpenWorkspaceModal,
  onOpenProviders,
  providers,
}) => {
  const providerList = Array.isArray(providers) ? providers : [];
  const anyConfigured = providerList.some((p) => p.isConfigured);

  const navItems: { id: ScreenType; label: string; icon: React.ReactNode }[] = [
    {
      id: 'chat',
      label: 'Chat',
      icon: <MessageSquare className="w-5 h-5 stroke-[1.5]" />,
    },
    {
      id: 'workspace',
      label: 'Code',
      icon: <Code2 className="w-5 h-5 stroke-[1.5]" />,
    },
    {
      id: 'usage',
      label: 'Stats',
      icon: <BarChart3 className="w-5 h-5 stroke-[1.5]" />,
    },
    {
      id: 'providers',
      label: 'Setup',
      icon: <Sliders className="w-5 h-5 stroke-[1.5]" />,
    },
  ];

  return (
    <aside
      className="w-12 h-full flex-shrink-0 bg-[#111215] border-r border-[#2D313A] z-20 flex flex-col justify-between items-center py-2 select-none"
      aria-label="Primary Navigation Rail"
    >
      {/* Primary Tool Rail Items */}
      <nav className="w-full flex flex-col items-center gap-1.5" role="tablist">
        {navItems.map((item) => {
          const isActive =
            currentScreen === item.id ||
            (item.id === 'chat' && currentScreen === 'welcome') ||
            (item.id === 'providers' && currentScreen === 'settings');

          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onScreenChange(item.id)}
              title={`${item.label} (${item.id})`}
              className={`w-10 h-10 rounded flex flex-col items-center justify-center transition-colors font-serif relative group ${
                isActive
                  ? 'bg-[#1A1D23] text-[#F8F8F9] border-l-2 border-[#106EBE]'
                  : 'text-[#A0A5B1] hover:bg-[#1A1D23] hover:text-[#F8F8F9]'
              }`}
            >
              {item.icon}
              <span className="text-[9px] leading-tight mt-0.5 tracking-tight font-serif">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Section: Workspace quick trigger & user indicator */}
      <div className="w-full flex flex-col items-center gap-2 pt-2 border-t border-[#2D313A]">
        <button
          onClick={onOpenWorkspaceModal}
          title={activeWorkspace ? `Current Workspace: ${activeWorkspace.name}` : 'Open Workspace'}
          className="w-8 h-8 rounded flex items-center justify-center text-[#A0A5B1] hover:text-[#F8F8F9] hover:bg-[#1A1D23] transition-colors"
        >
          <FolderOpen className="w-4 h-4 stroke-[1.5]" />
        </button>

        <button
          onClick={onOpenProviders}
          title={anyConfigured ? 'Providers: Operational' : 'Providers: Setup Required'}
          className="w-7 h-7 rounded-full bg-[#1e2026] border border-[#2D313A] flex items-center justify-center text-[10px] font-mono text-[#F8F8F9] hover:border-[#106EBE] transition-colors relative"
        >
          <span>NX</span>
          <span
            className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#111215] ${
              anyConfigured ? 'bg-[#31EC56]' : 'bg-[#FFAB00]'
            }`}
          />
        </button>
      </div>
    </aside>
  );
};
