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
  ToolRiskClass,
  resolveSafePath,
  getSafeRelativePath,
} from '@nexus/core';

export class GitDiffTool extends BaseTool<GitDiffInput, GitDiffOutput> {
  readonly name: ToolName = 'git_diff';
  override readonly riskClass: ToolRiskClass = 'read';
  override readonly concurrencySafe = true;

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

    const diff = result.stdout || '';
    // Count files changed by counting diff --git occurrences
    const matches = diff.match(/^diff --git/gm);
    const filesChanged = matches ? matches.length : 0;

    return {
      diff,
      filesChanged,
    };
  }
}
