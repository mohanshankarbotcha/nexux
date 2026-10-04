import {
  BaseTool,
} from './base-tool.js';
import {
  SearchFilesInput,
  SearchFilesOutput,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolExecutionError,
} from '@nexus/core';
import { globalWorkspaceService } from '../workspace/workspace-service.js';

export class SearchFilesTool extends BaseTool<SearchFilesInput, SearchFilesOutput> {
  readonly name: ToolName = 'search_files';
  readonly definition: ToolDefinition = {
    name: 'search_files',
    description: 'Searches for text content across files in the workspace.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text string to search for',
        },
        directoryPath: {
          type: 'string',
          description: 'Optional sub-directory to restrict search to',
        },
        filePattern: {
          type: 'string',
          description: 'Optional file extension or name pattern filter (e.g. ".ts")',
        },
        maxMatches: {
          type: 'number',
          description: 'Maximum number of matches to return (default 100)',
        },
      },
      required: ['query'],
    },
  };

  protected async run(input: SearchFilesInput, context: ToolCallContext): Promise<SearchFilesOutput> {
    if (!input.query) {
      throw new ToolExecutionError(this.name, 'query is required');
    }

    const searchRoot = input.directoryPath || context.workspaceRoot;
    return globalWorkspaceService.searchFiles(
      searchRoot,
      input.query,
      input.filePattern,
      input.maxMatches
    );
  }
}
