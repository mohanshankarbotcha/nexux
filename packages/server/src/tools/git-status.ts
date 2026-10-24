import { spawnSync } from 'node:child_process';
import {
  BaseTool,
} from './base-tool.js';
import {
  GitStatusOutput,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolRiskClass,
  resolveSafePath,
} from '@nexus/core';

export class GitStatusTool extends BaseTool<Record<string, unknown>, GitStatusOutput> {
  readonly name: ToolName = 'git_status';
  override readonly riskClass: ToolRiskClass = 'read';
  override readonly concurrencySafe = true;

  readonly definition: ToolDefinition = {
    name: 'git_status',
    description: 'Inspects current git status (modified, added, deleted, and untracked files).',
    parameters: {
      type: 'object',
      properties: {},
    },
  };

  protected async run(_input: Record<string, unknown>, context: ToolCallContext): Promise<GitStatusOutput> {
    const cwd = resolveSafePath(context.workspaceRoot, '.');

    const result = spawnSync('git', ['status', '--porcelain=v1', '-b'], {
      cwd,
      encoding: 'utf-8',
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });

    if (result.status !== 0) {
      return {
        branch: 'unknown (not a git repo)',
        isClean: true,
        modified: [],
        added: [],
        deleted: [],
        untracked: [],
      };
    }

    const lines = (result.stdout || '').split('\n').filter((l) => l.trim().length > 0);
    let branch = 'unknown';
    const modified: string[] = [];
    const added: string[] = [];
    const deleted: string[] = [];
    const untracked: string[] = [];

    for (const line of lines) {
      if (line.startsWith('## ')) {
        const branchPart = line.slice(3).split('...')[0].trim();
        branch = branchPart;
        continue;
      }

      const statusCode = line.slice(0, 2);
      const filePath = line.slice(3).trim();

      if (statusCode === '??') {
        untracked.push(filePath);
      } else if (statusCode.includes('M')) {
        modified.push(filePath);
      } else if (statusCode.includes('A')) {
        added.push(filePath);
      } else if (statusCode.includes('D')) {
        deleted.push(filePath);
      }
    }

    return {
      branch,
      isClean: modified.length === 0 && added.length === 0 && deleted.length === 0 && untracked.length === 0,
      modified,
      added,
      deleted,
      untracked,
    };
  }
}
