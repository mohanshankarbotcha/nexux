import fs from 'node:fs';
import path from 'node:path';
import { BaseAgent, AgentExecutionContext } from './base-agent.js';
import { AgentRole, TaskPlan, ToolDefinition, resolveSafePath, logger } from '@nexus/core';

export class CoderAgent extends BaseAgent {
  readonly role: AgentRole = 'coder';
  readonly description = 'Executes code changes, file creation, precision edits, and deletion.';

  /**
   * Helper to extract files and code from markdown code blocks if the LLM
   * provided code in prose instead of invoking the tool.
   */
  private extractFilesFromText(text: string): { filePath: string; content: string }[] {
    const results: { filePath: string; content: string }[] = [];
    if (!text) return results;

    // Pattern 1: ### [filename] or **[filename]** or File: [filename] followed by code block
    const blockRegex = /(?:###|\*\*|File:?|Filename:?)\s*`?([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)`?[\s\S]*?```(?:[a-zA-Z0-9_\-]+)?\r?\n([\s\S]*?)```/g;
    let match;
    while ((match = blockRegex.exec(text)) !== null) {
      const filePath = match[1].trim();
      const content = match[2];
      if (filePath && !filePath.includes(' ') && !results.some((r) => r.filePath === filePath)) {
        results.push({ filePath, content });
      }
    }

    // Pattern 2: ```lang <!-- filename.ext --> or // filename.ext
    const commentRegex = /```(?:[a-zA-Z0-9_\-]+)?\r?\n(?:\/\/|<!--|#|\/\*)\s*([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)[\s\S]*?\r?\n([\s\S]*?)```/g;
    while ((match = commentRegex.exec(text)) !== null) {
      const filePath = match[1].trim();
      const content = match[2];
      if (filePath && !filePath.includes(' ') && !results.some((r) => r.filePath === filePath)) {
        results.push({ filePath, content });
      }
    }

    return results;
  }

  async run(
    prompt: string,
    context: AgentExecutionContext,
    additionalContext?: { plan?: TaskPlan; relevantFiles?: string[] }
  ): Promise<{ summary: string; success: boolean; data?: { changedFiles: string[] } }> {
    this.emitAgentStarted('Executing code modifications and implementing changes', context);

    const changedFiles = new Set<string>();
    const planSteps = additionalContext?.plan?.steps?.map((s) => s.description).join('\n- ') || prompt;

    const availableToolDefs = this.toolRegistry.getAllDefinitions().filter((t) =>
      ['read_file', 'write_file', 'edit_file', 'delete_file', 'list_files', 'terminal'].includes(t.name)
    );

    const systemInstruction = `You are the NEXUS.AI Coder Agent, an autonomous senior software engineer.
Your responsibility is to implement the requested changes and build the requested application in the workspace.
MANDATORY OPERATIONAL DIRECTIVES:
1. REAL WORK ONLY: You MUST invoke tools to create, modify, and verify files on disk. Do NOT simply write markdown code or plans in text!
2. FILE CREATION: Use \`write_file\` to write complete, working code for all required files. If overwriting, pass overwrite: true.
3. INSPECTION & EDITS: Use \`read_file\` to examine existing files, and \`edit_file\` for targeted updates.
4. RUNTIME VERIFICATION: Use \`terminal\` to initialize packages, run builds, or verify changes if needed.
5. COMPLETE APPLICATION: If asked to build an application (e.g. calculator, web app, tool), create all required HTML, CSS, JavaScript, or other source files.`;

    const userMessage = `Task: "${prompt}"
Implementation Plan:
- ${planSteps}

Please proceed to write and implement all required code files to disk using the provided tools.`;

    try {
      let messages: any[] = [{ role: 'user', content: userMessage }];
      let turn = 0;
      let finalSummary = '';
      const maxTurns = 10;

      while (turn < maxTurns) {
        turn++;
        if (context.abortSignal?.aborted) {
          throw new Error('Task was cancelled');
        }

        const modelRes = await this.callModel(
          {
            systemInstruction,
            messages,
            tools: availableToolDefs,
            temperature: 0.15,
          },
          context
        );

        if (modelRes.content) {
          this.emitAgentMessage(modelRes.content, context);
          finalSummary = modelRes.content;
        }

        // Check if tool calls were made
        const hasToolCalls = Boolean(modelRes.toolCalls && modelRes.toolCalls.length > 0);

        if (!hasToolCalls) {
          // If no tool calls were made, check if model included code blocks in text
          const extractedFiles = this.extractFilesFromText(modelRes.content);
          if (extractedFiles.length > 0) {
            logger.info(`CoderAgent: Found ${extractedFiles.length} file(s) in markdown text, writing to disk`);
            for (const file of extractedFiles) {
              const writeRes = await this.callTool(
                'write_file',
                { filePath: file.filePath, content: file.content, overwrite: true },
                context
              );
              if (writeRes.success) {
                changedFiles.add(file.filePath);
              }
            }
            break;
          }

          // If turn 1 returned no tool calls and no files have been created yet, give model another chance
          if (turn === 1 && changedFiles.size === 0) {
            messages.push({ role: 'assistant', content: modelRes.content || '' });
            messages.push({
              role: 'user',
              content:
                'CRITICAL: You did not invoke any tools to write the files to disk. You MUST call the `write_file` tool now with filePath and content to write the source files.',
            });
            continue;
          }

          // No tool calls and nothing else to process
          break;
        }

        // Append assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: modelRes.content || '',
          toolCalls: modelRes.toolCalls!.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          })),
        });

        // Execute each tool call
        for (const tc of modelRes.toolCalls!) {
          if (context.abortSignal?.aborted) {
            throw new Error('Task was cancelled');
          }

          const toolRes = await this.callTool(tc.name as any, tc.arguments, context);

          if (['write_file', 'edit_file', 'delete_file'].includes(tc.name) && toolRes.success) {
            const filePath = (toolRes.data as any)?.filePath || (tc.arguments as any)?.filePath;
            if (filePath) changedFiles.add(filePath);
          }

          // Format tool response safely for both OpenAI and Gemini formats
          let toolContentObj = toolRes.success ? toolRes.data : { error: toolRes.error };
          if (typeof toolContentObj !== 'object' || toolContentObj === null) {
            toolContentObj = { result: toolContentObj };
          }

          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: JSON.stringify(toolContentObj),
          });
        }
      }

      // Physical disk verification of changed files
      const verifiedFiles: string[] = [];
      for (const f of changedFiles) {
        try {
          const safePath = resolveSafePath(context.workspaceRoot, f);
          if (fs.existsSync(safePath)) {
            verifiedFiles.push(f);
          }
        } catch {
          // File path outside or unverified
        }
      }

      // Check if this was a modification/build request that produced no verified files
      const lowerPrompt = prompt.toLowerCase();
      const isCreateRequest =
        lowerPrompt.includes('build') ||
        lowerPrompt.includes('create') ||
        lowerPrompt.includes('make') ||
        lowerPrompt.includes('add') ||
        lowerPrompt.includes('calculator') ||
        lowerPrompt.includes('implement');

      if (isCreateRequest && verifiedFiles.length === 0) {
        const errorMsg = 'Coder finished without creating or modifying any workspace files on disk.';
        this.updateStatus('failed', context, errorMsg);
        return {
          summary: errorMsg,
          success: false,
          data: { changedFiles: [] },
        };
      }

      const summary =
        finalSummary ||
        `Implemented changes across ${verifiedFiles.length} file(s): ${verifiedFiles.join(', ')}`;
      this.emitAgentCompleted(summary, context);

      return {
        summary,
        success: true,
        data: { changedFiles: verifiedFiles },
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.updateStatus('failed', context, errorMsg);
      return {
        summary: `Implementation failed: ${errorMsg}`,
        success: false,
      };
    }
  }
}
