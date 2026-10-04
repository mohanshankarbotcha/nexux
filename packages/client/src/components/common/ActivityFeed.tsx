import React, { useRef, useEffect } from 'react';
import {
  Activity,
  Bot,
  Wrench,
  Terminal,
  FileEdit,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { NexusEvent } from '@nexus/core';

interface ActivityFeedProps {
  events: NexusEvent[];
  streamingThought?: string;
  activeAgentRole?: string;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  events,
  streamingThought,
  activeAgentRole,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events, streamingThought]);

  const getEventIcon = (event: NexusEvent) => {
    switch (event.type) {
      case 'agent_started':
      case 'agent_completed':
        return <Bot className="w-3.5 h-3.5 text-sky-400" />;
      case 'tool_started':
      case 'tool_completed':
        return <Wrench className="w-3.5 h-3.5 text-amber-400" />;
      case 'command_started':
      case 'command_completed':
        return <Terminal className="w-3.5 h-3.5 text-emerald-400" />;
      case 'file_changed':
        return <FileEdit className="w-3.5 h-3.5 text-purple-400" />;
      case 'task_completed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'task_failed':
      case 'test_failed':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const formatEventSummary = (event: NexusEvent) => {
    switch (event.type) {
      case 'agent_started':
        return `Agent [${event.agentRole}] started`;
      case 'agent_completed':
        return `Agent [${event.agentRole}] finished`;
      case 'tool_started':
        return `Executing tool: ${event.toolName}`;
      case 'tool_completed':
        return `Tool ${event.toolName} ${event.success ? 'succeeded' : 'failed'} (${event.durationMs}ms)`;
      case 'command_started':
        return `Running shell command: ${event.command}`;
      case 'command_completed':
        return `Command finished (exit code ${event.exitCode}, ${event.durationMs}ms)`;
      case 'file_changed':
        return `File ${event.file.changeType}: ${event.file.relativePath}`;
      case 'agent_message':
        return event.content;
      case 'task_started':
        return `Task initiated: "${event.prompt.slice(0, 80)}"`;
      case 'task_completed':
        return `Task successfully completed in ${event.totalDurationMs}ms`;
      case 'task_failed':
        return `Task failed: ${event.error}`;
      default:
        return JSON.stringify(event);
    }
  };

  return (
    <div className="h-full flex flex-col bg-nexus-950 font-mono text-xs overflow-hidden select-text">
      <div className="h-7 border-b border-nexus-border bg-nexus-900/60 px-3 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2 text-slate-300">
          <Activity className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-semibold text-xs">Live Agent Activity Feed</span>
          <span className="text-[10px] text-slate-500">({events.length} events)</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2.5 leading-relaxed">
        {events.length === 0 && !streamingThought ? (
          <div className="text-slate-600 italic select-none">
            No agent activity yet. Start a task to observe autonomous execution in real time.
          </div>
        ) : (
          events.map((event, idx) => (
            <div
              key={event.id || idx}
              className="flex items-start space-x-2 p-1.5 rounded hover:bg-nexus-900/50 transition-colors"
            >
              <div className="mt-0.5 shrink-0 select-none">{getEventIcon(event)}</div>
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center space-x-2 select-none">
                  <span className="text-[10px] text-slate-500">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-slate-400">
                    {event.type.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-slate-300 font-sans text-xs break-all">
                  {formatEventSummary(event)}
                </div>
              </div>
            </div>
          ))
        )}

        {/* Real-time Streaming Thought Chunk */}
        {streamingThought && (
          <div className="p-2.5 rounded bg-sky-950/20 border border-sky-800/40 text-sky-200 space-y-1 animate-pulse">
            <div className="flex items-center space-x-1.5 text-[10px] text-sky-400 font-bold uppercase select-none">
              <Bot className="w-3 h-3" />
              <span>{activeAgentRole || 'Agent'} is thinking...</span>
            </div>
            <p className="font-sans text-xs whitespace-pre-wrap leading-relaxed">
              {streamingThought}
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};
