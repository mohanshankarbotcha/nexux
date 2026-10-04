import {
  AgentRole,
  AgentState,
  AgentStatus,
  NexusEventBus,
  globalEventBus,
  logger,
} from '@nexus/core';
import { ModelRouter, globalModelRouter } from '../providers/model-router.js';
import { ToolRegistry, globalToolRegistry } from '../tools/tool-registry.js';

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
  protected state: AgentState;

  constructor(
    modelRouter: ModelRouter = globalModelRouter,
    toolRegistry: ToolRegistry = globalToolRegistry,
    eventBus: NexusEventBus = globalEventBus
  ) {
    this.modelRouter = modelRouter;
    this.toolRegistry = toolRegistry;
    this.eventBus = eventBus;
    this.state = {
      role: 'coordinator',
      status: 'idle',
    };
  }

  getState(): AgentState {
    return { ...this.state };
  }

  protected updateStatus(
    status: AgentStatus,
    context: AgentExecutionContext,
    taskDescription?: string
  ): void {
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

  abstract run(
    prompt: string,
    context: AgentExecutionContext
  ): Promise<{ summary: string; success: boolean }>;
}
