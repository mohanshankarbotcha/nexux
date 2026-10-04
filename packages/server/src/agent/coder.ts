import { BaseAgent, AgentExecutionContext } from './base-agent.js';
import { AgentRole, TaskPlan, ToolDefinition } from '@nexus/core';

export class CoderAgent extends BaseAgent {
  readonly role: AgentRole = 'coder';
  readonly description = 'Executes code changes, file creation, precision edits, and deletion.';

  async run(
    prompt: string,
    context: AgentExecutionContext,
    additionalContext?: { plan?: TaskPlan; relevantFiles?: string[] }
  ): Promise<{ summary: string; success: boolean; data?: { changedFiles: string[] } }> {
    this.emitAgentStarted('Executing code modifications and implementing changes', context);

    const changedFiles = new Set<string>();
    const planSteps = additionalContext?.plan?.steps?.map((s) => s.description).join('\n- ') || prompt;

    const availableToolDefs = this.toolRegistry.getAllDefinitions().filter((t) =>
      ['read_file', 'write_file', 'edit_file', 'delete_file'].includes(t.name)
    );

    const systemInstruction = `You are the NEXUS.AI Coder Agent.
Your responsibility is to implement the requested changes precisely.
Use the provided tools (read_file, write_file, edit_file, delete_file) to inspect existing code and make changes.
Preserve existing conventions, types, and formatting.
Always read a file before editing it if you are not certain of its exact content.`;

    const userMessage = `Task: "${prompt}"
Implementation Plan:
- ${planSteps}

Please proceed to inspect and implement the required code changes.`;

    try {
      // Agent tool calling loop (max 8 turns for safety)
      let messages: any[] = [{ role: 'user', content: userMessage }];
      let turn = 0;
      let finalSummary = '';

      while (turn < 8) {
        turn++;
        if (context.abortSignal?.aborted) {
          throw new Error('Task was cancelled');
        }

        const modelRes = await this.callModel(
          {
            systemInstruction,
            messages,
            tools: availableToolDefs,
            temperature: 0.2,
          },
          context
        );

        if (modelRes.content) {
          this.emitAgentMessage(modelRes.content, context);
          finalSummary = modelRes.content;
        }

        // If no tool calls, coder is done
        if (!modelRes.toolCalls || modelRes.toolCalls.length === 0) {
          break;
        }

        // Append assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: modelRes.content || '',
          toolCalls: modelRes.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          })),
        });

        // Execute each tool call
        for (const tc of modelRes.toolCalls) {
          const toolRes = await this.callTool(tc.name as any, tc.arguments, context);

          if (['write_file', 'edit_file', 'delete_file'].includes(tc.name) && toolRes.success) {
            const filePath = (toolRes.data as any)?.filePath || (tc.arguments as any)?.filePath;
            if (filePath) changedFiles.add(filePath);
          }

          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: JSON.stringify(toolRes.success ? toolRes.data : { error: toolRes.error }),
          });
        }
      }

      const summary =
        finalSummary || `Implemented changes across ${changedFiles.size} file(s): ${Array.from(changedFiles).join(', ')}`;
      this.emitAgentCompleted(summary, context);

      return {
        summary,
        success: true,
        data: { changedFiles: Array.from(changedFiles) },
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
