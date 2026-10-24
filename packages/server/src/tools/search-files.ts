import {
  BaseTool,
} from './base-tool.js';
import {
  SearchFilesInput,
  SearchFilesOutput,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolRiskClass,
  ToolExecutionError,
  resolveWorkspacePath,
  resolveSafePath,
} from '@nexus/core';
import { globalWorkspaceService } from '../workspace/workspace-service.js';

export class SearchFilesTool extends BaseTool<SearchFilesInput, SearchFilesOutput> {
  readonly name: ToolName = 'search_files';
  override readonly riskClass: ToolRiskClass = 'read';
  override readonly concurrencySafe = true;

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
    if (!input.query || typeof input.query !== 'string') {
      throw new ToolExecutionError(this.name, 'query is required');
    }

    let searchRoot = context.workspaceRoot;
    if (input.directoryPath) {
      const resolved = resolveWorkspacePath(context.workspaceRoot, input.directoryPath);
      if (resolved.status === 'resolved' && resolved.resolvedPath) {
        searchRoot = resolved.resolvedPath;
      } else {
        searchRoot = resolveSafePath(context.workspaceRoot, input.directoryPath);
      }
    }

    return globalWorkspaceService.searchFiles(
      searchRoot,
      input.query,
      input.filePattern,
      input.maxMatches
    );
  }
}
