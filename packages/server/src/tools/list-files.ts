import fs from 'node:fs';
import path from 'node:path';
import {
  BaseTool,
} from './base-tool.js';
import {
  ListFilesInput,
  ListFilesOutput,
  FileEntryItem,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolRiskClass,
  ToolExecutionError,
  resolveSafePath,
  resolveWorkspacePath,
  getSafeRelativePath,
} from '@nexus/core';

const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'release',
  '.cache',
  '.nexus',
  '__pycache__',
  '.venv',
  'venv',
]);

export class ListFilesTool extends BaseTool<ListFilesInput, ListFilesOutput> {
  readonly name: ToolName = 'list_files';
  override readonly riskClass: ToolRiskClass = 'read';
  override readonly concurrencySafe = true;

  readonly definition: ToolDefinition = {
    name: 'list_files',
    description: 'Lists files and directories in a given workspace directory with deterministic ordering, ignore filters, and pagination.',
    parameters: {
      type: 'object',
      properties: {
        directoryPath: {
          type: 'string',
          description: 'Relative directory path to list (defaults to workspace root ".")',
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to list recursively (defaults to true)',
        },
        offset: {
          type: 'number',
          description: 'Pagination starting offset (defaults to 0)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of file entries to return (default: 100, max: 1000)',
        },
        includeIgnored: {
          type: 'boolean',
          description: 'Whether to include build/dependency directories like node_modules and dist (defaults to false)',
        },
        sortBy: {
          type: 'string',
          enum: ['name', 'size', 'modified'],
          description: 'Sort field (defaults to "name")',
        },
      },
    },
  };

  protected async run(input: ListFilesInput, context: ToolCallContext): Promise<ListFilesOutput> {
    const rawTarget = input.directoryPath || '.';
    let safePath: string;

    // First try path resolver for colloquial names like "the demo folder" or "demo"
    const resolved = resolveWorkspacePath(context.workspaceRoot, rawTarget);
    if (resolved.status === 'resolved' && resolved.resolvedPath && fs.statSync(resolved.resolvedPath).isDirectory()) {
      safePath = resolved.resolvedPath;
    } else {
      safePath = resolveSafePath(context.workspaceRoot, rawTarget);
    }

    const relRoot = getSafeRelativePath(context.workspaceRoot, safePath);

    if (!fs.existsSync(safePath)) {
      throw new ToolExecutionError(this.name, `Directory not found: '${relRoot}'`);
    }

    const stat = fs.statSync(safePath);
    if (!stat.isDirectory()) {
      throw new ToolExecutionError(this.name, `Path is a file, not a directory: '${relRoot}'`);
    }

    const offset = Math.max(0, input.offset || 0);
    const limit = Math.min(1000, Math.max(1, input.limit || input.maxFiles || 100));
    const recursive = input.recursive !== false;
    const includeIgnored = input.includeIgnored === true;
    const sortBy = input.sortBy || 'name';

    const allEntries: FileEntryItem[] = [];

    function traverse(current: string) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        // A permission or read error on a specific folder must not crash the whole listing
        return;
      }

      for (const entry of entries) {
        if (!includeIgnored && DEFAULT_IGNORED_DIRS.has(entry.name)) {
          continue;
        }

        const fullEntryPath = path.join(current, entry.name);
        let relEntryPath = '';
        try {
          relEntryPath = getSafeRelativePath(context.workspaceRoot, fullEntryPath);
        } catch {
          continue;
        }

        let size = 0;
        let modified = 0;
        let isDir = entry.isDirectory();
        let isSymlink = entry.isSymbolicLink();

        try {
          const entryStat = fs.statSync(fullEntryPath);
          size = entryStat.size;
          modified = entryStat.mtimeMs;
          isDir = entryStat.isDirectory();
        } catch {
          // Individual entry stat permission or access error handled gracefully
        }

        allEntries.push({
          name: entry.name,
          relativePath: relEntryPath,
          type: isSymlink ? 'symlink' : isDir ? 'directory' : 'file',
          isDirectory: isDir,
          sizeBytes: size,
          modifiedAt: modified,
        });

        if (isDir && recursive && (!isSymlink)) {
          traverse(fullEntryPath);
        }
      }
    }

    traverse(safePath);

    // Deterministic sorting
    allEntries.sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      if (sortBy === 'size') {
        return b.sizeBytes - a.sizeBytes;
      }
      if (sortBy === 'modified') {
        return b.modifiedAt - a.modifiedAt;
      }
      return a.relativePath.localeCompare(b.relativePath);
    });

    const totalEntries = allEntries.length;
    const paginated = allEntries.slice(offset, offset + limit);
    const hasMore = offset + limit < totalEntries;

    return {
      directoryPath: relRoot,
      files: paginated,
      totalEntries,
      offset,
      limit,
      hasMore,
      truncated: hasMore,
    };
  }
}
