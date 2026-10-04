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
  ToolExecutionError,
  resolveSafePath,
  getSafeRelativePath,
  DEFAULT_TOOL_CONFIG,
} from '@nexus/core';

const IGNORED_BY_DEFAULT = new Set(['.git', 'node_modules', 'dist', 'build', '.cache']);

export class ListFilesTool extends BaseTool<ListFilesInput, ListFilesOutput> {
  readonly name: ToolName = 'list_files';
  readonly definition: ToolDefinition = {
    name: 'list_files',
    description: 'Lists files and directories in a given workspace directory.',
    parameters: {
      type: 'object',
      properties: {
        directoryPath: {
          type: 'string',
          description: 'Relative directory path to list (defaults to workspace root ".")'
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to list recursively (defaults to true)'
        },
        maxFiles: {
          type: 'number',
          description: 'Maximum number of file entries to return (default 1000)'
        }
      }
    }
  };

  protected async run(input: ListFilesInput, context: ToolCallContext): Promise<ListFilesOutput> {
    const targetDir = input.directoryPath || '.';
    const safePath = resolveSafePath(context.workspaceRoot, targetDir);
    const relRoot = getSafeRelativePath(context.workspaceRoot, safePath);

    if (!fs.existsSync(safePath)) {
      throw new ToolExecutionError(this.name, `Directory not found: '${relRoot}'`);
    }

    const stat = fs.statSync(safePath);
    if (!stat.isDirectory()) {
      throw new ToolExecutionError(this.name, `Path is a file, not a directory: '${relRoot}'`);
    }

    const maxFiles = input.maxFiles || 1000;
    const recursive = input.recursive !== false;
    const files: FileEntryItem[] = [];
    let truncated = false;

    function traverse(current: string) {
      if (files.length >= maxFiles) {
        truncated = true;
        return;
      }

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (files.length >= maxFiles) {
          truncated = true;
          break;
        }

        if (IGNORED_BY_DEFAULT.has(entry.name)) continue;

        const fullEntryPath = path.join(current, entry.name);
        const relEntryPath = getSafeRelativePath(context.workspaceRoot, fullEntryPath);

        let size = 0;
        let modified = 0;
        try {
          const entryStat = fs.statSync(fullEntryPath);
          size = entryStat.size;
          modified = entryStat.mtimeMs;
        } catch {}

        files.push({
          name: entry.name,
          relativePath: relEntryPath,
          isDirectory: entry.isDirectory(),
          sizeBytes: size,
          modifiedAt: modified,
        });

        if (recursive && entry.isDirectory()) {
          traverse(fullEntryPath);
        }
      }
    }

    traverse(safePath);

    return {
      directoryPath: relRoot,
      files,
      truncated,
    };
  }
}
