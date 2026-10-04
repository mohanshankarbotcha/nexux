import React, { useState, useRef, useEffect } from 'react';
import { Terminal as TermIcon, Play, Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { TerminalEntry } from '../../types/index.js';

interface TerminalViewProps {
  entries: TerminalEntry[];
  onClear: () => void;
  onExecuteCommand?: (cmd: string) => Promise<void>;
  isExecuting?: boolean;
}

export const TerminalView: React.FC<TerminalViewProps> = ({
  entries,
  onClear,
  onExecuteCommand,
  isExecuting = false,
}) => {
  const [inputCmd, setInputCmd] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCmd.trim() || isExecuting || !onExecuteCommand) return;
    const cmd = inputCmd.trim();
    setInputCmd('');
    await onExecuteCommand(cmd);
  };

  return (
    <div className="h-full flex flex-col bg-nexus-950 font-mono text-xs overflow-hidden select-text">
      {/* Terminal Toolbar */}
      <div className="h-7 border-b border-nexus-border bg-nexus-900/60 px-3 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2 text-slate-300">
          <TermIcon className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-semibold text-xs">Terminal / Verification Process</span>
          <span className="text-[10px] text-slate-500">({entries.length} events)</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onClear}
            className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-nexus-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Clear terminal log"
          >
            <Trash2 className="w-3 h-3" />
            <span className="text-[10px]">Clear</span>
          </button>
        </div>
      </div>

      {/* Output Console */}
      <div className="flex-1 overflow-auto p-3 space-y-3 font-mono text-[12px] leading-relaxed">
        {entries.length === 0 ? (
          <div className="text-slate-600 italic select-none">
            Terminal ready. Verification commands and agent terminal output will appear here.
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="space-y-1">
              {entry.command && (
                <div className="flex items-center space-x-2 text-sky-400 font-semibold">
                  <span className="text-emerald-400 select-none">$</span>
                  <span>{entry.command}</span>
                  {entry.exitCode !== undefined && entry.exitCode !== null && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded border select-none ${
                        entry.exitCode === 0
                          ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300'
                          : 'border-rose-700/60 bg-rose-950/40 text-rose-300'
                      }`}
                    >
                      code: {entry.exitCode}
                    </span>
                  )}
                </div>
              )}
              {entry.output && (
                <pre
                  className={`p-2 rounded bg-nexus-900/50 border border-nexus-border/60 whitespace-pre-wrap break-all ${
                    entry.isError ? 'text-rose-300 border-rose-900/50' : 'text-slate-300'
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

      {/* Interactive Command Input Form */}
      {onExecuteCommand && (
        <form
          onSubmit={handleSubmit}
          className="border-t border-nexus-border bg-nexus-900/80 px-3 py-1.5 flex items-center space-x-2 select-none"
        >
          <span className="text-emerald-400 font-bold select-none text-xs">$</span>
          <input
            type="text"
            value={inputCmd}
            onChange={(e) => setInputCmd(e.target.value)}
            disabled={isExecuting}
            placeholder={isExecuting ? 'Command running...' : 'Run shell command (e.g. npm test, git status)...'}
            className="flex-1 bg-transparent border-0 text-slate-200 placeholder-slate-600 focus:outline-none text-xs font-mono"
          />
          <button
            type="submit"
            disabled={!inputCmd.trim() || isExecuting}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium text-[11px] transition-colors"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Run</span>
          </button>
        </form>
      )}
    </div>
  );
};
