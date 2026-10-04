export type AgentRole =
  | 'coordinator'
  | 'explorer'
  | 'planner'
  | 'coder'
  | 'debugger'
  | 'reviewer';

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'executing_tool'
  | 'waiting_approval'
  | 'completed'
  | 'failed';

export interface AgentState {
  role: AgentRole;
  status: AgentStatus;
  currentTaskDescription?: string;
  activeToolCallId?: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface AgentMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  agentRole?: AgentRole;
  content: string;
  toolCalls?: AgentToolCall[];
  toolCallId?: string;
  timestamp: number;
}

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentTransition {
  fromAgent?: AgentRole;
  toAgent: AgentRole;
  reason: string;
  timestamp: number;
}
