import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  StopCircle,
  Plus,
  Folder,
  Cpu,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCode,
  Terminal,
  Search,
  Sparkles,
  Bot,
  Activity,
  ArrowRight,
  ListTodo,
  FileDiff,
  Maximize2,
  ChevronDown,
  ChevronRight,
  Code2,
} from 'lucide-react';
import {
  AgentRole,
  AgentStatus,
  NexusEvent,
  Task,
  WorkspaceInfo,
} from '@nexus/core';
import { PlanData, ProviderStatusItem } from '../../types/index.js';
import { DiffViewer } from '../common/DiffViewer.js';

interface ChatScreenProps {
  activeWorkspace: WorkspaceInfo | null;
  onOpenWorkspaceModal: () => void;
  activeTask: Task | null;
  tasks: Task[];
  onSelectTask?: (taskId: string) => void;
  onLaunchTask: (prompt: string) => Promise<void>;
  onCancelTask: () => Promise<void>;
  activeRole: AgentRole;
  activeStatus: AgentStatus;
  plan: PlanData | null;
  latestDiff?: string;
  streamingThought?: string;
  liveEvents: NexusEvent[];
  providers: ProviderStatusItem[];
  onNewTaskModal: () => void;
  onNavigateToWorkspace?: () => void;
  onNavigateToTerminal?: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  activeWorkspace,
  onOpenWorkspaceModal,
  activeTask,
  tasks,
  onSelectTask,
  onLaunchTask,
  onCancelTask,
  activeRole,
  activeStatus,
  plan,
  latestDiff,
  streamingThought,
  liveEvents,
  providers,
  onNewTaskModal,
  onNavigateToWorkspace,
  onNavigateToTerminal,
}) => {
  const [promptInput, setPromptInput] = useState('');
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [expandedSections, setExpandedSections] = useState<{
    stages: boolean;
    reasoning: boolean;
    events: boolean;
  }>({
    stages: true,
    reasoning: true,
    events: true,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isRunning = activeStatus === 'thinking' || activeStatus === 'executing_tool';

  // Auto-scroll when new events or thoughts arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveEvents, streamingThought, isRunning]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim() || isRunning) return;

    if (!activeWorkspace) {
      alert('Please select or open a workspace directory first.');
      return;
    }

    const text = promptInput.trim();
    setPromptInput('');
    await onLaunchTask(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Agent Stage Determination
  const agentStages: {
    role: AgentRole;
    name: string;
    description: string;
    status: 'waiting' | 'running' | 'completed' | 'failed';
  }[] = [
    {
      role: 'coordinator',
      name: 'Coordinator',
      description: 'Understanding requirements & orchestrating specialists',
      status:
        activeRole === 'coordinator' && isRunning
          ? 'running'
          : activeTask?.status === 'completed'
          ? 'completed'
          : activeTask
          ? 'completed'
          : 'waiting',
    },
    {
      role: 'explorer',
      name: 'Explorer',
      description: 'Indexing codebase, AST parsing, and dependency mapping',
      status:
        activeRole === 'explorer' && isRunning
          ? 'running'
          : liveEvents.some((e) => e.type === 'tool_completed' && (e.toolName === 'search_files' || e.toolName === 'list_files' || e.toolName === 'read_file'))
          ? 'completed'
          : 'waiting',
    },
    {
      role: 'planner',
      name: 'Planner',
      description: 'Synthesizing multi-step execution and verification plan',
      status:
        activeRole === 'planner' && isRunning
          ? 'running'
          : plan
          ? 'completed'
          : 'waiting',
    },
    {
      role: 'coder',
      name: 'Coder',
      description: 'Applying targeted atomic file edits with syntax validation',
      status:
        activeRole === 'coder' && isRunning
          ? 'running'
          : liveEvents.some((e) => e.type === 'tool_completed' && (e.toolName === 'write_file' || e.toolName === 'edit_file'))
          ? 'completed'
          : 'waiting',
    },
    {
      role: 'debugger',
      name: 'Debugger',
      description: 'Diagnosing runtime test failures and compiler diagnostics',
      status:
        activeRole === 'debugger' && isRunning
          ? 'running'
          : liveEvents.some((e) => e.type === 'command_completed' && e.exitCode !== 0)
          ? 'running'
          : activeTask?.status === 'completed'
          ? 'completed'
          : 'waiting',
    },
    {
      role: 'reviewer',
      name: 'Reviewer',
      description: 'Verifying diff integrity, security, and release criteria',
      status:
        activeRole === 'reviewer' && isRunning
          ? 'running'
          : activeTask?.status === 'completed'
          ? 'completed'
          : 'waiting',
    },
  ];

  // Quick Starter Prompts
  const quickPrompts = [
    'Analyze workspace architecture and summarize key modules',
    'Run test suite in terminal and report results',
    'Find potential performance bottlenecks or unused dependencies',
    'Review recent changes and check git status',
  ];

  const providerList = Array.isArray(providers) ? providers : [];
  const primaryProvider = providerList.find((p) => p.isConfigured) || providerList[0];

  return (
    <div className="h-full flex flex-col bg-nexus-950 font-sans select-none overflow-hidden">
      {/* Top Section Header */}
      <div className="h-10 border-b border-nexus-border bg-nexus-950/80 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-2 text-xs font-mono">
          <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-semibold text-slate-100">AI Coding Agent Activity</span>
          {activeTask && (
            <span className="text-[11px] text-slate-400 truncate max-w-sm hidden sm:inline">
              · {activeTask.prompt.slice(0, 50)}...
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {isRunning && (
            <button
              onClick={onCancelTask}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-rose-950/60 border border-rose-800/60 text-rose-300 hover:bg-rose-900/60 text-xs font-mono transition-colors"
            >
              <StopCircle className="w-3 h-3" />
              <span>Stop Agent</span>
            </button>
          )}

          <button
            onClick={onNewTaskModal}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-nexus-850 hover:bg-nexus-800 border border-nexus-border text-slate-200 text-xs font-mono transition-colors"
          >
            <Plus className="w-3 h-3 text-sky-400" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Main Conversation & Activity Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 select-text">
        {!activeTask && liveEvents.length === 0 ? (
          /* Empty State */
          <div className="max-w-2xl mx-auto py-12 space-y-6 text-center select-none">
            <div className="w-12 h-12 rounded-xl bg-nexus-900 border border-nexus-border mx-auto flex items-center justify-center text-sky-400 shadow-md">
              <Bot className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-slate-100 font-mono">Start a coding task</h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Tell NEXUS.AI what you want to build, fix, refactor, or understand in this workspace.
              </p>
            </div>

            {/* Quick Prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-left">
              {quickPrompts.map((qp, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setPromptInput(qp);
                    textareaRef.current?.focus();
                  }}
                  className="p-3 rounded-lg bg-nexus-900/70 hover:bg-nexus-850 border border-nexus-border text-xs text-slate-300 hover:text-white transition-all flex items-start space-x-2 group"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-sky-400 mt-0.5 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  <span className="leading-relaxed">{qp}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Active Task Conversation & Stage Pipeline */
          <div className="max-w-4xl mx-auto space-y-5">
            {/* Task Prompt Card */}
            {activeTask && (
              <div className="p-4 rounded-xl bg-nexus-900/80 border border-nexus-border-bright/70 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-400" />
                    <span className="font-semibold text-slate-200">USER REQUEST</span>
                  </div>
                  <span>{new Date(activeTask.createdAt).toLocaleTimeString()}</span>
                </div>
                <div className="text-sm text-slate-100 font-mono leading-relaxed pl-3.5 border-l-2 border-sky-500">
                  {activeTask.prompt}
                </div>
              </div>
            )}

            {/* Structured Agent Stages Pipeline */}
            <div className="rounded-xl bg-nexus-900/50 border border-nexus-border overflow-hidden">
              <button
                onClick={() =>
                  setExpandedSections((prev) => ({ ...prev, stages: !prev.stages }))
                }
                className="w-full px-4 py-2.5 bg-nexus-900/80 flex items-center justify-between text-xs font-mono text-slate-300 hover:bg-nexus-850 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-semibold">Specialist Agent Pipeline</span>
                  <span className="text-[10px] text-slate-500">
                    ({isRunning ? `Active: ${activeRole}` : 'Idle'})
                  </span>
                </div>
                {expandedSections.stages ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                )}
              </button>

              {expandedSections.stages && (
                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {agentStages.map((stage) => {
                    const isStageRunning = stage.status === 'running';
                    const isStageDone = stage.status === 'completed';
                    return (
                      <div
                        key={stage.role}
                        className={`p-2.5 rounded-lg border text-xs font-mono flex flex-col justify-between space-y-2 transition-all ${
                          isStageRunning
                            ? 'bg-sky-950/40 border-sky-500/60 shadow-sm shadow-sky-500/10'
                            : isStageDone
                            ? 'bg-nexus-950/60 border-emerald-900/40'
                            : 'bg-nexus-950/30 border-nexus-border/40 opacity-70'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-semibold text-[11px] ${
                              isStageRunning
                                ? 'text-sky-300'
                                : isStageDone
                                ? 'text-emerald-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {stage.name}
                          </span>
                          {isStageRunning ? (
                            <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                          ) : isStageDone ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                          )}
                        </div>

                        <div className="text-[10px] text-slate-400 leading-tight">
                          {isStageRunning
                            ? 'Executing...'
                            : isStageDone
                            ? 'Done'
                            : 'Waiting'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Streaming Thought / Reasoning Box */}
            {streamingThought && (
              <div className="rounded-xl bg-nexus-950 border border-nexus-border overflow-hidden">
                <button
                  onClick={() =>
                    setExpandedSections((prev) => ({ ...prev, reasoning: !prev.reasoning }))
                  }
                  className="w-full px-4 py-2 bg-nexus-900/60 flex items-center justify-between text-xs font-mono text-slate-300 hover:bg-nexus-850 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-semibold">Live Agent Reasoning Stream</span>
                    {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />}
                  </div>
                  {expandedSections.reasoning ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>

                {expandedSections.reasoning && (
                  <div className="p-3.5 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                    {streamingThought}
                    {isRunning && (
                      <span className="inline-block w-2 h-3.5 bg-sky-400 ml-1 animate-pulse" />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Structured Developer Activity Events */}
            <div className="rounded-xl bg-nexus-900/40 border border-nexus-border overflow-hidden">
              <button
                onClick={() =>
                  setExpandedSections((prev) => ({ ...prev, events: !prev.events }))
                }
                className="w-full px-4 py-2.5 bg-nexus-900/80 flex items-center justify-between text-xs font-mono text-slate-300 hover:bg-nexus-850 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <Activity className="w-3.5 h-3.5 text-sky-400" />
                  <span className="font-semibold">Workspace Operations & Tool Activity</span>
                  <span className="text-[10px] text-slate-500">
                    ({liveEvents.length} events recorded)
                  </span>
                </div>
                {expandedSections.events ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                )}
              </button>

              {expandedSections.events && (
                <div className="p-3 space-y-2 max-h-96 overflow-y-auto font-mono text-xs">
                  {liveEvents.length === 0 ? (
                    <div className="py-4 text-center text-slate-500 italic">
                      Agent tools will log operations here as the task progresses.
                    </div>
                  ) : (
                    liveEvents.map((event) => {
                      switch (event.type) {
                        case 'agent_started':
                          return (
                            <div
                              key={event.id}
                              className="p-2 rounded bg-nexus-950/80 border border-indigo-900/40 flex items-center space-x-2 text-indigo-300"
                            >
                              <Bot className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="font-semibold uppercase text-[10px] tracking-wider">
                                {event.agentRole}
                              </span>
                              <span className="text-slate-400">activated for session</span>
                            </div>
                          );

                        case 'tool_started':
                          return (
                            <div
                              key={event.id}
                              className="p-2 rounded bg-nexus-950/60 border border-nexus-border flex items-center space-x-2 text-slate-300"
                            >
                              <Code2 className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                              <span className="font-semibold text-sky-400">{event.toolName}</span>
                              <span className="text-slate-400">running tool execution...</span>
                            </div>
                          );

                        case 'tool_completed':
                          return (
                            <div
                              key={event.id}
                              className="p-2 rounded bg-nexus-950 border border-nexus-border/60 space-y-1"
                            >
                              <div className="flex items-center justify-between text-[11px]">
                                <div className="flex items-center space-x-2">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-400 font-semibold">{event.toolName}</span>
                                  <span className="text-slate-400">completed</span>
                                </div>
                                <span className="text-[10px] text-slate-500">{event.durationMs}ms</span>
                              </div>
                              {event.outputSummary && (
                                <div className="text-[11px] text-slate-300 pl-5 text-ellipsis overflow-hidden">
                                  {event.outputSummary}
                                </div>
                              )}
                            </div>
                          );

                        case 'command_started':
                          return (
                            <div
                              key={event.id}
                              className="p-2 rounded bg-nexus-950 border border-nexus-border text-slate-300 flex items-center space-x-2"
                            >
                              <Terminal className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                              <span className="text-emerald-400">$</span>
                              <span className="font-semibold text-slate-200">{event.command}</span>
                            </div>
                          );

                        case 'command_completed':
                          return (
                            <div
                              key={event.id}
                              className="p-2.5 rounded bg-nexus-950 border border-nexus-border/80 space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-slate-200">{event.command}</span>
                                </div>
                                <span
                                  className={`text-[10px] px-1.5 py-0.2 rounded border ${
                                    event.exitCode === 0
                                      ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                                      : 'border-rose-800 bg-rose-950/40 text-rose-300'
                                  }`}
                                >
                                  code: {event.exitCode}
                                </span>
                              </div>
                              {event.outputPreview && (
                                <pre className="p-2 rounded bg-nexus-900/60 text-[11px] text-slate-300 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                                  {event.outputPreview}
                                </pre>
                              )}
                            </div>
                          );

                        case 'task_completed':
                          return (
                            <div
                              key={event.id}
                              className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-800/60 space-y-2 text-emerald-200"
                            >
                              <div className="flex items-center space-x-2 font-bold text-xs">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                <span>Task Successfully Completed</span>
                              </div>
                              {latestDiff && (
                                <button
                                  onClick={() => setShowDiffModal(true)}
                                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-emerald-900/60 hover:bg-emerald-850 text-white text-xs font-mono transition-colors"
                                >
                                  <FileDiff className="w-3.5 h-3.5" />
                                  <span>View Modified Code Diffs</span>
                                </button>
                              )}
                            </div>
                          );

                        case 'task_failed':
                          return (
                            <div
                              key={event.id}
                              className="p-3.5 rounded-lg bg-rose-950/30 border border-rose-800/60 space-y-1 text-rose-200"
                            >
                              <div className="flex items-center space-x-2 font-bold text-xs text-rose-400">
                                <AlertCircle className="w-4 h-4" />
                                <span>Task Execution Failed</span>
                              </div>
                              <p className="text-xs text-rose-300">
                                {event.error || 'Agent stopped with error.'}
                              </p>
                            </div>
                          );

                        default:
                          return null;
                      }
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Compact Developer Chat Composer */}
      <div className="p-3 border-t border-nexus-border bg-nexus-950 flex-shrink-0">
        <form
          onSubmit={handleSubmit}
          className="max-w-4xl mx-auto rounded-xl bg-nexus-900/80 border border-nexus-border-bright focus-within:border-sky-500/80 transition-colors overflow-hidden"
        >
          {/* Input Area */}
          <textarea
            ref={textareaRef}
            rows={2}
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            placeholder={
              isRunning
                ? 'NEXUS.AI is executing your task...'
                : 'Ask NEXUS.AI to build, refactor, or debug code in this project... (Enter to send, Shift+Enter for newline)'
            }
            className="w-full bg-transparent px-3.5 pt-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none resize-none font-sans leading-relaxed"
          />

          {/* Bottom Composer Controls */}
          <div className="px-3.5 py-2 flex items-center justify-between text-xs font-mono border-t border-nexus-border/40 select-none">
            {/* Left Context: Workspace */}
            <div className="flex items-center space-x-2 text-slate-400 truncate">
              <button
                type="button"
                onClick={onOpenWorkspaceModal}
                className="flex items-center space-x-1.5 hover:text-sky-400 transition-colors truncate max-w-xs"
                title="Change active workspace"
              >
                <Folder className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                <span className="truncate">
                  Workspace: {activeWorkspace ? activeWorkspace.name : 'Select Folder...'}
                </span>
              </button>
            </div>

            {/* Right: Model & Send Button */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              <span className="text-[11px] text-slate-400 px-2 py-0.5 rounded bg-nexus-950 border border-nexus-border hidden sm:inline">
                {primaryProvider?.isConfigured
                  ? primaryProvider.defaultModel || primaryProvider.name
                  : 'Gemini 2.5 Flash'}
              </span>

              {isRunning ? (
                <button
                  type="button"
                  onClick={onCancelTask}
                  className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition-colors shadow-sm"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!promptInput.trim()}
                  className="flex items-center space-x-1.5 px-3.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium text-xs transition-colors shadow-sm shadow-sky-600/20"
                >
                  <span>Send</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Code Diff Modal if opened */}
      {showDiffModal && latestDiff && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-4xl h-5/6 bg-nexus-900 border border-nexus-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="h-10 px-4 border-b border-nexus-border flex items-center justify-between bg-nexus-950">
              <div className="flex items-center space-x-2 text-xs font-mono font-semibold text-slate-200">
                <FileDiff className="w-4 h-4 text-emerald-400" />
                <span>Code Modifications Diff</span>
              </div>
              <button
                onClick={() => setShowDiffModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <DiffViewer diffText={latestDiff} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
