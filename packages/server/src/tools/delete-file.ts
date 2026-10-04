import fs from 'node:fs';
import {
  BaseTool,
} from './base-tool.js';
import {
  DeleteFileInput,
  DeleteFileOutput,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolExecutionError,
  SecurityViolationError,
  resolveSafePath,
  getSafeRelativePath,
  globalEventBus,
  AgentRole,
} from '@nexus/core';
import { globalFileCache } from '../cache/file-cache.js';

export class DeleteFileTool extends BaseTool<DeleteFileInput, DeleteFileOutput> {
  readonly name: ToolName = 'delete_file';
  readonly definition: ToolDefinition = {
    name: 'delete_file',
    description: 'Deletes a file from the workspace. Refuses to delete the workspace root or .git.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path of the file to delete',
        },
      },
      required: ['filePath'],
    },
  };

  protected async run(input: DeleteFileInput, context: ToolCallContext): Promise<DeleteFileOutput> {
    if (!input.filePath) {
      throw new ToolExecutionError(this.name, 'filePath is required');
    }

    const safePath = resolveSafePath(context.workspaceRoot, input.filePath);
    const relPath = getSafeRelativePath(context.workspaceRoot, safePath);

    if (relPath === '' || relPath === '.') {
      throw new SecurityViolationError('Refusing to delete the workspace root directory');
    }

    const normalizedRel = relPath.replace(/\\/g, '/');
    if (normalizedRel === '.git' || normalizedRel.startsWith('.git/')) {
      throw new SecurityViolationError('Refusing to delete .git directory or files');
    }

    if (!fs.existsSync(safePath)) {
      throw new ToolExecutionError(this.name, `File does not exist: '${relPath}'`);
    }

    const stat = fs.statSync(safePath);
    if (stat.isDirectory()) {
      fs.rmSync(safePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(safePath);
    }
    globalFileCache.invalidate(safePath);

    const bus = context.eventBus || globalEventBus;
    bus.emit({
      id: `evt_${Date.now()}`,
      type: 'file_changed',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: Date.now(),
      agentRole: (context.agentRole || 'coder') as AgentRole,
      file: {
        filePath: safePath,
        relativePath: relPath,
        changeType: 'deleted',
        timestamp: Date.now(),
      },
    });

    return {
      filePath: relPath,
      deleted: true,
    };
  }
}
