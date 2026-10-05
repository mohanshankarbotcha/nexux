import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Terminal,
  Code2,
  BarChart3,
  PlusCircle,
  FolderOpen,
  Settings,
  KeyRound,
  Search,
  X,
  ArrowRight,
} from 'lucide-react';
import { ScreenType } from '../../types/index.js';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (screen: ScreenType) => void;
  onNewTask: () => void;
  onOpenWorkspaceModal: () => void;
  onOpenSettings: () => void;
  onOpenProviders: () => void;
  onToggleSidebar: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onNewTask,
  onOpenWorkspaceModal,
  onOpenSettings,
  onOpenProviders,
  onToggleSidebar,
}) => {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    {
      id: 'nav-chat',
      title: 'Go to Chat (Agent Workspace)',
      category: 'Navigation',
      shortcut: 'C',
      icon: <MessageSquare className="w-4 h-4 text-sky-400" />,
      action: () => {
        onNavigate('chat');
        onClose();
      },
    },
    {
      id: 'nav-terminal',
      title: 'Go to Terminal',
      category: 'Navigation',
      shortcut: 'T',
      icon: <Terminal className="w-4 h-4 text-emerald-400" />,
      action: () => {
        onNavigate('terminal');
        onClose();
      },
    },
    {
      id: 'nav-workspace',
      title: 'Go to Workspace (IDE Editor)',
      category: 'Navigation',
      shortcut: 'W',
      icon: <Code2 className="w-4 h-4 text-indigo-400" />,
      action: () => {
        onNavigate('workspace');
        onClose();
      },
    },
    {
      id: 'nav-usage',
      title: 'Go to Usage & Cost Telemetry',
      category: 'Navigation',
      shortcut: 'U',
      icon: <BarChart3 className="w-4 h-4 text-amber-400" />,
      action: () => {
        onNavigate('usage');
        onClose();
      },
    },
    {
      id: 'action-new-task',
      title: 'Start New Task...',
      category: 'Agent',
      shortcut: 'N',
      icon: <PlusCircle className="w-4 h-4 text-sky-400" />,
      action: () => {
        onNewTask();
        onClose();
      },
    },
    {
      id: 'action-open-workspace',
      title: 'Open Project / Directory...',
      category: 'Workspace',
      shortcut: 'O',
      icon: <FolderOpen className="w-4 h-4 text-emerald-400" />,
      action: () => {
        onOpenWorkspaceModal();
        onClose();
      },
    },
    {
      id: 'action-toggle-sidebar',
      title: 'Toggle Left Sidebar',
      category: 'View',
      shortcut: 'Ctrl+B',
      icon: <Code2 className="w-4 h-4 text-slate-400" />,
      action: () => {
        onToggleSidebar();
        onClose();
      },
    },
    {
      id: 'action-settings',
      title: 'Open Settings & Safety...',
      category: 'Preferences',
      shortcut: ',',
      icon: <Settings className="w-4 h-4 text-slate-400" />,
      action: () => {
        onOpenSettings();
        onClose();
      },
    },
    {
      id: 'action-providers',
      title: 'Configure AI Providers & Keys...',
      category: 'Preferences',
      shortcut: 'P',
      icon: <KeyRound className="w-4 h-4 text-emerald-400" />,
      action: () => {
        onOpenProviders();
        onClose();
      },
    },
  ];

  const filteredCommands = commands.filter((cmd) =>
    cmd.title.toLowerCase().includes(search.toLowerCase()) ||
    cmd.category.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-start justify-center pt-24 px-4 animate-in fade-in duration-100">
      <div className="w-full max-w-xl bg-nexus-900 border border-nexus-border-bright rounded-xl shadow-2xl overflow-hidden flex flex-col font-sans">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-nexus-border bg-nexus-950/80">
          <Search className="w-4 h-4 text-slate-400 mr-3 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a command or navigate (e.g. Chat, Terminal, Task)..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-sans"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-slate-500 hover:text-slate-300 p-1 mr-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-nexus-800 border border-nexus-border rounded">
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 font-mono">
              No matching commands found.
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                    isSelected
                      ? 'bg-nexus-800 text-white font-medium border border-nexus-border-bright'
                      : 'text-slate-300 hover:bg-nexus-850 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3 truncate">
                    <span className="flex-shrink-0">{cmd.icon}</span>
                    <span className="truncate">{cmd.title}</span>
                    <span className="text-[10px] text-slate-500 uppercase font-mono px-1 py-0.2 bg-nexus-950/60 rounded">
                      {cmd.category}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                    {cmd.shortcut && (
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-nexus-950 border border-nexus-border rounded">
                        {cmd.shortcut}
                      </kbd>
                    )}
                    {isSelected && <ArrowRight className="w-3.5 h-3.5 text-sky-400" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Bottom Help Footer */}
        <div className="px-4 py-2 border-t border-nexus-border bg-nexus-950/60 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <div className="flex items-center space-x-3">
            <span>
              <kbd className="text-[10px] px-1 bg-nexus-800 border border-nexus-border rounded mr-1">↑↓</kbd>
              Navigate
            </span>
            <span>
              <kbd className="text-[10px] px-1 bg-nexus-800 border border-nexus-border rounded mr-1">↵</kbd>
              Execute
            </span>
          </div>
          <span>NEXUS.AI v1.0.0</span>
        </div>
      </div>
    </div>
  );
};
