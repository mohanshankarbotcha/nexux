import { BaseAgent, AgentExecutionContext } from './base-agent.js';
import {
  AgentRole,
  Task,
  TaskStatus,
  globalEventBus,
  logger,
} from '@nexus/core';
import { ExplorerAgent, ExplorationResult } from './explorer.js';
import { PlannerAgent } from './planner.js';
import { CoderAgent } from './coder.js';
import { DebuggerAgent } from './debugger.js';
import { ReviewerAgent } from './reviewer.js';
import { StorageEngine, globalStorage } from '../storage/storage-engine.js';

export interface CoordinatorResult {
  taskId: string;
  status: TaskStatus;
  summary: string;
  changedFiles: string[];
  stagesRun: AgentRole[];
  totalDurationMs: number;
}

export class CoordinatorAgent extends BaseAgent {
  readonly role: AgentRole = 'coordinator';
  readonly description = 'Orchestrates the entire coding agent workflow from interpretation to review.';

  private explorer: ExplorerAgent;
  private planner: PlannerAgent;
  private coder: CoderAgent;
  private debuggerAgent: DebuggerAgent;
  private reviewer: ReviewerAgent;

  constructor(
    explorer = new ExplorerAgent(),
    planner = new PlannerAgent(),
    coder = new CoderAgent(),
    debuggerAgent = new DebuggerAgent(),
    reviewer = new ReviewerAgent(),
    storage = globalStorage,
    eventBus = globalEventBus
  ) {
    super(undefined, undefined, eventBus, storage);
    this.explorer = explorer;
    this.planner = planner;
    this.coder = coder;
    this.debuggerAgent = debuggerAgent;
    this.reviewer = reviewer;
    this.storage = storage;
  }

  /**
   * Assesses whether a task requires deep exploration and planning or can be directly implemented.
   */
  private assessComplexity(prompt: string): {
    needsExploration: boolean;
    needsPlanning: boolean;
    needsVerification: boolean;
  } {
    const lower = prompt.toLowerCase();
    const isDirectSimple =
      lower.startsWith('read ') ||
      lower.startsWith('explain ') ||
      lower.startsWith('show ') ||
      lower.length < 35;

    const isComplex =
      lower.includes('refactor') ||
      lower.includes('architecture') ||
      lower.includes('feature') ||
      lower.includes('test') ||
      lower.includes('build') ||
      lower.includes('multiple') ||
      prompt.length > 100;

    return {
      needsExploration: !isDirectSimple,
      needsPlanning: isComplex,
      needsVerification: !isDirectSimple,
    };
  }

  async run(
    prompt: string,
    context: AgentExecutionContext
  ): Promise<{ summary: string; success: boolean; data?: CoordinatorResult }> {
    const startTime = Date.now();
    const stagesRun: AgentRole[] = [this.role];
    const changedFiles = new Set<string>();

    this.emitAgentStarted(`Coordinating task: "${prompt}"`, context);

    // Load or create task record in storage
    let task = this.storage.getTask(context.taskId);
    if (!task) {
      task = {
        id: context.taskId,
        sessionId: context.sessionId,
        prompt,
        status: 'running',
        changedFiles: [],
        activeAgents: [this.getState()],
        createdAt: startTime,
      };
      this.storage.saveTask(task);
    } else {
      task.status = 'running';
      this.storage.saveTask(task);
    }

    try {
      const complexity = this.assessComplexity(prompt);
      logger.info(`Coordinator: task complexity assessed`, { taskId: context.taskId, complexity });

      // Stage 1: Explorer (if needed)
      let exploration: ExplorationResult | undefined = undefined;
      if (complexity.needsExploration) {
        if (context.abortSignal?.aborted) throw new Error('Task cancelled');
        stagesRun.push('explorer');
        const expRes = await this.explorer.run(prompt, context);
        if (expRes.success && expRes.data) {
          exploration = expRes.data;
        }
      }

      // Stage 2: Planner (if needed)
      let plan = task.plan;
      if (complexity.needsPlanning) {
        if (context.abortSignal?.aborted) throw new Error('Task cancelled');
        stagesRun.push('planner');
        const planRes = await this.planner.run(prompt, context, { exploration });
        if (planRes.success && planRes.data) {
          plan = planRes.data;
          task.plan = plan;
          this.storage.saveTask(task);
        }
      }

      // Stage 3: Coder
      if (context.abortSignal?.aborted) throw new Error('Task cancelled');
      stagesRun.push('coder');
      const coderRes = await this.coder.run(prompt, context, {
        plan,
        relevantFiles: exploration?.relevantFiles,
      });

      if (coderRes.data?.changedFiles) {
        for (const f of coderRes.data.changedFiles) {
          changedFiles.add(f);
        }
      }

      // Stage 4: Verification (if verification commands exist or requested)
      let verificationSuccess = true;
      if (complexity.needsVerification && plan?.steps) {
        for (const step of plan.steps) {
          if (step.verificationCommand) {
            if (context.abortSignal?.aborted) throw new Error('Task cancelled');

            const cmdRes = await this.callTool<{ command: string }, any>(
              'terminal',
              { command: step.verificationCommand },
              context
            );

            if (!cmdRes.success || cmdRes.data?.exitCode !== 0) {
              verificationSuccess = false;
              globalEventBus.emit({
                id: `evt_${Date.now()}`,
                type: 'test_failed',
                sessionId: context.sessionId,
                taskId: context.taskId,
                timestamp: Date.now(),
                command: step.verificationCommand,
                failureSummary: cmdRes.data?.stderr || cmdRes.data?.stdout || 'Non-zero exit code',
              });

              // Stage 5: Debugger (triggered on failure)
              stagesRun.push('debugger');
              const debugRes = await this.debuggerAgent.run(prompt, context, {
                failureOutput: cmdRes.data?.stderr || cmdRes.data?.stdout,
                command: step.verificationCommand,
              });
              if (debugRes.data?.fixed) {
                verificationSuccess = true;
              }
            }
          }
        }
      }

      // Stage 6: Reviewer
      if (context.abortSignal?.aborted) throw new Error('Task cancelled');
      stagesRun.push('reviewer');
      const reviewRes = await this.reviewer.run(prompt, context, {
        changedFiles: Array.from(changedFiles),
        verificationSuccess,
      });

      const totalDurationMs = Date.now() - startTime;
      const finalSummary = reviewRes.summary || coderRes.summary;

      // Update task in storage
      task.status = 'completed';
      task.completedAt = Date.now();
      task.resultSummary = finalSummary;
      task.changedFiles = Array.from(changedFiles).map((f) => ({
        filePath: f,
        relativePath: f,
        changeType: 'modified',
        timestamp: Date.now(),
      }));
      this.storage.saveTask(task);

      this.emitAgentCompleted(finalSummary, context);

      this.eventBus.emit({
        id: `evt_${Date.now()}`,
        type: 'task_completed',
        sessionId: context.sessionId,
        taskId: context.taskId,
        timestamp: Date.now(),
        status: 'completed',
        summary: finalSummary,
        totalDurationMs,
      });

      return {
        summary: finalSummary,
        success: true,
        data: {
          taskId: context.taskId,
          status: 'completed',
          summary: finalSummary,
          changedFiles: Array.from(changedFiles),
          stagesRun,
          totalDurationMs,
        },
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isCancelled = errorMsg.includes('cancelled');
      const status: TaskStatus = isCancelled ? 'cancelled' : 'failed';

      task.status = status;
      task.error = errorMsg;
      task.completedAt = Date.now();
      this.storage.saveTask(task);

      if (isCancelled) {
        this.eventBus.emit({
          id: `evt_${Date.now()}`,
          type: 'task_cancelled',
          sessionId: context.sessionId,
          taskId: context.taskId,
          timestamp: Date.now(),
          reason: errorMsg,
        });
      } else {
        this.eventBus.emit({
          id: `evt_${Date.now()}`,
          type: 'task_failed',
          sessionId: context.sessionId,
          taskId: context.taskId,
          timestamp: Date.now(),
          error: errorMsg,
        });
      }

      this.updateStatus('failed', context, errorMsg);

      return {
        summary: `Coordinator failed: ${errorMsg}`,
        success: false,
        data: {
          taskId: context.taskId,
          status,
          summary: errorMsg,
          changedFiles: Array.from(changedFiles),
          stagesRun,
          totalDurationMs: Date.now() - startTime,
        },
      };
    }
  }
}

export const globalCoordinator = new CoordinatorAgent();
