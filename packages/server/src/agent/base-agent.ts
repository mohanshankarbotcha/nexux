import {
  AgentRole,
  AgentState,
  AgentStatus,
  NexusEventBus,
  ProviderRequest,
  ProviderResponse,
  StreamChunk,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolResult,
  calculateEstimatedCost,
  globalEventBus,
  logger,
} from '@nexus/core';
import { ModelRouter, globalModelRouter } from '../providers/model-router.js';
import { ToolRegistry, globalToolRegistry } from '../tools/tool-registry.js';
import { StorageEngine, globalStorage } from '../storage/storage-engine.js';

export interface AgentExecutionContext {
  sessionId: string;
  taskId: string;
  workspaceRoot: string;
  abortSignal?: AbortSignal;
}

export abstract class BaseAgent {
  abstract readonly role: AgentRole;
  abstract readonly description: string;

  protected modelRouter: ModelRouter;
  protected toolRegistry: ToolRegistry;
  protected eventBus: NexusEventBus;
  protected storage: StorageEngine;
  protected state: AgentState;

  constructor(
    modelRouter: ModelRouter = globalModelRouter,
    toolRegistry: ToolRegistry = globalToolRegistry,
    eventBus: NexusEventBus = globalEventBus,
    storage: StorageEngine = globalStorage
  ) {
    this.modelRouter = modelRouter;
    this.toolRegistry = toolRegistry;
    this.eventBus = eventBus;
    this.storage = storage;
    this.state = {
      role: 'coordinator',
      status: 'idle',
    };
  }

  getState(): AgentState {
    return { ...this.state, role: this.role };
  }

  protected updateStatus(
    status: AgentStatus,
    context: AgentExecutionContext,
    taskDescription?: string
  ): void {
    this.state.role = this.role;
    this.state.status = status;
    if (taskDescription) {
      this.state.currentTaskDescription = taskDescription;
    }

    if (status === 'thinking' || status === 'executing_tool') {
      if (!this.state.startedAt) this.state.startedAt = Date.now();
    } else if (status === 'completed' || status === 'failed') {
      this.state.completedAt = Date.now();
    }

    logger.debug(`Agent [${this.role}] status changed to ${status}`, {
      taskId: context.taskId,
    });
  }

  protected emitAgentStarted(goal: string, context: AgentExecutionContext): void {
    this.updateStatus('thinking', context, goal);
    this.eventBus.emit({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'agent_started',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: Date.now(),
      agentRole: this.role,
      goal,
    });
  }

  protected emitAgentMessage(content: string, context: AgentExecutionContext, isStreaming = false): void {
    this.eventBus.emit({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'agent_message',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: Date.now(),
      agentRole: this.role,
      content,
      isStreaming,
    });
  }

  protected emitAgentCompleted(summary: string, context: AgentExecutionContext): void {
    this.updateStatus('completed', context, summary);
    this.eventBus.emit({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'agent_completed',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: Date.now(),
      agentRole: this.role,
      summary,
    });
  }

  /**
   * Executes a tool with structured event emission and error logging.
   */
  protected async callTool<TInput = unknown, TOutput = unknown>(
    name: ToolName,
    input: TInput,
    context: AgentExecutionContext
  ): Promise<ToolResult<TOutput>> {
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.updateStatus('executing_tool', context, `Tool: ${name}`);

    this.eventBus.emit({
      id: `evt_${Date.now()}`,
      type: 'tool_started',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: Date.now(),
      agentRole: this.role,
      toolCallId: callId,
      toolName: name,
      input: (input as Record<string, unknown>) || {},
    });

    const toolContext: ToolCallContext = {
      workspaceRoot: context.workspaceRoot,
      sessionId: context.sessionId,
      taskId: context.taskId,
      agentRole: this.role,
      abortSignal: context.abortSignal,
      eventBus: this.eventBus,
    };

    const result = await this.toolRegistry.execute(name, input, toolContext);

    this.eventBus.emit({
      id: `evt_${Date.now()}`,
      type: 'tool_completed',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: Date.now(),
      agentRole: this.role,
      toolCallId: result.callId,
      toolName: name,
      success: result.success,
      durationMs: result.durationMs,
      outputSummary: result.success ? JSON.stringify(result.data).slice(0, 150) : undefined,
      error: result.error,
    });

    return result as ToolResult<TOutput>;
  }

  /**
   * Calls the model router for this agent role, streaming chunks and recording usage telemetry.
   */
  protected async callModel(
    request: Omit<ProviderRequest, 'model' | 'requestId'>,
    context: AgentExecutionContext,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<ProviderResponse> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fullRequest: Omit<ProviderRequest, 'model'> = {
      ...request,
      requestId,
      abortSignal: context.abortSignal,
    };

    const startTime = Date.now();
    let response: ProviderResponse;

    try {
      if (onChunk) {
        response = await this.modelRouter.streamForRole(this.role, fullRequest, (chunk) => {
          onChunk(chunk);
          if (chunk.deltaText) {
            this.emitAgentMessage(chunk.deltaText, context, true);
          }
        });
      } else {
        response = await this.modelRouter.executeForRole(this.role, fullRequest);
      }

      const durationMs = Date.now() - startTime;
      const estimatedCost = calculateEstimatedCost(
        response.model,
        response.usage.inputTokens,
        response.usage.outputTokens
      );

      // Record telemetry in storage
      this.storage.recordUsage({
        requestId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        agent: this.role,
        provider: response.provider,
        model: response.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.totalTokens,
        isEstimated: Boolean(response.usage.isEstimated),
        estimatedCostUsd: estimatedCost,
        timestamp: Date.now(),
        durationMs,
        status: 'success',
      });

      return response;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Record failed telemetry
      this.storage.recordUsage({
        requestId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        agent: this.role,
        provider: 'gemini',
        model: 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        isEstimated: true,
        estimatedCostUsd: 0,
        timestamp: Date.now(),
        durationMs,
        status: 'failed',
        error: errorMsg,
      });

      throw err;
    }
  }

  abstract run(
    prompt: string,
    context: AgentExecutionContext,
    additionalContext?: Record<string, unknown>
  ): Promise<{ summary: string; success: boolean; data?: unknown }>;
}
