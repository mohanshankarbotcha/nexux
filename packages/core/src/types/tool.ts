export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'delete_file'
  | 'list_files'
  | 'search_files'
  | 'terminal'
  | 'git_status'
  | 'git_diff';

export interface ToolCallContext {
  workspaceRoot: string;
  sessionId: string;
  taskId: string;
  agentRole: string;
  abortSignal?: AbortSignal;
}

export interface ToolResult<T = unknown> {
  toolName: ToolName;
  callId: string;
  success: boolean;
  data?: T;
  error?: string;
  durationMs: number;
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
}

export interface WriteFileInput {
  filePath: string;
  content: string;
  overwrite?: boolean;
}

export interface WriteFileOutput {
  filePath: string;
  bytesWritten: number;
  isCreated: boolean;
}

export interface EditFileInput {
  filePath: string;
  targetContent: string;
  replacementContent: string;
  replaceAll?: boolean;
}

export interface EditFileOutput {
  filePath: string;
  replacementsApplied: number;
}

export interface DeleteFileInput {
  filePath: string;
}

export interface DeleteFileOutput {
  filePath: string;
  deleted: boolean;
}

export interface ListFilesInput {
  directoryPath?: string;
  recursive?: boolean;
  maxFiles?: number;
}

export interface FileEntryItem {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: number;
}

export interface ListFilesOutput {
  directoryPath: string;
  files: FileEntryItem[];
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
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
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
