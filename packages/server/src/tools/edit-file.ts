import fs from 'node:fs';
import {
  BaseTool,
} from './base-tool.js';
import {
  EditFileInput,
  EditFileOutput,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolExecutionError,
  resolveSafePath,
  getSafeRelativePath,
  globalEventBus,
  AgentRole,
} from '@nexus/core';

export class EditFileTool extends BaseTool<EditFileInput, EditFileOutput> {
  readonly name: ToolName = 'edit_file';
  readonly definition: ToolDefinition = {
    name: 'edit_file',
    description: 'Replaces specific existing content in a file with new content. Preserves formatting.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path of the file to edit',
        },
        targetContent: {
          type: 'string',
          description: 'The exact string snippet currently in the file to be replaced',
        },
        replacementContent: {
          type: 'string',
          description: 'The replacement string content to insert',
        },
        replaceAll: {
          type: 'boolean',
          description: 'If true, replaces all occurrences. Default is false (single replacement).',
        },
      },
      required: ['filePath', 'targetContent', 'replacementContent'],
    },
  };

  protected async run(input: EditFileInput, context: ToolCallContext): Promise<EditFileOutput> {
    if (!input.filePath) {
      throw new ToolExecutionError(this.name, 'filePath is required');
    }
    if (input.targetContent === undefined || input.targetContent === null) {
      throw new ToolExecutionError(this.name, 'targetContent is required');
    }
    if (input.replacementContent === undefined || input.replacementContent === null) {
      throw new ToolExecutionError(this.name, 'replacementContent is required');
    }

    const safePath = resolveSafePath(context.workspaceRoot, input.filePath);
    const relPath = getSafeRelativePath(context.workspaceRoot, safePath);

    if (!fs.existsSync(safePath)) {
      throw new ToolExecutionError(this.name, `File not found: '${relPath}'`);
    }

    const originalContent = fs.readFileSync(safePath, 'utf-8');

    if (!originalContent.includes(input.targetContent)) {
      throw new ToolExecutionError(
        this.name,
        `targetContent was not found in '${relPath}'. Please verify the exact lines and spacing.`
      );
    }

    let updatedContent: string;
    let count = 0;

    if (input.replaceAll) {
      const parts = originalContent.split(input.targetContent);
      count = parts.length - 1;
      updatedContent = parts.join(input.replacementContent);
    } else {
      updatedContent = originalContent.replace(input.targetContent, input.replacementContent);
      count = 1;
    }

    fs.writeFileSync(safePath, updatedContent, 'utf-8');

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
        changeType: 'modified',
        timestamp: Date.now(),
      },
    });

    return {
      filePath: relPath,
      replacementsApplied: count,
    };
  }
}
