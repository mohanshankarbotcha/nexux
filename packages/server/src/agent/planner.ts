import { BaseAgent, AgentExecutionContext } from './base-agent.js';
import { AgentRole, TaskPlan, TaskPlanStep } from '@nexus/core';
import { ExplorationResult } from './explorer.js';

export class PlannerAgent extends BaseAgent {
  readonly role: AgentRole = 'planner';
  readonly description = 'Constructs an actionable step-by-step implementation and verification plan.';

  async run(
    prompt: string,
    context: AgentExecutionContext,
    additionalContext?: { exploration?: ExplorationResult }
  ): Promise<{ summary: string; success: boolean; data?: TaskPlan }> {
    this.emitAgentStarted('Constructing implementation plan and verification steps', context);

    try {
      const explorationSummary = additionalContext?.exploration?.summary || 'No prior exploration provided.';
      const relevantFiles = additionalContext?.exploration?.relevantFiles?.join(', ') || 'None identified yet.';

      const systemInstruction = `You are the NEXUS.AI Planner Agent.
Create a concise, actionable plan for this coding task.
Format your output as JSON with this exact structure:
{
  "summary": "Short 1-2 sentence plan overview",
  "steps": [
    { "id": "step-1", "description": "What to change", "targetFiles": ["path/to/file"], "verificationCommand": "optional test command" }
  ],
  "risks": ["Potential edge case or risk"]
}`;

      const userMessage = `Task: "${prompt}"
Exploration findings: ${explorationSummary}
Candidate files: ${relevantFiles}`;

      const modelRes = await this.callModel(
        {
          systemInstruction,
          messages: [{ role: 'user', content: userMessage }],
          temperature: 0.1,
        },
        context
      );

      let plan: TaskPlan;
      try {
        const jsonMatch = modelRes.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          plan = {
            summary: parsed.summary || 'Implementation plan',
            steps: parsed.steps?.map((s: any, idx: number) => ({
              id: s.id || `step-${idx + 1}`,
              description: s.description || 'Modify file',
              targetFiles: s.targetFiles || [],
              status: 'pending',
              verificationCommand: s.verificationCommand,
            })) || [],
            risks: parsed.risks || [],
            createdAt: Date.now(),
          };
        } else {
          throw new Error('No JSON structure found in planner output');
        }
      } catch {
        // Fallback default structured plan
        plan = {
          summary: `Implementation plan for: ${prompt.slice(0, 80)}`,
          steps: [
            {
              id: 'step-1',
              description: `Implement required changes for: ${prompt}`,
              status: 'pending',
            },
            {
              id: 'step-2',
              description: 'Run project tests and verify correctness',
              status: 'pending',
              verificationCommand: 'npm test',
            },
          ],
          risks: [],
          createdAt: Date.now(),
        };
      }

      this.emitAgentCompleted(plan.summary, context);

      return {
        summary: plan.summary,
        success: true,
        data: plan,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.updateStatus('failed', context, errorMsg);
      return {
        summary: `Planning failed: ${errorMsg}`,
        success: false,
      };
    }
  }
}
