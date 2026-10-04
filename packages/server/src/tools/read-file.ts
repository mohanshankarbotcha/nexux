import {
  BaseTool,
} from './base-tool.js';
import {
  ReadFileInput,
  ReadFileOutput,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolExecutionError,
} from '@nexus/core';
import { globalWorkspaceService } from '../workspace/workspace-service.js';

export class ReadFileTool extends BaseTool<ReadFileInput, ReadFileOutput> {
  readonly name: ToolName = 'read_file';
  readonly definition: ToolDefinition = {
    name: 'read_file',
    description: 'Reads the contents of a file within the workspace. Supports line range slicing.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Relative or absolute path to the file within the workspace',
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
    if (!input.filePath) {
      throw new ToolExecutionError(this.name, 'filePath parameter is required');
    }

    const res = globalWorkspaceService.readFileContent(
      context.workspaceRoot,
      input.filePath,
      input.startLine,
      input.endLine
    );

    return {
      filePath: res.relativePath,
      content: res.content,
      totalLines: res.totalLines,
      startLine: res.startLine,
      endLine: res.endLine,
    };
  }
}
