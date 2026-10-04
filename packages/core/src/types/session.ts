import { AgentRole, AgentState } from './agent.js';

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ChangedFile {
  filePath: string;
  relativePath: string;
  changeType: 'created' | 'modified' | 'deleted';
  diff?: string;
  timestamp: number;
}

export interface TaskPlanStep {
  id: string;
  description: string;
  targetFiles?: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  verificationCommand?: string;
}

export interface TaskPlan {
  summary: string;
  steps: TaskPlanStep[];
  risks?: string[];
  createdAt: number;
}

export interface Task {
  id: string;
  sessionId: string;
  prompt: string;
  status: TaskStatus;
  currentAgentRole?: AgentRole;
  plan?: TaskPlan;
  changedFiles: ChangedFile[];
  activeAgents: AgentState[];
  resultSummary?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface Session {
  id: string;
  workspaceId: string;
  workspacePath: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  activeTaskId?: string;
  taskIds: string[];
}
