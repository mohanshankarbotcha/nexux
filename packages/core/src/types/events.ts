import { AgentRole } from './agent.js';
import { TaskStatus, ChangedFile } from './session.js';
import { ToolName } from './tool.js';

export type NexusEventType =
  | 'task_started'
  | 'task_progress'
  | 'task_heartbeat'
  | 'agent_started'
  | 'agent_message'
  | 'tool_started'
  | 'tool_completed'
  | 'file_changed'
  | 'command_started'
  | 'command_completed'
  | 'test_failed'
  | 'agent_completed'
  | 'task_completed'
  | 'task_failed'
  | 'task_cancelled';

export interface BaseNexusEvent {
  id: string;
  type: NexusEventType;
  sessionId: string;
  taskId: string;
  timestamp: number;
}

export interface TaskStartedEvent extends BaseNexusEvent {
  type: 'task_started';
  prompt: string;
}

export interface TaskProgressEvent extends BaseNexusEvent {
  type: 'task_progress';
  stage: string;
  agentRole?: AgentRole;
  status: TaskStatus;
  message?: string;
  percent?: number;
}

export interface TaskHeartbeatEvent extends BaseNexusEvent {
  type: 'task_heartbeat';
  stage: string;
  agentRole?: AgentRole;
  status: TaskStatus;
  elapsedMs: number;
}

export interface AgentStartedEvent extends BaseNexusEvent {
  type: 'agent_started';
  agentRole: AgentRole;
  goal: string;
}

export interface AgentMessageEvent extends BaseNexusEvent {
  type: 'agent_message';
  agentRole: AgentRole;
  content: string;
  isStreaming?: boolean;
}

export interface ToolStartedEvent extends BaseNexusEvent {
  type: 'tool_started';
  agentRole: AgentRole;
  toolCallId: string;
  toolName: ToolName;
  input: Record<string, unknown>;
}

export interface ToolCompletedEvent extends BaseNexusEvent {
  type: 'tool_completed';
  agentRole: AgentRole;
  toolCallId: string;
  toolName: ToolName;
  success: boolean;
  durationMs: number;
  outputSummary?: string;
  error?: string;
}

export interface FileChangedEvent extends BaseNexusEvent {
  type: 'file_changed';
  agentRole: AgentRole;
  file: ChangedFile;
}

export interface CommandStartedEvent extends BaseNexusEvent {
  type: 'command_started';
  command: string;
}

export interface CommandCompletedEvent extends BaseNexusEvent {
  type: 'command_completed';
  command: string;
  exitCode: number | null;
  outputPreview: string;
  durationMs: number;
}

export interface TestFailedEvent extends BaseNexusEvent {
  type: 'test_failed';
  command: string;
  failureSummary: string;
}

export interface AgentCompletedEvent extends BaseNexusEvent {
  type: 'agent_completed';
  agentRole: AgentRole;
  summary: string;
}

export interface TaskCompletedEvent extends BaseNexusEvent {
  type: 'task_completed';
  status: TaskStatus;
  summary: string;
  totalDurationMs: number;
  totalTokens?: number;
  totalCostUsd?: number;
}

export interface TaskFailedEvent extends BaseNexusEvent {
  type: 'task_failed';
  error: string;
}

export interface TaskCancelledEvent extends BaseNexusEvent {
  type: 'task_cancelled';
  reason?: string;
}

export type NexusEvent =
  | TaskStartedEvent
  | TaskProgressEvent
  | TaskHeartbeatEvent
  | AgentStartedEvent
  | AgentMessageEvent
  | ToolStartedEvent
  | ToolCompletedEvent
  | FileChangedEvent
  | CommandStartedEvent
  | CommandCompletedEvent
  | TestFailedEvent
  | AgentCompletedEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | TaskCancelledEvent;
