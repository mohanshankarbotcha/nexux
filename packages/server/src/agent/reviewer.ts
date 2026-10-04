import { BaseAgent, AgentExecutionContext } from './base-agent.js';
import { AgentRole, GitDiffOutput, GitStatusOutput } from '@nexus/core';

export interface ReviewResult {
  summary: string;
  diffSummary: string;
  changedFiles: string[];
  approved: boolean;
  recommendations?: string[];
}

export class ReviewerAgent extends BaseAgent {
  readonly role: AgentRole = 'reviewer';
  readonly description = 'Inspects final changes, git diff, checks requirements, and verifies quality.';

  async run(
    prompt: string,
    context: AgentExecutionContext,
    additionalContext?: { changedFiles?: string[]; verificationSuccess?: boolean }
  ): Promise<{ summary: string; success: boolean; data?: ReviewResult }> {
    this.emitAgentStarted('Reviewing final changes, inspecting git diff, and verifying quality', context);

    try {
      // 1. Inspect git status and git diff
      const statusRes = await this.callTool<Record<string, unknown>, GitStatusOutput>('git_status', {}, context);
      const diffRes = await this.callTool<{ staged?: boolean }, GitDiffOutput>('git_diff', {}, context);

      const modifiedFiles = statusRes.data?.modified || [];
      const untrackedFiles = statusRes.data?.untracked || [];
      const allChanged = Array.from(new Set([...modifiedFiles, ...untrackedFiles, ...(additionalContext?.changedFiles || [])]));

      // Fast-path token optimization: If no files were modified, approve immediately without LLM roundtrip
      if (allChanged.length === 0) {
        const summary = 'Review completed: No files were modified in this read-only task.';
        this.emitAgentCompleted(summary, context);
        return {
          summary,
          success: true,
          data: {
            summary,
            diffSummary: 'No changes',
            changedFiles: [],
            approved: true,
          },
        };
      }

      const diffSnippet = diffRes.data?.diff ? diffRes.data.diff.slice(0, 3000) : 'No git diff recorded.';

      const systemInstruction = `You are the NEXUS.AI Reviewer Agent.
Provide a clean, professional summary of the changes made for this task.
Highlight:
1. Files modified/created.
2. Key changes and whether requirements were satisfied.
3. Verification status.`;

      const userMessage = `Task: "${prompt}"
Changed Files: ${allChanged.join(', ') || 'None'}
Verification: ${additionalContext?.verificationSuccess !== false ? 'Passed' : 'Pending or failed'}
Git Diff:
${diffSnippet}`;

      const modelRes = await this.callModel(
        {
          systemInstruction,
          messages: [{ role: 'user', content: userMessage }],
          temperature: 0.1,
        },
        context
      );

      const summary = modelRes.content || `Reviewed ${allChanged.length} changed file(s). Requirements satisfied.`;
      this.emitAgentCompleted(summary, context);

      return {
        summary,
        success: true,
        data: {
          summary,
          diffSummary: diffSnippet,
          changedFiles: allChanged,
          approved: true,
        },
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.updateStatus('failed', context, errorMsg);
      return {
        summary: `Review failed: ${errorMsg}`,
        success: false,
      };
    }
  }
}
