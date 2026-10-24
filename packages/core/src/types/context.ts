import { TaskPlan, TaskStatus } from './session.js';
import { RouteProfile } from './route.js';
import { ChangeSet } from './workflow.js';

export interface ProjectProfile {
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'cargo' | 'go' | 'unknown';
  language: 'typescript' | 'javascript' | 'python' | 'rust' | 'go' | 'html' | 'unknown';
  scripts: Record<string, string>;
  testCommand?: string;
  buildCommand?: string;
  runCommand?: string;
  detectedAt: number;
}

export interface WorkingSetItem {
  filePath: string;
  relativePath: string;
  sha256: string;
  mtimeMs: number;
  byteSize: number;
  lastAccessedAt: number;
  lastOperation: 'read' | 'write' | 'edit';
}

export interface RecentToolEvidence {
  evidenceId: string;
  tool: string;
  argsSummary: string;
  resultSummary: string;
  ok: boolean;
  timestamp: number;
}

export interface SessionWorkingSetState {
  sessionId: string;
  workspaceRoot: string;
  items: WorkingSetItem[];
  recentEvidences: RecentToolEvidence[];
  lastError?: {
    command?: string;
    errorText: string;
    diagnostics?: string[];
    timestamp: number;
  };
  lastChangeSet?: ChangeSet;
  lastTestCommand?: string;
  candidateHistory?: {
    prompt: string;
    selectedTarget?: string;
    alternatives: string[];
    timestamp: number;
  };
  updatedAt: number;
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: Array<{ id: string; name: string; arguments: any }>;
  evidenceId?: string;
  isCorrection?: boolean;
}

export interface ConversationSummary {
  compactedTurnsCount: number;
  keyFacts: string[];
  keyDecisions: string[];
  verbatimCorrections: string[];
  lastCompactedAt: number;
}

export interface ReferenceResolutionResult {
  resolved: boolean;
  type: 'file' | 'error' | 'command' | 'changeset' | 'clarification' | 'none';
  target?: string;
  candidates?: string[];
  clarificationQuestion?: string;
  source: string;
}

export interface LayeredContextPackage {
  sessionId: string;
  taskId: string;
  workspaceRoot: string;
  projectProfile: ProjectProfile;
  workingSet: WorkingSetItem[];
  staleFilesDetected: string[];
  activePlan?: TaskPlan;
  recentMessages: ConversationTurn[];
  conversationSummary?: ConversationSummary;
  totalTokens: number;
  generatedAt: number;
}
