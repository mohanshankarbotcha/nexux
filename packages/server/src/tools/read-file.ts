import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  BaseTool,
} from './base-tool.js';
import {
  ReadFileInput,
  ReadFileOutput,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolRiskClass,
  ToolExecutionError,
  resolveSafePath,
  resolveWorkspacePath,
  getSafeRelativePath,
} from '@nexus/core';
import { globalWorkspaceService } from '../workspace/workspace-service.js';

export class ReadFileTool extends BaseTool<ReadFileInput, ReadFileOutput> {
  readonly name: ToolName = 'read_file';
  override readonly riskClass: ToolRiskClass = 'read';
  override readonly concurrencySafe = true;

  readonly definition: ToolDefinition = {
    name: 'read_file',
    description: 'Reads the contents of a file within the workspace. Supports line range slicing and returns file hash for safe editing.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Relative or colloquial path to the file within the workspace',
        },
        startLine: {
          type: 'number',
          description: 'Optional 1-based start line number to begin reading from',
        },
        endLine: {
          type: 'number',
          description: 'Optional 1-based end line number (inclusive)',
        },
      },
      required: ['filePath'],
    },
  };

  protected async run(input: ReadFileInput, context: ToolCallContext): Promise<ReadFileOutput> {
    if (!input.filePath || typeof input.filePath !== 'string') {
      throw new ToolExecutionError(this.name, 'filePath parameter is required');
    }

    // Resolve colloquial or relative path
    let targetPath = input.filePath;
    const resolved = resolveWorkspacePath(context.workspaceRoot, input.filePath);
    if (resolved.status === 'resolved' && resolved.resolvedPath && fs.statSync(resolved.resolvedPath).isFile()) {
      targetPath = resolved.relativePath || input.filePath;
    }

    // Check protected paths (protect .env and secret keys from being read by agents)
    const fullPath = resolveSafePath(context.workspaceRoot, targetPath, {
      checkProtected: true,
      allowAppRepoMutation: context.allowAppRepoMutation,
    });

    const res = globalWorkspaceService.readFileContent(
      context.workspaceRoot,
      targetPath,
      input.startLine,
      input.endLine
    );

    const fullContent = fs.readFileSync(fullPath);
    const sha256 = crypto.createHash('sha256').update(fullContent).digest('hex');

    return {
      filePath: res.relativePath,
      content: res.content,
      totalLines: res.totalLines,
      startLine: res.startLine,
      endLine: res.endLine,
      sha256,
      sizeBytes: Buffer.byteLength(res.content, 'utf-8'),
    };
  }
}
