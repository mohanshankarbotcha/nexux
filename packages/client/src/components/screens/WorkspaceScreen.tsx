import React, { useState, useEffect } from 'react';
import {
  FileCode,
  Search,
  GitBranch,
  Terminal as TermIcon,
  Play,
  RotateCw,
  X,
  ChevronDown,
  ChevronUp,
  FileDiff,
  ListTodo,
  Activity,
  Bot,
  Wrench,
  AlertCircle,
  Coins,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';
import {
  AgentRole,
  AgentStatus,
  NexusEvent,
  Task,
  WorkspaceInfo,
  WorkspaceTreeNode,
} from '@nexus/core';
import {
  DockTabType,
  OpenTab,
  PlanData,
  ProviderStatusItem,
  TerminalEntry,
} from '../../types/index.js';
import { FileTree } from '../common/FileTree.js';
import { DiffViewer } from '../common/DiffViewer.js';
import { TerminalView } from '../common/TerminalView.js';
import { PlanView } from '../common/PlanView.js';
import { ActivityFeed } from '../common/ActivityFeed.js';
import { api } from '../../services/api.js';

interface WorkspaceScreenProps {
  activeWorkspace: WorkspaceInfo | null;
  onOpenWorkspaceModal: () => void;
  providers: ProviderStatusItem[];
  liveEvents: NexusEvent[];
  activeTask: Task | null;
  onLaunchTask: (prompt: string) => Promise<void>;
  onCancelTask: () => Promise<void>;
  activeRole: AgentRole;
  activeStatus: AgentStatus;
  plan: PlanData | null;
  latestDiff?: string;
  terminalEntries: TerminalEntry[];
  onExecuteTerminalCommand: (cmd: string) => Promise<void>;
  streamingThought?: string;
  totalTokens?: number;
  totalCostUsd?: number;
}

export const WorkspaceScreen: React.FC<WorkspaceScreenProps> = ({
  activeWorkspace,
  onOpenWorkspaceModal,
  providers,
  liveEvents,
  activeTask,
  onLaunchTask,
  onCancelTask,
  activeRole,
  activeStatus,
  plan,
  latestDiff,
  terminalEntries,
  onExecuteTerminalCommand,
  streamingThought,
  totalTokens = 0,
  totalCostUsd = 0,
}) => {
  // Left Panel Tab State
  const [leftTab, setLeftTab] = useState<'files' | 'search' | 'git'>('files');
  const [fileTree, setFileTree] = useState<WorkspaceTreeNode | null>(null);
  const [isLoadingTree, setIsLoadingTree] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Center Editor & Tabs
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [editorViewMode, setEditorViewMode] = useState<'code' | 'diff'>('code');

  // Right Panel Sub-tab
  const [rightSubTab, setRightSubTab] = useState<'task' | 'plan' | 'stream' | 'tools'>('task');
  const [taskPrompt, setTaskPrompt] = useState('');

  // Bottom Dock
  const [dockTab, setDockTab] = useState<DockTabType>('terminal');
  const [isDockOpen, setIsDockOpen] = useState(true);

  // Load File Tree when active workspace changes
  useEffect(() => {
    if (!activeWorkspace) return;
    setIsLoadingTree(true);
    api
      .getFileTree(activeWorkspace.path)
      .then((res) => {
        setFileTree(res.tree);
      })
      .catch((err) => {
        console.error('Failed to load file tree:', err);
      })
      .finally(() => {
        setIsLoadingTree(false);
      });
  }, [activeWorkspace]);

  // Open file into tabs
  const handleSelectFile = async (absPath: string, relPath: string) => {
    if (!activeWorkspace) return;

    // Check if already open
    const existing = openTabs.find((t) => t.id === relPath);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    try {
      const data = await api.readFile(activeWorkspace.path, relPath);
      const newTab: OpenTab = {
        id: relPath,
        filePath: relPath,
        name: relPath.split(/[\\/]/).pop() || relPath,
        content: data.content,
        totalLines: data.totalLines,
      };
      setOpenTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    } catch (err: any) {
      alert(`Could not open file: ${err.message}`);
    }
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = openTabs.filter((t) => t.id !== id);
    setOpenTabs(updated);
    if (activeTabId === id) {
      setActiveTabId(updated.length > 0 ? updated[updated.length - 1].id : null);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !activeWorkspace) return;
    setIsSearching(true);
    try {
      const res = await api.searchFiles(activeWorkspace.path, searchQuery.trim());
      setSearchResults(res.result.matches || []);
    } catch (err: any) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const activeAgentRoles: AgentRole[] = [
    'coordinator',
    'explorer',
    'planner',
    'coder',
    'debugger',
    'reviewer',
  ];

  return (
    <div className="h-full flex flex-col bg-[#070a12] select-none text-slate-200 overflow-hidden font-sans">
      {/* 3-Column Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* ================= LEFT PANEL: Workspace, Tree, Search ================= */}
        <aside className="w-64 border-r border-nexus-border bg-nexus-950 flex flex-col shrink-0 select-none">
          {/* Left Panel Tabs */}
          <div className="h-8 border-b border-nexus-border bg-nexus-900/60 px-2 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setLeftTab('files')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  leftTab === 'files'
                    ? 'bg-nexus-800 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Explorer
              </button>
              <button
                onClick={() => setLeftTab('search')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  leftTab === 'search'
                    ? 'bg-nexus-800 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Search
              </button>
              <button
                onClick={() => setLeftTab('git')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  leftTab === 'git'
                    ? 'bg-nexus-800 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Changes
              </button>
            </div>

            <button
              onClick={() => {
                if (activeWorkspace) {
                  setIsLoadingTree(true);
                  api.getFileTree(activeWorkspace.path).then((r) => {
                    setFileTree(r.tree);
                    setIsLoadingTree(false);
                  });
                }
              }}
              title="Refresh Workspace"
              className="text-slate-400 hover:text-slate-200"
            >
              <RotateCw className="w-3 h-3" />
            </button>
          </div>

          {/* Left Panel Content */}
          <div className="flex-1 overflow-auto">
            {leftTab === 'files' && (
              <div className="h-full">
                {activeWorkspace ? (
                  <FileTree
                    node={fileTree}
                    selectedPath={activeTab?.filePath}
                    onSelectFile={handleSelectFile}
                    isLoading={isLoadingTree}
                  />
                ) : (
                  <div className="p-4 text-center space-y-3">
                    <p className="text-xs text-slate-500">No workspace open.</p>
                    <button
                      onClick={onOpenWorkspaceModal}
                      className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium"
                    >
                      Open Project Folder
                    </button>
                  </div>
                )}
              </div>
            )}

            {leftTab === 'search' && (
              <div className="p-2 space-y-3">
                <form onSubmit={handleSearch} className="space-y-1.5">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search files..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-nexus-900 border border-nexus-border focus:border-sky-500 text-slate-200 px-2 py-1 text-xs font-mono rounded focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!searchQuery.trim() || isSearching}
                    className="w-full py-1 bg-nexus-800 hover:bg-nexus-700 disabled:opacity-40 text-slate-300 text-xs rounded font-mono"
                  >
                    {isSearching ? 'Searching...' : 'Search Workspace'}
                  </button>
                </form>

                <div className="space-y-1">
                  {searchResults.map((match, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleSelectFile(match.filePath, match.filePath)}
                      className="p-1.5 rounded hover:bg-nexus-850 cursor-pointer font-mono text-[11px] space-y-0.5"
                    >
                      <div className="text-sky-400 font-semibold truncate">
                        {match.filePath}:{match.lineNumber}
                      </div>
                      <div className="text-slate-400 truncate">{match.lineContent}</div>
                    </div>
                  ))}
                  {searchResults.length === 0 && !isSearching && searchQuery && (
                    <div className="text-xs text-slate-500 italic p-2">No matches found.</div>
                  )}
                </div>
              </div>
            )}

            {leftTab === 'git' && (
              <div className="p-3 space-y-2 text-xs font-mono">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  Modified Files
                </div>
                {activeTask?.changedFiles && activeTask.changedFiles.length > 0 ? (
                  activeTask.changedFiles.map((f, idx) => {
                    const filePath = typeof f === 'string' ? f : f.filePath;
                    const relPath = typeof f === 'string' ? f : f.relativePath;
                    const changeType = typeof f === 'string' ? 'modified' : f.changeType;
                    const badge = changeType === 'created' ? 'A' : changeType === 'deleted' ? 'D' : 'M';
                    return (
                      <div
                        key={idx}
                        onClick={() => handleSelectFile(filePath, relPath)}
                        className="flex items-center space-x-2 py-1 px-1.5 rounded hover:bg-nexus-850 cursor-pointer text-slate-300"
                      >
                        <span className="w-3.5 h-3.5 rounded-sm bg-amber-900/60 text-amber-300 text-[10px] flex items-center justify-center font-bold">
                          {badge}
                        </span>
                        <span className="truncate">{relPath}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-slate-500 italic">Working tree clean.</div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* ================= CENTER PANEL: Editor, Tabs, Diff ================= */}
        <main className="flex-1 flex flex-col bg-nexus-950 overflow-hidden">
          {/* File Tabs Bar */}
          <div className="h-8 border-b border-nexus-border bg-nexus-900/50 flex items-center justify-between px-1 overflow-x-auto select-none">
            <div className="flex items-center space-x-0.5 overflow-x-auto">
              {openTabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    className={`flex items-center space-x-1.5 px-3 py-1 rounded-t text-xs font-mono cursor-pointer transition-colors border-r border-nexus-border/60 ${
                      isActive
                        ? 'bg-nexus-950 text-sky-300 border-t-2 border-t-sky-400 font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-nexus-850/50'
                    }`}
                  >
                    <FileCode className="w-3 h-3 text-sky-400 shrink-0" />
                    <span className="truncate max-w-[140px]">{tab.name}</span>
                    <button
                      onClick={(e) => handleCloseTab(tab.id, e)}
                      className="hover:text-red-400 rounded p-0.5 text-slate-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Editor Action Toggles */}
            <div className="flex items-center space-x-1 pr-2">
              <button
                onClick={() => setEditorViewMode('code')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  editorViewMode === 'code'
                    ? 'bg-nexus-800 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Code
              </button>
              <button
                onClick={() => setEditorViewMode('diff')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  editorViewMode === 'diff'
                    ? 'bg-nexus-800 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Diff
              </button>
            </div>
          </div>

          {/* Editor Body */}
          <div className="flex-1 overflow-hidden relative">
            {editorViewMode === 'diff' ? (
              <DiffViewer
                diffText={latestDiff}
                filePath={activeTab?.filePath}
                emptyMessage="No unstaged or agent diffs detected."
              />
            ) : activeTab ? (
              <div className="h-full flex font-mono text-xs select-text overflow-auto bg-nexus-950">
                {/* Line Numbers Gutter */}
                <div className="w-12 bg-nexus-950/80 border-r border-nexus-border/60 py-3 pr-3 text-right text-slate-600 select-none leading-relaxed shrink-0">
                  {Array.from({ length: Math.max(activeTab.totalLines, 1) }).map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>

                {/* Editor Content Area */}
                <div className="flex-1 p-3 text-slate-200 leading-relaxed font-mono whitespace-pre overflow-x-auto">
                  {activeTab.content}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 select-none">
                <FileCode className="w-12 h-12 text-slate-600 stroke-[1.5]" />
                <p className="text-sm font-medium">Select a file from the Explorer to inspect</p>
                <p className="text-xs text-slate-600">
                  You can also submit an autonomous prompt on the right to start coding.
                </p>
              </div>
            )}
          </div>
        </main>

        {/* ================= RIGHT PANEL: Agent Panel, Task, Plan, Activity ================= */}
        <aside className="w-80 border-l border-nexus-border bg-nexus-950 flex flex-col shrink-0 select-none">
          {/* Agent Panel Header */}
          <div className="h-8 border-b border-nexus-border bg-nexus-900/60 px-3 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center space-x-1.5 text-slate-200 font-semibold">
              <Bot className="w-3.5 h-3.5 text-sky-400" />
              <span>Agent Command Panel</span>
            </div>

            <div className="flex items-center space-x-1">
              <span className="text-[10px] text-slate-500 uppercase font-mono">
                {activeStatus}
              </span>
            </div>
          </div>

          {/* Agent Role Pills Bar */}
          <div className="p-2 border-b border-nexus-border/60 bg-nexus-900/30 grid grid-cols-3 gap-1 text-[10px] font-mono">
            {activeAgentRoles.map((role) => {
              const isCurrent = activeRole === role && activeStatus !== 'idle';
              return (
                <div
                  key={role}
                  className={`px-1.5 py-1 rounded text-center uppercase font-semibold transition-all ${
                    isCurrent
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-400 animate-pulse'
                      : 'bg-nexus-900 text-slate-500 border border-nexus-border/60'
                  }`}
                >
                  {role}
                </div>
              );
            })}
          </div>

          {/* Sub-tab Navigation */}
          <div className="flex border-b border-nexus-border bg-nexus-950 px-2 pt-1 space-x-1 text-xs font-mono">
            <button
              onClick={() => setRightSubTab('task')}
              className={`px-2.5 py-1 rounded-t text-[11px] font-medium transition-colors ${
                rightSubTab === 'task'
                  ? 'bg-nexus-900 text-sky-300 border-t-2 border-t-sky-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Task
            </button>
            <button
              onClick={() => setRightSubTab('plan')}
              className={`px-2.5 py-1 rounded-t text-[11px] font-medium transition-colors ${
                rightSubTab === 'plan'
                  ? 'bg-nexus-900 text-sky-300 border-t-2 border-t-sky-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Plan
            </button>
            <button
              onClick={() => setRightSubTab('stream')}
              className={`px-2.5 py-1 rounded-t text-[11px] font-medium transition-colors ${
                rightSubTab === 'stream'
                  ? 'bg-nexus-900 text-sky-300 border-t-2 border-t-sky-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Stream
            </button>
          </div>

          {/* Sub-tab Content */}
          <div className="flex-1 overflow-auto">
            {rightSubTab === 'task' && (
              <div className="p-3 space-y-4">
                {/* Prompt submission */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!taskPrompt.trim()) return;
                    const p = taskPrompt.trim();
                    setTaskPrompt('');
                    await onLaunchTask(p);
                  }}
                  className="space-y-2"
                >
                  <label className="text-xs font-mono text-slate-300 font-semibold">
                    Task Instruction
                  </label>
                  <textarea
                    rows={4}
                    value={taskPrompt}
                    onChange={(e) => setTaskPrompt(e.target.value)}
                    placeholder="Describe what you want NEXUS to build or fix (e.g. 'Add unit tests for math.js and run verification')..."
                    className="w-full bg-nexus-900 border border-nexus-border focus:border-sky-500 text-slate-200 p-2.5 rounded text-xs font-mono focus:outline-none resize-none leading-relaxed"
                  />

                  <div className="flex items-center space-x-2">
                    <button
                      type="submit"
                      disabled={!taskPrompt.trim() || activeStatus !== 'idle'}
                      className="flex-1 flex items-center justify-center space-x-2 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium text-xs transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Execute Agent Task</span>
                    </button>

                    {activeTask && activeStatus !== 'idle' && (
                      <button
                        type="button"
                        onClick={onCancelTask}
                        className="px-3 py-2 rounded bg-rose-600/80 hover:bg-rose-500 text-white font-medium text-xs transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>

                {/* Active Task Summary Card */}
                {activeTask && (
                  <div className="p-3 rounded-lg bg-nexus-900 border border-nexus-border space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-bold">{activeTask.id}</span>
                      <span className="text-sky-400 capitalize">{activeTask.status}</span>
                    </div>
                    <p className="text-slate-300 font-sans text-xs">{activeTask.prompt}</p>
                    {activeTask.changedFiles && activeTask.changedFiles.length > 0 && (
                      <div className="pt-1 text-[11px] text-emerald-400">
                        {activeTask.changedFiles.length} file{activeTask.changedFiles.length === 1 ? '' : 's'} changed
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {rightSubTab === 'plan' && <PlanView plan={plan} />}

            {rightSubTab === 'stream' && (
              <ActivityFeed
                events={liveEvents}
                streamingThought={streamingThought}
                activeAgentRole={activeRole}
              />
            )}
          </div>
        </aside>
      </div>

      {/* ================= BOTTOM PANEL: Terminal, Problems, Activity Dock ================= */}
      <section
        className={`border-t border-nexus-border bg-nexus-950 flex flex-col transition-all duration-200 ${
          isDockOpen ? 'h-60' : 'h-7'
        }`}
      >
        {/* Dock Header Bar */}
        <div className="h-7 border-b border-nexus-border bg-nexus-900/80 px-2 flex items-center justify-between text-xs font-mono select-none">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => {
                setDockTab('terminal');
                setIsDockOpen(true);
              }}
              className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                dockTab === 'terminal' && isDockOpen
                  ? 'bg-nexus-800 text-sky-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TermIcon className="w-3 h-3 text-emerald-400" />
              <span>Terminal</span>
            </button>

            <button
              onClick={() => {
                setDockTab('diff');
                setIsDockOpen(true);
              }}
              className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                dockTab === 'diff' && isDockOpen
                  ? 'bg-nexus-800 text-sky-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileDiff className="w-3 h-3 text-indigo-400" />
              <span>Diff Review</span>
            </button>

            <button
              onClick={() => {
                setDockTab('activity');
                setIsDockOpen(true);
              }}
              className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                dockTab === 'activity' && isDockOpen
                  ? 'bg-nexus-800 text-sky-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3 h-3 text-sky-400" />
              <span>Activity Log</span>
            </button>

            <button
              onClick={() => {
                setDockTab('usage');
                setIsDockOpen(true);
              }}
              className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                dockTab === 'usage' && isDockOpen
                  ? 'bg-nexus-800 text-sky-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Coins className="w-3 h-3 text-amber-400" />
              <span>Usage Telemetry</span>
            </button>
          </div>

          <button
            onClick={() => setIsDockOpen(!isDockOpen)}
            className="text-slate-400 hover:text-slate-200 p-0.5"
            title={isDockOpen ? 'Collapse Dock' : 'Expand Dock'}
          >
            {isDockOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Dock Content */}
        {isDockOpen && (
          <div className="flex-1 overflow-hidden">
            {dockTab === 'terminal' && (
              <TerminalView
                entries={terminalEntries}
                onClear={() => {}}
                onExecuteCommand={onExecuteTerminalCommand}
              />
            )}

            {dockTab === 'diff' && (
              <DiffViewer
                diffText={latestDiff}
                emptyMessage="No pending git diff changes."
              />
            )}

            {dockTab === 'activity' && (
              <ActivityFeed
                events={liveEvents}
                streamingThought={streamingThought}
                activeAgentRole={activeRole}
              />
            )}

            {dockTab === 'usage' && (
              <div className="p-4 flex items-center justify-around font-mono text-xs text-slate-300">
                <div className="text-center">
                  <div className="text-slate-500 text-[10px] uppercase">Tokens Consumed</div>
                  <div className="text-lg font-bold text-amber-400">{totalTokens.toLocaleString()}</div>
                </div>
                <div className="text-center">
                  <div className="text-slate-500 text-[10px] uppercase">Estimated Cost</div>
                  <div className="text-lg font-bold text-emerald-400">${totalCostUsd.toFixed(4)} USD</div>
                </div>
                <div className="text-center">
                  <div className="text-slate-500 text-[10px] uppercase">Active Provider</div>
                  <div className="text-lg font-bold text-sky-400">
                    {providers.find((p) => p.isConfigured)?.name || 'None'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
