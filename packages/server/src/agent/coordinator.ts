import fs from 'node:fs';
import path from 'node:path';
import { BaseAgent, AgentExecutionContext } from './base-agent.js';
import {
  AgentRole,
  Task,
  TaskStatus,
  ROUTE_BUDGETS,
  globalEventBus,
  resolveSafePath,
  logger,
  sanitizeErrorMessage,
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
import { globalTracer } from '../tracing/tracer.js';
import { globalRequestRouter } from './request-router.js';
import { globalFastPaths, FastPathContext } from './fast-paths.js';
import { globalEngineeringSupervisor } from './supervisor.js';
import { globalConversationManager, globalWorkingSetManager, globalContextPackBuilder } from '../context/index.js';

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
    const effectiveRouter =
      modelRouter !== globalModelRouter
        ? modelRouter
        : (explorer as any)?.modelRouter || globalModelRouter;
    const effectiveTools =
      toolRegistry !== globalToolRegistry
        ? toolRegistry
        : (explorer as any)?.toolRegistry || globalToolRegistry;
    super(effectiveRouter, effectiveTools, eventBus, storage);
    this.explorer = explorer;
    this.planner = planner;
    this.coder = coder;
    this.debuggerAgent = debuggerAgent;
    this.reviewer = reviewer;
    this.storage = storage;
    this.contextEngine = contextEngine;
  }

  private isConversationalGreeting(prompt: string): boolean {
    const trimmed = prompt.trim().toLowerCase();
    const conversational = [
      'hi', 'hello', 'hey', 'hiii', 'hiya', 'greetings', 'good morning',
      'good afternoon', 'good evening', 'who are you', 'what are you',
      'what can you do', 'help', 'thanks', 'thank you', 'how are you'
    ];
    if (conversational.includes(trimmed)) return true;
    if (trimmed.length < 30 && conversational.some((c) => trimmed.startsWith(c) || trimmed.endsWith(c))) {
      const codeKeywords = ['code', 'build', 'create', 'write', 'fix', 'debug', 'test', 'file', 'script', 'function', 'app'];
      return !codeKeywords.some((k) => trimmed.includes(k));
    }
    return false;
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
        timeoutMs: ROUTE_BUDGETS.S4.timeoutMs,
      });
    }

    try {
      if (context.abortSignal?.aborted) {
        throw new Error('Task cancelled');
      }

      // Record conversation turn (Prompt 05)
      globalConversationManager.addTurn(context.sessionId, { role: 'user', content: prompt });

      // Request Router Decision & Fast Paths (Prompt 03 S1 / S2)
      const routeDecision = await globalRequestRouter.route(prompt, context.workspaceRoot, {
        provider: activeRoute.provider.id,
        model: activeRoute.model,
        sessionId: context.sessionId,
      });

    this.eventBus.emit({
      id: `evt_${Date.now()}`,
      type: 'route_chosen',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: Date.now(),
      decision: routeDecision,
    } as any);

    const fastContext: FastPathContext = {
      workspaceRoot: context.workspaceRoot,
      sessionId: context.sessionId,
      taskId: context.taskId,
      provider: activeRoute.provider.id,
      model: activeRoute.model,
      abortSignal: context.abortSignal,
    };

    if (routeDecision.profile === 'S1') {
      task.taskType = 'chat';
      task.status = 'running';
      task.stage = 'chatting';
      this.storage.saveTask(task);
      globalActiveTaskRegistry.updateStage(context.taskId, 'chatting', 'coordinator', routeDecision.reason);

      const s1Span = globalTracer.startSpan(context.taskId, 'Direct S1 Response', 'model_request', {
        provider: activeRoute.provider.id,
        model: activeRoute.model,
      });

      try {
        const reply = await globalFastPaths.executeS1(task, fastContext, routeDecision);
        s1Span.end();
        globalConversationManager.addTurn(context.sessionId, { role: 'assistant', content: reply });
        globalActiveTaskRegistry.complete(context.taskId, reply);
        this.emitAgentCompleted(reply, context);
        return {
          summary: reply,
          success: true,
          data: {
            taskId: context.taskId,
            status: 'completed',
            summary: reply,
            changedFiles: [],
            stagesRun: ['coordinator'],
            totalDurationMs: Date.now() - startTime,
            totalTokens: 0,
          },
        };
      } catch (err: any) {
        s1Span.end({ error: err.message });
        logger.error('S1 Fast-path failed:', err);
      }
    }

    if (routeDecision.profile === 'S2') {
      task.taskType = 'work';
      task.status = 'running';
      task.stage = 'inspecting';
      this.storage.saveTask(task);
      globalActiveTaskRegistry.updateStage(context.taskId, 'inspecting', 'coder', routeDecision.reason);

      const s2Span = globalTracer.startSpan(context.taskId, 'S2 Read-Only Fast Path', 'tool', {
        provider: activeRoute.provider.id,
        model: activeRoute.model,
      });

      try {
        const reply = await globalFastPaths.executeS2(task, fastContext, routeDecision);
        s2Span.end();
        globalConversationManager.addTurn(context.sessionId, { role: 'assistant', content: reply });
        globalActiveTaskRegistry.complete(context.taskId, reply);
        this.emitAgentCompleted(reply, context);
        return {
          summary: reply,
          success: true,
          data: {
            taskId: context.taskId,
            status: 'completed',
            summary: reply,
            changedFiles: [],
            stagesRun: ['coder'],
            totalDurationMs: Date.now() - startTime,
            totalTokens: 0,
          },
        };
      } catch (err: any) {
        s2Span.end({ error: err.message });
        logger.error('S2 Fast-path failed:', err);
      }
    }

    if (routeDecision.profile === 'S5') {
      task.taskType = 'chat';
      task.status = 'completed';
      task.stage = 'completed';
      const question = routeDecision.clarification || 'Could you please clarify your request before proceeding?';
      task.resultSummary = question;
      this.storage.saveTask(task);
      globalConversationManager.addTurn(context.sessionId, { role: 'assistant', content: question });
      globalActiveTaskRegistry.complete(context.taskId, question);

      this.eventBus.emit({
        id: `evt_${Date.now()}`,
        type: 'agent_message',
        sessionId: context.sessionId,
        taskId: context.taskId,
        timestamp: Date.now(),
        agentRole: 'coordinator',
        content: question,
        isStreaming: false,
      });

      this.emitAgentCompleted(question, context);
      return {
        summary: question,
        success: true,
        data: {
          taskId: context.taskId,
          status: 'completed',
          summary: question,
          changedFiles: [],
          stagesRun: ['coordinator'],
          totalDurationMs: Date.now() - startTime,
        },
      };
    }

    if (routeDecision.profile === 'S3' || routeDecision.profile === 'S4') {
      task.taskType = 'work';
      task.status = 'running';
      this.storage.saveTask(task);

      const workflowSpan = globalTracer.startSpan(
        context.taskId,
        `${routeDecision.profile} Engineering Workflow`,
        'verify',
        {
          provider: activeRoute.provider.id,
          model: activeRoute.model,
          metadata: { profile: routeDecision.profile },
        }
      );

      try {
        const finalReport = await globalEngineeringSupervisor.execute(task, routeDecision.profile, {
          workspaceRoot: context.workspaceRoot,
          sessionId: context.sessionId,
          taskId: context.taskId,
          provider: activeRoute.provider.id,
          model: activeRoute.model,
          abortSignal: context.abortSignal,
          modelRouter: this.modelRouter,
          toolRegistry: this.toolRegistry,
          storage: this.storage,
          eventBus: this.eventBus,
        });

        workflowSpan.end();
        globalConversationManager.addTurn(context.sessionId, { role: 'assistant', content: finalReport.summary });
        globalWorkingSetManager.recordChangeSet(context.sessionId, finalReport.changeSet);
        globalActiveTaskRegistry.complete(context.taskId, finalReport.summary);
        this.emitAgentCompleted(finalReport.summary, context);

        const taskUsage = this.storage.getUsageRecords().filter((u) => u.taskId === context.taskId);
        const totalTokens = taskUsage.reduce((sum, r) => sum + (r.totalTokens || 0), 0);
        const totalCostUsd =
          Math.round(taskUsage.reduce((sum, r) => sum + (r.estimatedCostUsd || 0), 0) * 1_000_000) / 1_000_000;

        task.totalTokens = totalTokens;
        task.totalCostUsd = totalCostUsd;
        this.storage.saveTask(task);

        let diff: string | undefined;
        try {
          const diffRes = await this.toolRegistry.execute('git_diff', {}, {
            workspaceRoot: context.workspaceRoot,
            sessionId: context.sessionId,
            taskId: context.taskId,
            agentRole: 'coordinator',
          });
          if (diffRes.success && (diffRes.data as any)?.diff) {
            diff = (diffRes.data as any).diff;
          }
        } catch {}

        return {
          summary: finalReport.summary,
          success: finalReport.status === 'completed',
          data: {
            taskId: context.taskId,
            status: finalReport.status,
            summary: finalReport.summary,
            changedFiles: [
              ...finalReport.changeSet.createdFiles,
              ...finalReport.changeSet.modifiedFiles,
            ],
            diff,
            stagesRun: routeDecision.profile === 'S4'
              ? ['explorer', 'planner', 'coder', 'reviewer']
              : ['planner', 'coder', 'reviewer'],
            totalDurationMs: Date.now() - startTime,
            totalTokens,
            totalCostUsd,
          },
        };
      } catch (err: any) {
        workflowSpan.end({ error: err.message });
        logger.error(`${routeDecision.profile} Engineering Supervisor failed:`, err);
      }
    }

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
        const expSpan = globalTracer.startSpan(context.taskId, 'Explorer Agent', 'model_request');
        const expRes = await this.explorer.run(prompt, context);
        expSpan.end({ error: expRes.success ? undefined : expRes.summary });
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
        const planSpan = globalTracer.startSpan(context.taskId, 'Planner Agent', 'model_request');
        const planRes = await this.planner.run(prompt, context, { exploration });
        planSpan.end({ error: planRes.success ? undefined : planRes.summary });
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
      const coderSpan = globalTracer.startSpan(context.taskId, 'Coder Agent', 'model_request');
      const coderRes = await this.coder.run(prompt, context, {
        plan,
        relevantFiles: exploration?.relevantFiles || contextPackage.items.map((i) => i.relativePath),
      });
      coderSpan.end({ error: coderRes.success ? undefined : coderRes.summary });

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
        const verSpan = globalTracer.startSpan(context.taskId, 'Verification Stage', 'verify');
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
              const debugSpan = globalTracer.startSpan(context.taskId, 'Debugger Agent', 'model_request');
              const debugRes = await this.debuggerAgent.run(prompt, context, {
                failureOutput: cmdRes.data?.stderr || cmdRes.data?.stdout,
                command: step.verificationCommand,
              });
              debugSpan.end({ error: debugRes.success ? undefined : debugRes.summary });
              if (debugRes.data?.fixed) {
                verificationSuccess = true;
              }
            }
          }
        }
        verSpan.end();
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
      const revSpan = globalTracer.startSpan(context.taskId, 'Reviewer Agent', 'model_request');
      const reviewRes = await this.reviewer.run(prompt, context, {
        changedFiles: verifiedFiles,
        verificationSuccess,
      });
      revSpan.end({ error: reviewRes.success ? undefined : reviewRes.summary });

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

      const failingRole = (stagesRun.length > 0 ? stagesRun[stagesRun.length - 1] : 'coordinator') as AgentRole;
      task.status = status;
      task.stage = stage;
      task.currentAgentRole = failingRole;
      task.error = sanitizeErrorMessage(errorMsg);
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
