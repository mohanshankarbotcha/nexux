import fs from 'node:fs';
import path from 'node:path';
import { BaseAgent, AgentExecutionContext } from './base-agent.js';
import {
  AgentRole,
  Task,
  TaskStatus,
  globalEventBus,
  resolveSafePath,
  logger,
} from '@nexus/core';
import { ExplorerAgent, ExplorationResult } from './explorer.js';
import { PlannerAgent } from './planner.js';
import { CoderAgent } from './coder.js';
import { DebuggerAgent } from './debugger.js';
import { ReviewerAgent } from './reviewer.js';
import { StorageEngine, globalStorage } from '../storage/storage-engine.js';
import { ContextEngine, globalContextEngine, TaskContextPackage } from '../context/context-engine.js';
import { ModelRouter, globalModelRouter } from '../providers/model-router.js';
import { ToolRegistry, globalToolRegistry } from '../tools/tool-registry.js';
import { globalActiveTaskRegistry } from '../tasks/active-task-registry.js';

export interface CoordinatorResult {
  taskId: string;
  status: TaskStatus;
  summary: string;
  changedFiles: string[];
  diff?: string;
  stagesRun: AgentRole[];
  totalDurationMs: number;
  totalTokens?: number;
  totalCostUsd?: number;
}

export class CoordinatorAgent extends BaseAgent {
  readonly role: AgentRole = 'coordinator';
  readonly description = 'Orchestrates the entire coding agent workflow from interpretation to review.';

  private explorer: ExplorerAgent;
  private planner: PlannerAgent;
  private coder: CoderAgent;
  private debuggerAgent: DebuggerAgent;
  private reviewer: ReviewerAgent;
  private contextEngine: ContextEngine;

  constructor(
    explorer = new ExplorerAgent(),
    planner = new PlannerAgent(),
    coder = new CoderAgent(),
    debuggerAgent = new DebuggerAgent(),
    reviewer = new ReviewerAgent(),
    storage = globalStorage,
    eventBus = globalEventBus,
    contextEngine = globalContextEngine,
    toolRegistry = globalToolRegistry,
    modelRouter = globalModelRouter
  ) {
    super(modelRouter, toolRegistry, eventBus, storage);
    this.explorer = explorer;
    this.planner = planner;
    this.coder = coder;
    this.debuggerAgent = debuggerAgent;
    this.reviewer = reviewer;
    this.storage = storage;
    this.contextEngine = contextEngine;
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
      lower.includes('create') ||
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

    this.eventBus.emit({
      id: `evt_${Date.now()}`,
      type: 'task_started',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: startTime,
      prompt,
    });

    this.emitAgentStarted(`Coordinating task: "${prompt}"`, context);

    // Resolve model and provider for task metadata
    const activeRoute = this.modelRouter.getRouteForRole(this.role, {
      provider: context.provider,
      model: context.model,
    });

    let task = this.storage.getTask(context.taskId);
    if (!task) {
      task = {
        id: context.taskId,
        sessionId: context.sessionId,
        prompt,
        status: 'running',
        stage: 'coordinating',
        currentAgentRole: 'coordinator',
        changedFiles: [],
        activeAgents: [this.getState()],
        createdAt: startTime,
        startedAt: startTime,
        updatedAt: startTime,
        providerMetadata: {
          provider: activeRoute.provider.id,
          model: activeRoute.model,
          plannerModel: activeRoute.model,
          coderModel: activeRoute.model,
          reviewerModel: activeRoute.model,
        },
      };
      this.storage.saveTask(task);
    } else {
      task.status = 'running';
      task.stage = 'coordinating';
      task.currentAgentRole = 'coordinator';
      task.startedAt = task.startedAt || startTime;
      task.updatedAt = startTime;
      task.providerMetadata = {
        provider: activeRoute.provider.id,
        model: activeRoute.model,
        plannerModel: activeRoute.model,
        coderModel: activeRoute.model,
        reviewerModel: activeRoute.model,
      };
      this.storage.saveTask(task);
    }

    // Register with active task registry if not yet registered
    if (!globalActiveTaskRegistry.has(context.taskId)) {
      const abortCtrl = new AbortController();
      if (context.abortSignal) {
        context.abortSignal.addEventListener('abort', () => abortCtrl.abort());
      }
      globalActiveTaskRegistry.register(context.taskId, {
        sessionId: context.sessionId,
        prompt,
        workspaceRoot: context.workspaceRoot,
        abortController: abortCtrl,
        provider: activeRoute.provider.id,
        model: activeRoute.model,
      });
    }

    try {
      globalActiveTaskRegistry.updateStage(context.taskId, 'coordinating', 'coordinator', 'Analyzing task context');

      // Build task context package
      const contextPackage: TaskContextPackage = await this.contextEngine.buildTaskContext(
        context.workspaceRoot,
        prompt,
        context.sessionId,
        context.taskId
      );

      const complexity = this.assessComplexity(prompt);
      logger.info(`Coordinator: task complexity assessed`, { taskId: context.taskId, complexity });

      // Stage 1: Explorer (if needed)
      let exploration: ExplorationResult | undefined = undefined;
      if (complexity.needsExploration) {
        if (context.abortSignal?.aborted) throw new Error('Task cancelled');
        stagesRun.push('explorer');
        globalActiveTaskRegistry.updateStage(context.taskId, 'exploring', 'explorer', 'Exploring workspace repository structure');
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
        globalActiveTaskRegistry.updateStage(context.taskId, 'planning', 'planner', 'Synthesizing implementation plan');
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
      globalActiveTaskRegistry.updateStage(context.taskId, 'coding', 'coder', 'Implementing code and writing files to workspace');
      const coderRes = await this.coder.run(prompt, context, {
        plan,
        relevantFiles: exploration?.relevantFiles || contextPackage.items.map((i) => i.relativePath),
      });

      if (!coderRes.success) {
        throw new Error(coderRes.summary || 'Coding stage failed to implement changes');
      }

      if (coderRes.data?.changedFiles) {
        for (const f of coderRes.data.changedFiles) {
          changedFiles.add(f);
        }
      }

      // Stage 4: Verification (if verification commands exist and are runnable)
      let verificationSuccess = true;
      if (complexity.needsVerification && plan?.steps) {
        globalActiveTaskRegistry.updateStage(context.taskId, 'verifying', 'coordinator', 'Running verification and tests');
        for (const step of plan.steps) {
          if (step.verificationCommand) {
            if (context.abortSignal?.aborted) throw new Error('Task cancelled');

            // Skip 'npm test' if package.json does not exist in workspace to avoid false negatives
            const hasPackageJson = fs.existsSync(resolveSafePath(context.workspaceRoot, 'package.json'));
            if (step.verificationCommand.includes('npm') && !hasPackageJson) {
              logger.debug(`Coordinator: Skipping '${step.verificationCommand}' because package.json is not present`);
              continue;
            }

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
              globalActiveTaskRegistry.updateStage(context.taskId, 'debugging', 'debugger', 'Diagnosing test failure');
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

      // Physical verification of files created on disk
      const verifiedFiles: string[] = [];
      for (const f of changedFiles) {
        try {
          const safePath = resolveSafePath(context.workspaceRoot, f);
          if (fs.existsSync(safePath)) {
            verifiedFiles.push(f);
          }
        } catch {
          // Path outside workspace or invalid
        }
      }

      const lowerPrompt = prompt.toLowerCase();
      const isCreateRequest =
        lowerPrompt.includes('build') ||
        lowerPrompt.includes('create') ||
        lowerPrompt.includes('make') ||
        lowerPrompt.includes('add') ||
        lowerPrompt.includes('calculator') ||
        lowerPrompt.includes('implement');

      if (isCreateRequest && verifiedFiles.length === 0) {
        throw new Error('Task completed without creating any required application files in the workspace.');
      }

      // Stage 6: Reviewer
      if (context.abortSignal?.aborted) throw new Error('Task cancelled');
      stagesRun.push('reviewer');
      globalActiveTaskRegistry.updateStage(context.taskId, 'reviewing', 'reviewer', 'Reviewing diffs and verifying code quality');
      const reviewRes = await this.reviewer.run(prompt, context, {
        changedFiles: verifiedFiles,
        verificationSuccess,
      });

      const totalDurationMs = Date.now() - startTime;
      const finalSummary = reviewRes.summary || coderRes.summary;

      // Calculate total tokens & cost from storage records for this task
      const taskUsage = this.storage.getUsageRecords().filter((u) => u.taskId === context.taskId);
      const totalTokens = taskUsage.reduce((sum, r) => sum + (r.totalTokens || 0), 0);
      const totalCostUsd =
        Math.round(taskUsage.reduce((sum, r) => sum + (r.estimatedCostUsd || 0), 0) * 1_000_000) / 1_000_000;

      // Update task in storage
      task.status = 'completed';
      task.stage = 'completed';
      task.completedAt = Date.now();
      task.resultSummary = finalSummary;
      task.totalTokens = totalTokens;
      task.totalCostUsd = totalCostUsd;
      task.changedFiles = verifiedFiles.map((f) => ({
        filePath: f,
        relativePath: f,
        changeType: 'modified',
        timestamp: Date.now(),
      }));
      this.storage.saveTask(task);

      globalActiveTaskRegistry.complete(context.taskId, finalSummary);
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
        totalTokens,
        totalCostUsd,
      });

      return {
        summary: finalSummary,
        success: true,
        data: {
          taskId: context.taskId,
          status: 'completed',
          summary: finalSummary,
          changedFiles: verifiedFiles,
          diff: reviewRes.data?.diffSummary,
          stagesRun,
          totalDurationMs,
          totalTokens,
          totalCostUsd,
        },
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isCancelled =
        context.abortSignal?.aborted ||
        errorMsg.toLowerCase().includes('cancel') ||
        errorMsg.toLowerCase().includes('aborted');

      const status: TaskStatus = isCancelled ? 'cancelled' : 'failed';
      const stage = isCancelled ? 'cancelled' : 'failed';

      task.status = status;
      task.stage = stage;
      task.error = errorMsg;
      task.completedAt = Date.now();
      this.storage.saveTask(task);

      if (isCancelled) {
        globalActiveTaskRegistry.cancel(context.taskId, errorMsg);
        this.eventBus.emit({
          id: `evt_${Date.now()}`,
          type: 'task_cancelled',
          sessionId: context.sessionId,
          taskId: context.taskId,
          timestamp: Date.now(),
          reason: errorMsg,
        });
      } else {
        globalActiveTaskRegistry.fail(context.taskId, errorMsg);
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
