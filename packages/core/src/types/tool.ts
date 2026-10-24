import type { NexusEventBus } from '../events/event-bus.js';

export type ToolRiskClass = 'read' | 'write' | 'exec' | 'destructive';

export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'delete_file'
  | 'list_files'
  | 'search_files'
  | 'create_directory'
  | 'terminal'
  | 'git_status'
  | 'git_diff';

export interface ToolCallContext {
  workspaceRoot: string;
  sessionId: string;
  taskId: string;
  agentRole: string;
  abortSignal?: AbortSignal;
  eventBus?: NexusEventBus;
  allowAppRepoMutation?: boolean;
}

export interface ToolResultError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ToolResultEnvelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: ToolResultError;
  durationMs: number;
  truncated: boolean;
  evidenceId: string;
}

export interface ToolResult<T = unknown> {
  toolName: ToolName;
  callId: string;
  success: boolean;
  ok?: boolean;
  data?: T;
  error?: string;
  durationMs: number;
  truncated?: boolean;
  evidenceId?: string;
  envelope?: ToolResultEnvelope<T>;
}

export interface ReadFileInput {
  filePath: string;
  startLine?: number;
  endLine?: number;
}

export interface ReadFileOutput {
  filePath: string;
  content: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  sha256?: string;
  sizeBytes?: number;
}

export interface WriteFileInput {
  filePath: string;
  content: string;
  overwrite?: boolean;
  requiresApproval?: boolean;
}

export interface WriteFileOutput {
  filePath: string;
  bytesWritten: number;
  isCreated: boolean;
  sha256?: string;
  checkpointCreated?: boolean;
  checkpointPath?: string;
}

export interface EditFileInput {
  filePath: string;
  targetContent: string;
  replacementContent: string;
  replaceAll?: boolean;
  expectedHash?: string;
}

export interface EditFileOutput {
  filePath: string;
  replacementsApplied: number;
  previousHash?: string;
  newHash?: string;
  checkpointCreated?: boolean;
  checkpointPath?: string;
}

export interface DeleteFileInput {
  filePath: string;
  requiresApproval?: boolean;
}

export interface DeleteFileOutput {
  filePath: string;
  deleted: boolean;
  checkpointCreated?: boolean;
  checkpointPath?: string;
}

export interface CreateDirectoryInput {
  directoryPath: string;
  recursive?: boolean;
}

export interface CreateDirectoryOutput {
  directoryPath: string;
  created: boolean;
}

export interface ListFilesInput {
  directoryPath?: string;
  recursive?: boolean;
  maxFiles?: number;
  offset?: number;
  limit?: number;
  includeIgnored?: boolean;
  sortBy?: 'name' | 'size' | 'modified';
}

export interface FileEntryItem {
  name: string;
  relativePath: string;
  type: 'file' | 'directory' | 'symlink';
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: number;
}

export interface ListFilesOutput {
  directoryPath: string;
  files: FileEntryItem[];
  totalEntries: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  truncated: boolean;
}

export interface SearchFilesInput {
  query: string;
  directoryPath?: string;
  filePattern?: string;
  maxMatches?: number;
}

export interface SearchMatchItem {
  filePath: string;
  lineNumber: number;
  lineContent: string;
}

export interface SearchFilesOutput {
  query: string;
  matches: SearchMatchItem[];
  totalMatches: number;
  truncated: boolean;
}

export interface TerminalInput {
  command: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  workingDir?: string;
}

export interface TerminalOutput {
  command: string;
  exitCode: number | null;
  signal?: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  logPath?: string;
}

export interface GitStatusOutput {
  branch: string;
  isClean: boolean;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
}

export interface GitDiffInput {
  filePath?: string;
  staged?: boolean;
}

export interface GitDiffOutput {
  diff: string;
  filesChanged: number;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface DiagnosticItem {
  file: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  severity: DiagnosticSeverity;
  source?: 'typescript' | 'eslint' | 'jest' | 'vitest' | 'python' | 'node' | 'npm' | 'generic';
}

export interface ParsedDiagnostics {
  diagnostics: DiagnosticItem[];
  errorCount: number;
  warningCount: number;
  rawTail?: string;
}

export interface EvidenceRecord {
  evidenceId: string;
  taskId: string;
  tool: ToolName;
  argsRedacted: Record<string, unknown>;
  resultSummary: string;
  ok: boolean;
  durationMs: number;
  timestamp: number;
  dataRef?: string;
}

export type ClaimType = 'created' | 'modified' | 'deleted' | 'listed' | 'ran' | 'passed' | 'failed';

export interface ClaimItem {
  type: ClaimType;
  subject: string;
  evidenceId?: string;
}

export interface ClaimVerificationResult {
  claim: ClaimItem;
  supported: boolean;
  reason: string;
}

export type PathResolutionStatus = 'resolved' | 'ambiguous' | 'notFound' | 'outsideWorkspace';

export interface PathResolutionResult {
  status: PathResolutionStatus;
  targetInput: string;
  resolvedPath?: string;
  relativePath?: string;
  candidates?: string[];
  reason?: string;
}
