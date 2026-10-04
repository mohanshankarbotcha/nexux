import fs from 'node:fs';
import path from 'node:path';
import {
  BaseTool,
} from './base-tool.js';
import {
  WriteFileInput,
  WriteFileOutput,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolExecutionError,
  resolveSafePath,
  getSafeRelativePath,
  globalEventBus,
  AgentRole,
} from '@nexus/core';

export class WriteFileTool extends BaseTool<WriteFileInput, WriteFileOutput> {
  readonly name: ToolName = 'write_file';
  readonly definition: ToolDefinition = {
    name: 'write_file',
    description: 'Writes content to a file in the workspace. Automatically creates parent directories.',
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
      },
      required: ['filePath', 'content'],
    },
  };

  protected async run(input: WriteFileInput, context: ToolCallContext): Promise<WriteFileOutput> {
    if (!input.filePath) {
      throw new ToolExecutionError(this.name, 'filePath is required');
    }
    if (input.content === undefined || input.content === null) {
      throw new ToolExecutionError(this.name, 'content is required');
    }

    const safePath = resolveSafePath(context.workspaceRoot, input.filePath);
    const relPath = getSafeRelativePath(context.workspaceRoot, safePath);
    const exists = fs.existsSync(safePath);

    if (exists && !input.overwrite) {
      throw new ToolExecutionError(
        this.name,
        `File already exists at '${relPath}'. Pass 'overwrite: true' to replace its content.`
      );
    }

    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(safePath, input.content, 'utf-8');
    const bytesWritten = Buffer.byteLength(input.content, 'utf-8');

    // Emit file changed event
    globalEventBus.emit({
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
    };
  }
}
