import { ToolRegistry, globalToolRegistry } from './tool-registry.js';
import { ReadFileTool } from './read-file.js';
import { WriteFileTool } from './write-file.js';
import { EditFileTool } from './edit-file.js';
import { DeleteFileTool } from './delete-file.js';
import { ListFilesTool } from './list-files.js';
import { SearchFilesTool } from './search-files.js';
import { TerminalTool } from './terminal.js';
import { GitStatusTool } from './git-status.js';
import { GitDiffTool } from './git-diff.js';

export * from './base-tool.js';
export * from './tool-registry.js';
export * from './read-file.js';
export * from './write-file.js';
export * from './edit-file.js';
export * from './delete-file.js';
export * from './list-files.js';
export * from './search-files.js';
export * from './terminal.js';
export * from './git-status.js';
export * from './git-diff.js';

export function registerDefaultTools(registry: ToolRegistry = globalToolRegistry): void {
  registry.register(new ReadFileTool());
  registry.register(new WriteFileTool());
  registry.register(new EditFileTool());
  registry.register(new DeleteFileTool());
  registry.register(new ListFilesTool());
  registry.register(new SearchFilesTool());
  registry.register(new TerminalTool());
  registry.register(new GitStatusTool());
  registry.register(new GitDiffTool());
}

// Auto-register default tools in global registry
registerDefaultTools(globalToolRegistry);
