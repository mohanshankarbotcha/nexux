import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  BaseTool,
} from './base-tool.js';
import {
  EditFileInput,
  EditFileOutput,
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

export class EditFileTool extends BaseTool<EditFileInput, EditFileOutput> {
  readonly name: ToolName = 'edit_file';
  override readonly riskClass: ToolRiskClass = 'write';
  override readonly concurrencySafe = false;

  readonly definition: ToolDefinition = {
    name: 'edit_file',
    description: 'Replaces specific existing content in a file with new content. Enforces exact matching, file hash preconditions, and automatic snapshots.',
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
          description: 'If true, replaces all occurrences. Default is false (requires unique match).',
        },
        expectedHash: {
          type: 'string',
          description: 'Optional sha256 hash of the file when read, to guarantee no concurrent or stale edits',
        },
      },
      required: ['filePath', 'targetContent', 'replacementContent'],
    },
  };

  protected async run(input: EditFileInput, context: ToolCallContext): Promise<EditFileOutput> {
    if (!input.filePath || typeof input.filePath !== 'string') {
      throw new ToolExecutionError(this.name, 'filePath is required');
    }
    if (input.targetContent === undefined || input.targetContent === null) {
      throw new ToolExecutionError(this.name, 'targetContent is required');
    }
    if (input.replacementContent === undefined || input.replacementContent === null) {
      throw new ToolExecutionError(this.name, 'replacementContent is required');
    }

    const safePath = resolveSafePath(context.workspaceRoot, input.filePath, {
      checkProtected: true,
      allowAppRepoMutation: context.allowAppRepoMutation,
    });
    const relPath = getSafeRelativePath(context.workspaceRoot, safePath);

    if (!fs.existsSync(safePath)) {
      throw new ToolExecutionError(this.name, `File not found: '${relPath}'`);
    }

    const originalContent = fs.readFileSync(safePath, 'utf-8');
    const currentHash = crypto.createHash('sha256').update(originalContent, 'utf-8').digest('hex');

    // Rule R6: File-hash precondition check
    if (input.expectedHash && input.expectedHash.toLowerCase() !== currentHash.toLowerCase()) {
      throw new ToolExecutionError(
        this.name,
        `STALE_FILE_PRECONDITION: File '${relPath}' has changed since last read (expected sha256 '${input.expectedHash}', current '${currentHash}'). Read the file again before editing.`
      );
    }

    const hasCRLF = originalContent.includes('\r\n');
    let target = input.targetContent;
    let replacement = input.replacementContent;

    if (!originalContent.includes(target)) {
      // Normalize line endings to match file's convention
      if (hasCRLF && !target.includes('\r\n')) {
        target = target.replace(/\r?\n/g, '\r\n');
        replacement = replacement.replace(/\r?\n/g, '\r\n');
      } else if (!hasCRLF && target.includes('\r\n')) {
        target = target.replace(/\r\n/g, '\n');
        replacement = replacement.replace(/\r\n/g, '\n');
      }
    }

    // Exact match verification: fail on 0 matches or >1 matches without replaceAll
    const parts = originalContent.split(target);
    const matchCount = parts.length - 1;

    if (matchCount === 0) {
      throw new ToolExecutionError(
        this.name,
        `targetContent was not found in '${relPath}'. Please verify exact characters, indentation, and spacing.`
      );
    }

    if (matchCount > 1 && !input.replaceAll) {
      throw new ToolExecutionError(
        this.name,
        `targetContent matches ${matchCount} locations in '${relPath}'. Include more surrounding lines to create a unique match, or specify 'replaceAll: true'.`
      );
    }

    // Rule R6: Create snapshot checkpoint before first modification
    let checkpointCreated = false;
    let checkpointPath: string | undefined;
    if (context.taskId) {
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

    const updatedContent = input.replaceAll
      ? parts.join(replacement)
      : originalContent.replace(target, replacement);

    fs.writeFileSync(safePath, updatedContent, 'utf-8');
    globalFileCache.invalidate(safePath);

    const newHash = crypto.createHash('sha256').update(updatedContent, 'utf-8').digest('hex');

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
        changeType: 'modified',
        timestamp: Date.now(),
      },
    });

    return {
      filePath: relPath,
      replacementsApplied: matchCount,
      previousHash: currentHash,
      newHash,
      checkpointCreated,
      checkpointPath,
    };
  }
}
