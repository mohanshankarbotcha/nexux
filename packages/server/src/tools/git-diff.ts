import { spawnSync } from 'node:child_process';
import {
  BaseTool,
} from './base-tool.js';
import {
  GitDiffInput,
  GitDiffOutput,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  resolveSafePath,
  getSafeRelativePath,
} from '@nexus/core';

export class GitDiffTool extends BaseTool<GitDiffInput, GitDiffOutput> {
  readonly name: ToolName = 'git_diff';
  readonly definition: ToolDefinition = {
    name: 'git_diff',
    description: 'Inspects git diff in the workspace or for a specific file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Optional path of a specific file to diff',
        },
        staged: {
          type: 'boolean',
          description: 'Whether to show staged diff (--staged)',
        },
      },
    },
  };

  protected async run(input: GitDiffInput, context: ToolCallContext): Promise<GitDiffOutput> {
    const cwd = resolveSafePath(context.workspaceRoot, '.');

    const args = ['diff'];
    if (input.staged) {
      args.push('--staged');
    }

    if (input.filePath) {
      const safePath = resolveSafePath(context.workspaceRoot, input.filePath);
      const relPath = getSafeRelativePath(context.workspaceRoot, safePath);
      args.push('--', relPath);
    }

    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf-8',
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });

    if (result.status !== 0) {
      return {
        diff: '',
        filesChanged: 0,
      };
    }

    const diffOutput = result.stdout || '';
    const fileHeaders = diffOutput.match(/^diff --git/gm) || [];

    return {
      diff: diffOutput,
      filesChanged: fileHeaders.length,
    };
  }
}
