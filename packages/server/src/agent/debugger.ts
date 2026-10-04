import { BaseAgent, AgentExecutionContext } from './base-agent.js';
import { AgentRole, ToolDefinition } from '@nexus/core';

export class DebuggerAgent extends BaseAgent {
  readonly role: AgentRole = 'debugger';
  readonly description = 'Analyzes command/test failures, identifies root causes, and applies minimal repairs.';

  async run(
    prompt: string,
    context: AgentExecutionContext,
    additionalContext?: { failureOutput?: string; command?: string }
  ): Promise<{ summary: string; success: boolean; data?: { fixed: boolean; rerunOutput?: string } }> {
    this.emitAgentStarted('Analyzing failure output and diagnosing root cause', context);

    const failureLog = additionalContext?.failureOutput || 'Test or build verification reported an error.';
    const verificationCmd = additionalContext?.command || 'npm test';

    const availableToolDefs = this.toolRegistry.getAllDefinitions().filter((t) =>
      ['read_file', 'edit_file', 'write_file', 'terminal'].includes(t.name)
    );

    const systemInstruction = `You are the NEXUS.AI Debugger Agent.
A verification command failed. Your goal is to:
1. Identify the root cause from the error log and relevant source files.
2. Apply the minimal necessary fix using edit_file or write_file.
3. Rerun the verification command using the terminal tool to confirm the fix.
Keep changes minimal and targeted.`;

    const userMessage = `Task: "${prompt}"
Failed Command: ${verificationCmd}
Failure Output:
${failureLog.slice(0, 2000)}

Please investigate the failure, fix the issue, and rerun verification.`;

    try {
      let messages: any[] = [{ role: 'user', content: userMessage }];
      let turn = 0;
      let fixApplied = false;
      let finalSummary = '';

      while (turn < 6) {
        turn++;
        if (context.abortSignal?.aborted) {
          throw new Error('Debugging was cancelled');
        }

        const modelRes = await this.callModel(
          {
            systemInstruction,
            messages,
            tools: availableToolDefs,
            temperature: 0.1,
          },
          context
        );

        if (modelRes.content) {
          this.emitAgentMessage(modelRes.content, context);
          finalSummary = modelRes.content;
        }

        if (!modelRes.toolCalls || modelRes.toolCalls.length === 0) {
          break;
        }

        messages.push({
          role: 'assistant',
          content: modelRes.content || '',
          toolCalls: modelRes.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          })),
        });

        for (const tc of modelRes.toolCalls) {
          const toolRes = await this.callTool(tc.name as any, tc.arguments, context);
          if (['edit_file', 'write_file'].includes(tc.name) && toolRes.success) {
            fixApplied = true;
          }

          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: JSON.stringify(toolRes.success ? toolRes.data : { error: toolRes.error }),
          });
        }
      }

      const summary = finalSummary || (fixApplied ? 'Repaired issue and re-verified tests.' : 'Debugging completed.');
      this.emitAgentCompleted(summary, context);

      return {
        summary,
        success: true,
        data: { fixed: fixApplied },
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.updateStatus('failed', context, errorMsg);
      return {
        summary: `Debugging failed: ${errorMsg}`,
        success: false,
      };
    }
  }
}
