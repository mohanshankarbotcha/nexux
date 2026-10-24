import fs from 'node:fs';
import {
  BaseTool,
} from './base-tool.js';
import {
  CreateDirectoryInput,
  CreateDirectoryOutput,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolRiskClass,
  ToolExecutionError,
  resolveSafePath,
  getSafeRelativePath,
} from '@nexus/core';

export class CreateDirectoryTool extends BaseTool<CreateDirectoryInput, CreateDirectoryOutput> {
  readonly name: ToolName = 'create_directory';
  override readonly riskClass: ToolRiskClass = 'write';
  override readonly concurrencySafe = false;

  readonly definition: ToolDefinition = {
    name: 'create_directory',
    description: 'Creates a directory within the authorized workspace. Supports recursive directory creation.',
    parameters: {
      type: 'object',
      properties: {
        directoryPath: {
          type: 'string',
          description: 'Relative path of the directory to create',
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to create intermediate parent directories (defaults to true)',
        },
      },
      required: ['directoryPath'],
    },
  };

  protected async run(input: CreateDirectoryInput, context: ToolCallContext): Promise<CreateDirectoryOutput> {
    if (!input.directoryPath || typeof input.directoryPath !== 'string') {
      throw new ToolExecutionError(this.name, 'directoryPath parameter is required');
    }

    const safePath = resolveSafePath(context.workspaceRoot, input.directoryPath, {
      checkProtected: true,
      allowAppRepoMutation: context.allowAppRepoMutation,
    });
    const relPath = getSafeRelativePath(context.workspaceRoot, safePath);

    const recursive = input.recursive !== false;
    fs.mkdirSync(safePath, { recursive });

    return {
      directoryPath: relPath,
      created: true,
    };
  }
}
