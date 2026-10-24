import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  BaseTool,
} from './base-tool.js';
import {
  WriteFileInput,
  WriteFileOutput,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolRiskClass,
  ToolExecutionError,
  resolveSafePath,
  getSafeRelativePath,
  globalEventBus,
  AgentRole,
} from '@nexus/core';
import { globalFileCache } from '../cache/file-cache.js';
import { globalCheckpointManager } from '../storage/checkpoint-manager.js';

export class WriteFileTool extends BaseTool<WriteFileInput, WriteFileOutput> {
  readonly name: ToolName = 'write_file';
  override readonly riskClass: ToolRiskClass = 'write';
  override readonly concurrencySafe = false;

  readonly definition: ToolDefinition = {
    name: 'write_file',
    description: 'Writes content to a file in the workspace. Automatically creates parent directories and checkpoints existing files.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path of the file to create or overwrite',
        },
        content: {
          type: 'string',
          description: 'The string content to write to the file',
        },
        overwrite: {
          type: 'boolean',
          description: 'Set to true if overwriting an existing file is intended',
        },
        requiresApproval: {
          type: 'boolean',
          description: 'Whether writing requires explicit user confirmation',
        },
      },
      required: ['filePath', 'content'],
    },
  };

  protected async run(input: WriteFileInput, context: ToolCallContext): Promise<WriteFileOutput> {
    if (!input.filePath || typeof input.filePath !== 'string') {
      throw new ToolExecutionError(this.name, 'filePath is required');
    }
    if (input.content === undefined || input.content === null) {
      throw new ToolExecutionError(this.name, 'content is required');
    }

    const safePath = resolveSafePath(context.workspaceRoot, input.filePath, {
      checkProtected: true,
      allowAppRepoMutation: context.allowAppRepoMutation,
    });
    const relPath = getSafeRelativePath(context.workspaceRoot, safePath);
    const exists = fs.existsSync(safePath);

    if (exists && !input.overwrite) {
      throw new ToolExecutionError(
        this.name,
        `File already exists at '${relPath}'. Pass 'overwrite: true' to replace its content.`
      );
    }

    // Rule R6: Snapshot pre-existing file before first modification in this task
    let checkpointCreated = false;
    let checkpointPath: string | undefined;
    if (exists && context.taskId) {
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

    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(safePath, input.content, 'utf-8');
    globalFileCache.invalidate(safePath);
    const bytesWritten = Buffer.byteLength(input.content, 'utf-8');
    const sha256 = crypto.createHash('sha256').update(input.content, 'utf-8').digest('hex');

    // Emit file changed event
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
        changeType: exists ? 'modified' : 'created',
        timestamp: Date.now(),
      },
    });

    return {
      filePath: relPath,
      bytesWritten,
      isCreated: !exists,
      sha256,
      checkpointCreated,
      checkpointPath,
    };
  }
}
