import React, { useState, useEffect, useRef } from 'react';
import {
  PlusCircle,
  Folder,
  Cpu,
  Sparkles,
  X,
  Play,
  ArrowRight,
  FolderOpen,
} from 'lucide-react';
import { WorkspaceInfo } from '@nexus/core';
import { ProviderStatusItem } from '../../types/index.js';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeWorkspace: WorkspaceInfo | null;
  recentWorkspaces: WorkspaceInfo[];
  providers: ProviderStatusItem[];
  onOpenWorkspaceModal: () => void;
  onLaunchTask: (prompt: string, options?: { provider?: string; model?: string }) => Promise<void>;
}

export const NewTaskModal: React.FC<NewTaskModalProps> = ({
  isOpen,
  onClose,
  activeWorkspace,
  recentWorkspaces,
  providers,
  onOpenWorkspaceModal,
  onLaunchTask,
}) => {
  const [prompt, setPrompt] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const providerList = Array.isArray(providers) ? providers : [];

  // Update default models when provider changes
  useEffect(() => {
    const prov = providerList.find((p) => p.id === selectedProvider);
    if (prov) {
      setSelectedModel(prov.defaultModel || prov.models[0] || '');
    }
  }, [selectedProvider, providerList]);

  useEffect(() => {
    if (isOpen) {
      setPrompt('');
      setIsSubmitting(false);
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSubmitting) return;

    if (!activeWorkspace) {
      alert('Please open or select a workspace directory first.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onLaunchTask(prompt.trim(), {
        provider: selectedProvider,
        model: selectedModel,
      });
      onClose();
    } catch (err: any) {
      alert(`Could not start task: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentProviderObj = providerList.find((p) => p.id === selectedProvider);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-lg bg-nexus-900 border border-nexus-border-bright rounded-xl shadow-2xl overflow-hidden font-sans">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-nexus-border bg-nexus-950/80">
          <div className="flex items-center space-x-2 text-slate-100 font-mono text-sm font-semibold">
            <PlusCircle className="w-4 h-4 text-sky-400" />
            <span>New Coding Task</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-nexus-850 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Workspace Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-400 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Folder className="w-3.5 h-3.5 text-sky-400" />
                <span>Target Workspace</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenWorkspaceModal();
                }}
                className="text-[11px] text-sky-400 hover:underline flex items-center space-x-1"
              >
                <FolderOpen className="w-3 h-3" />
                <span>Change folder...</span>
              </button>
            </label>
            <div className="px-3 py-2 rounded-lg bg-nexus-950 border border-nexus-border text-xs font-mono text-slate-200 truncate flex items-center justify-between">
              <span className="truncate">{activeWorkspace ? activeWorkspace.path : 'No workspace selected'}</span>
              {activeWorkspace && (
                <span className="text-[10px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-950/50 border border-emerald-800/40 ml-2 flex-shrink-0">
                  Active
                </span>
              )}
            </div>
          </div>

          {/* Provider & Model Selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400 flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span>AI Provider</span>
              </label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-nexus-950 border border-nexus-border rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500"
              >
                {providerList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.isConfigured ? '✓' : '(Not configured)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Model</span>
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-nexus-950 border border-nexus-border rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500"
              >
                {(currentProviderObj?.models || ['gemini-2.5-flash', 'gemini-2.5-pro']).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Task Prompt Textarea */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-400 flex items-center justify-between">
              <span>Task Description</span>
              <span className="text-[11px] text-slate-500 font-sans">Press Ctrl+Enter to launch</span>
            </label>
            <textarea
              ref={textareaRef}
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Describe what you want NEXUS.AI to build, refactor, or debug (e.g., 'Implement user authentication with JWT' or 'Run test suite and fix failing tests')..."
              className="w-full bg-nexus-950 border border-nexus-border focus:border-sky-500 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none resize-none leading-relaxed font-sans"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-nexus-850 hover:bg-nexus-800 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!prompt.trim() || isSubmitting || !activeWorkspace}
              className="flex items-center space-x-2 px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-medium transition-colors shadow-lg shadow-sky-600/20"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Launching Agent...</span>
                </>
              ) : (
                <>
                  <span>Start Task</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
