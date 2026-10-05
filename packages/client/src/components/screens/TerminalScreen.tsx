import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal as TermIcon,
  Play,
  Trash2,
  Plus,
  Folder,
  CheckCircle2,
  XCircle,
  Clock,
  StopCircle,
  Copy,
  Check,
} from 'lucide-react';
import { WorkspaceInfo } from '@nexus/core';
import { TerminalEntry } from '../../types/index.js';
import { api } from '../../services/api.js';

interface TerminalScreenProps {
  activeWorkspace: WorkspaceInfo | null;
  entries: TerminalEntry[];
  onClear: () => void;
  onAddEntry: (entry: TerminalEntry) => void;
}

interface TerminalTab {
  id: string;
  name: string;
}

export const TerminalScreen: React.FC<TerminalScreenProps> = ({
  activeWorkspace,
  entries,
  onClear,
  onAddEntry,
}) => {
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: 'tab-1', name: 'Terminal 1' },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');
  const [inputCmd, setInputCmd] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new entries
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, isExecuting]);

  // Focus input on mount or tab change
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeTabId]);

  const handleAddNewTab = () => {
    const nextNum = tabs.length + 1;
    const newTab: TerminalTab = {
      id: `tab-${Date.now()}`,
      name: `Terminal ${nextNum}`,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;
    const nextTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(nextTabs);
    if (activeTabId === tabId) {
      setActiveTabId(nextTabs[0].id);
    }
  };

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCmd.trim() || isExecuting) return;

    const cmd = inputCmd.trim();
    setInputCmd('');
    setCommandHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);

    const entryId = `term_${Date.now()}`;
    const startTimestamp = Date.now();

    // Optimistically add entry with running status
    onAddEntry({
      id: entryId,
      timestamp: startTimestamp,
      command: cmd,
      output: 'Running command in workspace...',
    });

    try {
      setIsExecuting(true);
      const res = await api.executeTerminalCommand(
        cmd,
        activeWorkspace?.path,
        '.'
      );

      const stdout = res.data?.stdout || '';
      const stderr = res.data?.stderr || '';
      const outputText =
        (stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr) ||
        (res.success ? '(Command completed with no output)' : `Execution failed: ${res.error || 'Unknown error'}`);

      onAddEntry({
        id: `term_done_${Date.now()}`,
        timestamp: Date.now(),
        command: cmd,
        output: outputText,
        exitCode: res.data?.exitCode ?? (res.success ? 0 : 1),
        isError: !res.success || (res.data?.exitCode !== 0 && res.data?.exitCode !== null),
      });
    } catch (err: any) {
      onAddEntry({
        id: `term_err_${Date.now()}`,
        timestamp: Date.now(),
        command: cmd,
        output: `Error executing command: ${err.message}`,
        exitCode: 1,
        isError: true,
      });
    } finally {
      setIsExecuting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIndex =
        historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInputCmd(commandHistory[nextIndex] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= commandHistory.length) {
        setHistoryIndex(-1);
        setInputCmd('');
      } else {
        setHistoryIndex(nextIndex);
        setInputCmd(commandHistory[nextIndex] || '');
      }
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const workspaceDisplay = activeWorkspace
    ? activeWorkspace.path
    : 'No workspace opened';

  return (
    <div className="h-full flex flex-col bg-nexus-950 font-mono text-xs select-text overflow-hidden">
      {/* Top Header & Terminal Tabs Bar */}
      <div className="h-10 border-b border-nexus-border bg-nexus-950 px-3 flex items-center justify-between select-none flex-shrink-0">
        {/* Left: Terminal Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto pr-2">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-t-lg border-t border-x cursor-pointer text-xs transition-colors ${
                  isActive
                    ? 'bg-nexus-900 border-nexus-border text-slate-100 font-semibold'
                    : 'bg-nexus-950 border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <TermIcon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span className="truncate max-w-[100px]">{tab.name}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className="text-slate-500 hover:text-slate-300 p-0.5"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}

          <button
            onClick={handleAddNewTab}
            title="New Terminal Tab"
            className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-nexus-900 transition-colors ml-1"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Center: Process Status Badge */}
        <div className="flex items-center space-x-2 text-[11px]">
          {isExecuting ? (
            <span className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>RUNNING</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-nexus-900 text-slate-500 border border-nexus-border">
              <span>IDLE</span>
            </span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onClear}
            className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-nexus-900 text-slate-400 hover:text-slate-200 transition-colors"
            title="Clear terminal log"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="text-[11px]">Clear</span>
          </button>
        </div>
      </div>

      {/* Working Directory Sub-bar */}
      <div className="px-3 py-1 bg-nexus-900/40 border-b border-nexus-border/60 flex items-center justify-between text-[11px] text-slate-400 select-none flex-shrink-0">
        <div className="flex items-center space-x-2 truncate">
          <Folder className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
          <span className="text-slate-500">CWD:</span>
          <span className="font-mono text-slate-300 truncate">{workspaceDisplay}</span>
        </div>
        <span className="text-[10px] text-slate-500 hidden sm:inline">
          Authorized Environment
        </span>
      </div>

      {/* Terminal Output Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-[12px] leading-relaxed">
        {/* Banner */}
        <div className="text-slate-600 text-[11px] border-b border-nexus-border/40 pb-2 select-none">
          NEXUS.AI Terminal v1.0.0 — Sandboxed Workspace Shell (Windows/POSIX)
          <br />
          Type commands below to execute directly inside the authorized workspace.
        </div>

        {entries.length === 0 ? (
          <div className="text-slate-600 italic py-6 select-none">
            No terminal commands executed yet. Type a command below (e.g. `npm test`, `git status`, `node -v`).
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="space-y-1 group">
              {/* Command Line */}
              {entry.command && (
                <div className="flex items-center justify-between text-slate-200 font-semibold pt-1">
                  <div className="flex items-center space-x-2 truncate">
                    <span className="text-emerald-400 select-none">$</span>
                    <span className="text-sky-300">{entry.command}</span>
                  </div>

                  <div className="flex items-center space-x-2 opacity-80 group-hover:opacity-100 flex-shrink-0 ml-2">
                    {entry.exitCode !== undefined && entry.exitCode !== null && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded border select-none ${
                          entry.exitCode === 0
                            ? 'border-emerald-800/80 bg-emerald-950/40 text-emerald-300'
                            : 'border-rose-800/80 bg-rose-950/40 text-rose-300'
                        }`}
                      >
                        code: {entry.exitCode}
                      </span>
                    )}
                    <button
                      onClick={() => handleCopy(entry.output || entry.command || '', entry.id)}
                      title="Copy output"
                      className="text-slate-500 hover:text-slate-300 p-0.5"
                    >
                      {copiedId === entry.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Output Content */}
              {entry.output && (
                <pre
                  className={`p-2.5 rounded bg-nexus-900/60 border border-nexus-border/60 whitespace-pre-wrap break-all ${
                    entry.isError ? 'text-rose-300 border-rose-900/40' : 'text-slate-300'
                  }`}
                >
                  {entry.output}
                </pre>
              )}
            </div>
          ))
        )}

        <div ref={endRef} />
      </div>

      {/* Terminal Interactive Input Form */}
      <form
        onSubmit={handleExecute}
        className="h-10 border-t border-nexus-border bg-nexus-950 px-3 flex items-center space-x-2 select-none flex-shrink-0"
      >
        <span className="text-emerald-400 font-bold select-none text-xs">$</span>
        <input
          ref={inputRef}
          type="text"
          value={inputCmd}
          onChange={(e) => setInputCmd(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isExecuting}
          placeholder={
            isExecuting
              ? 'Executing command in workspace...'
              : 'Enter command (e.g. npm test, git status)... [↑↓ History]'
          }
          className="flex-1 bg-transparent border-0 text-slate-100 placeholder-slate-600 focus:outline-none text-xs font-mono"
        />
        <button
          type="submit"
          disabled={!inputCmd.trim() || isExecuting}
          className="flex items-center space-x-1.5 px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium text-xs transition-colors"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Run</span>
        </button>
      </form>
    </div>
  );
};
