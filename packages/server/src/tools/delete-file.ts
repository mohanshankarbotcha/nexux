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
  ToolRiskClass,
  ToolExecutionError,
  SecurityViolationError,
  resolveSafePath,
  getSafeRelativePath,
  globalEventBus,
  AgentRole,
} from '@nexus/core';
import { globalFileCache } from '../cache/file-cache.js';
import { globalCheckpointManager } from '../storage/checkpoint-manager.js';

export class DeleteFileTool extends BaseTool<DeleteFileInput, DeleteFileOutput> {
  readonly name: ToolName = 'delete_file';
  override readonly riskClass: ToolRiskClass = 'destructive';
  override readonly concurrencySafe = false;

  readonly definition: ToolDefinition = {
    name: 'delete_file',
    description: 'Deletes a file from the workspace. Refuses to delete protected directories or files, and automatically creates an undo snapshot.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path of the file to delete',
        },
        requiresApproval: {
          type: 'boolean',
          description: 'Whether deleting requires explicit confirmation',
        },
      },
      required: ['filePath'],
    },
  };

  protected async run(input: DeleteFileInput, context: ToolCallContext): Promise<DeleteFileOutput> {
    if (!input.filePath || typeof input.filePath !== 'string') {
      throw new ToolExecutionError(this.name, 'filePath is required');
    }

    const relNormalized = input.filePath.trim().replace(/\\/g, '/');
    if (relNormalized === '.git' || relNormalized.startsWith('.git/')) {
      throw new SecurityViolationError('Refusing to delete .git directory or files');
    }
    if (relNormalized === '' || relNormalized === '.') {
      throw new SecurityViolationError('Refusing to delete the workspace root directory');
    }

    const safePath = resolveSafePath(context.workspaceRoot, input.filePath, {
      checkProtected: true,
      allowAppRepoMutation: context.allowAppRepoMutation,
    });
    const relPath = getSafeRelativePath(context.workspaceRoot, safePath);

    if (relPath === '' || relPath === '.') {
      throw new SecurityViolationError('Refusing to delete the workspace root directory');
    }

    if (!fs.existsSync(safePath)) {
      throw new ToolExecutionError(this.name, `File does not exist: '${relPath}'`);
    }

    // Rule R6: Snapshot before deletion
    let checkpointCreated = false;
    let checkpointPath: string | undefined;
    if (context.taskId) {
      const record = await globalCheckpointManager.createSnapshot(
        context.workspaceRoot,
        context.taskId,
        relPath
      );
      if (record) {
        checkpointCreated = true;
        checkpointPath = record.snapshotPath;
      }
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
      checkpointCreated,
      checkpointPath,
    };
  }
}
