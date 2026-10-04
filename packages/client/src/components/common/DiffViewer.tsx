import React, { useState } from 'react';
import { Copy, Check, FileDiff, Split } from 'lucide-react';

interface DiffViewerProps {
  diffText?: string;
  filePath?: string;
  emptyMessage?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  diffText,
  filePath,
  emptyMessage = 'No changes or diff available.',
}) => {
  const [copied, setCopied] = useState(false);

  if (!diffText || !diffText.trim()) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 select-none">
        <FileDiff className="w-12 h-12 mb-3 text-slate-600 stroke-[1.5]" />
        <p className="text-sm font-medium">{emptyMessage}</p>
        <p className="text-xs text-slate-600 mt-1">
          When the coding agent modifies files or when reviewing unstaged changes, diffs appear here.
        </p>
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(diffText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = diffText.split('\n');

  return (
    <div className="h-full flex flex-col bg-nexus-950 font-mono text-xs overflow-hidden">
      {/* Diff Toolbar */}
      <div className="h-8 border-b border-nexus-border bg-nexus-900/60 px-3 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2 text-slate-300">
          <FileDiff className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-semibold text-xs">{filePath || 'Git Diff Inspection'}</span>
          <span className="text-[10px] text-slate-500">({lines.length} lines)</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopy}
            className="flex items-center space-x-1 px-2 py-0.5 rounded bg-nexus-800 hover:bg-nexus-700 text-slate-300 hover:text-white transition-colors"
            title="Copy diff to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-[11px] text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span className="text-[11px]">Copy Diff</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Diff Content Body */}
      <div className="flex-1 overflow-auto p-2 font-mono text-[12px] leading-relaxed select-text">
        {lines.map((line, idx) => {
          let lineClass = 'text-slate-400';
          let bgClass = '';

          if (line.startsWith('+++') || line.startsWith('---')) {
            lineClass = 'text-slate-400 font-semibold';
            bgClass = 'bg-nexus-900/40';
          } else if (line.startsWith('+')) {
            lineClass = 'text-emerald-300';
            bgClass = 'bg-emerald-950/40 border-l-2 border-emerald-500';
          } else if (line.startsWith('-')) {
            lineClass = 'text-rose-300';
            bgClass = 'bg-rose-950/40 border-l-2 border-rose-500';
          } else if (line.startsWith('@@')) {
            lineClass = 'text-sky-300 font-semibold';
            bgClass = 'bg-sky-950/30';
          }

          return (
            <div
              key={idx}
              className={`flex items-start px-2 py-0.5 rounded-sm hover:bg-nexus-850/40 ${bgClass}`}
            >
              <span className="w-9 shrink-0 text-right pr-3 text-slate-600 select-none text-[11px]">
                {idx + 1}
              </span>
              <pre className={`whitespace-pre-wrap break-all flex-1 font-mono ${lineClass}`}>
                {line}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
};
