import {
  AgentRole,
  NexusEventBus,
  Task,
  TaskStatus,
  globalEventBus,
  logger,
} from '@nexus/core';
import { StorageEngine, globalStorage } from '../storage/storage-engine.js';

export interface ActiveTaskEntry {
  taskId: string;
  sessionId: string;
  prompt: string;
  workspaceRoot: string;
  abortController: AbortController;
  status: TaskStatus;
  stage: string;
  agentRole?: AgentRole;
  provider?: string;
  model?: string;
  startedAt: number;
  lastHeartbeatAt: number;
  timeoutTimer?: NodeJS.Timeout;
  heartbeatTimer?: NodeJS.Timeout;
}

export interface RegisterTaskOptions {
  sessionId: string;
  prompt: string;
  workspaceRoot: string;
  abortController: AbortController;
  provider?: string;
  model?: string;
  timeoutMs?: number;
}

export class ActiveTaskRegistry {
  private activeTasks = new Map<string, ActiveTaskEntry>();
  private recentlyTerminated = new Map<string, TaskStatus>();
  private eventBus: NexusEventBus;
  private storage: StorageEngine;

  constructor(eventBus: NexusEventBus = globalEventBus, storage: StorageEngine = globalStorage) {
    this.eventBus = eventBus;
    this.storage = storage;
  }

  register(taskId: string, options: RegisterTaskOptions): ActiveTaskEntry {
    // If a task with this ID is already registered, clean up old timers
    const existing = this.activeTasks.get(taskId);
    if (existing) {
      if (existing.timeoutTimer) clearTimeout(existing.timeoutTimer);
      if (existing.heartbeatTimer) clearInterval(existing.heartbeatTimer);
    }

    const now = Date.now();
    const timeoutMs = options.timeoutMs ?? 600_000; // 10 minutes default max execution

    const entry: ActiveTaskEntry = {
      taskId,
      sessionId: options.sessionId,
      prompt: options.prompt,
      workspaceRoot: options.workspaceRoot,
      abortController: options.abortController,
      status: 'running',
      stage: 'created',
      provider: options.provider,
      model: options.model,
      startedAt: now,
      lastHeartbeatAt: now,
    };

    // Auto-timeout timer
    entry.timeoutTimer = setTimeout(() => {
      logger.warn(`ActiveTaskRegistry: Task ${taskId} exceeded max duration of ${timeoutMs}ms, aborting`);
      this.timeout(taskId, `Task execution timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    }, timeoutMs);

    // Periodic heartbeat timer (every 4 seconds) to ensure SSE stream and UI remain informed
    entry.heartbeatTimer = setInterval(() => {
      const current = this.activeTasks.get(taskId);
      if (!current) return;
      current.lastHeartbeatAt = Date.now();
      const elapsedMs = current.lastHeartbeatAt - current.startedAt;

      this.eventBus.emit({
        id: `evt_hb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'task_heartbeat',
        sessionId: current.sessionId,
        taskId: current.taskId,
        timestamp: current.lastHeartbeatAt,
        stage: current.stage,
        agentRole: current.agentRole,
        status: current.status,
        elapsedMs,
      });
    }, 4000);

    this.activeTasks.set(taskId, entry);
    logger.info(`ActiveTaskRegistry: Registered active task ${taskId}`, {
      provider: options.provider,
      model: options.model,
    });

    return entry;
  }

  get(taskId: string): ActiveTaskEntry | undefined {
    return this.activeTasks.get(taskId);
  }

  has(taskId: string): boolean {
    return this.activeTasks.has(taskId);
  }

  updateStage(taskId: string, stage: string, agentRole?: AgentRole, message?: string): void {
    const entry = this.activeTasks.get(taskId);
    if (entry) {
      entry.stage = stage;
      if (agentRole) entry.agentRole = agentRole;
    }

    // Update storage record
    const task = this.storage.getTask(taskId);
    if (task) {
      task.stage = stage;
      if (agentRole) task.currentAgentRole = agentRole;
      task.updatedAt = Date.now();
      this.storage.saveTask(task);
    }

    // Emit task_progress
    this.eventBus.emit({
      id: `evt_prog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'task_progress',
      sessionId: entry?.sessionId || task?.sessionId || 'unknown',
      taskId,
      timestamp: Date.now(),
      stage,
      agentRole,
      status: entry?.status || task?.status || 'running',
      message: message || `Agent stage: ${stage}`,
    });
  }

  cancel(taskId: string, reason = 'Task cancelled by user'): { success: boolean; message: string } {
    const entry = this.activeTasks.get(taskId);
    if (entry) {
      logger.info(`ActiveTaskRegistry: Cancelling active task ${taskId}. Reason: ${reason}`);
      entry.status = 'cancelled';
      entry.stage = 'cancelled';

      // Abort controller
      entry.abortController.abort();

      // Clean up timers
      this.cleanupTimers(entry);
      this.activeTasks.delete(taskId);
      this.recentlyTerminated.set(taskId, 'cancelled');

      // Update storage
      const task = this.storage.getTask(taskId);
      if (task) {
        task.status = 'cancelled';
        task.stage = 'cancelled';
        task.completedAt = Date.now();
        task.updatedAt = Date.now();
        this.storage.saveTask(task);
      }

      // Emit event
      this.eventBus.emit({
        id: `evt_cancel_${Date.now()}`,
        type: 'task_cancelled',
        sessionId: entry.sessionId,
        taskId,
        timestamp: Date.now(),
        reason,
      });

      return { success: true, message: `Task ${taskId} cancelled successfully` };
    }

    // Check recently terminated cache
    if (this.recentlyTerminated.has(taskId)) {
      return {
        success: true,
        message: `Task ${taskId} was already in terminal state '${this.recentlyTerminated.get(taskId)}'`,
      };
    }

    // If not in active memory, check persistent storage
    const storedTask = this.storage.getTask(taskId);
    if (storedTask) {
      if (storedTask.status === 'running' || storedTask.status === 'pending') {
        storedTask.status = 'cancelled';
        storedTask.stage = 'cancelled';
        storedTask.completedAt = Date.now();
        storedTask.updatedAt = Date.now();
        this.storage.saveTask(storedTask);
        this.recentlyTerminated.set(taskId, 'cancelled');

        this.eventBus.emit({
          id: `evt_cancel_${Date.now()}`,
          type: 'task_cancelled',
          sessionId: storedTask.sessionId,
          taskId,
          timestamp: Date.now(),
          reason,
        });

        return { success: true, message: `Task ${taskId} cancelled successfully` };
      }

      this.recentlyTerminated.set(taskId, storedTask.status);
      return {
        success: true,
        message: `Task ${taskId} was already in terminal state '${storedTask.status}'`,
      };
    }

    return { success: false, message: `Task ${taskId} not found` };
  }

  timeout(taskId: string, reason = 'Task execution timed out'): void {
    const entry = this.activeTasks.get(taskId);
    if (!entry) return;

    entry.status = 'failed';
    entry.stage = 'timeout';
    entry.abortController.abort();
    this.cleanupTimers(entry);
    this.activeTasks.delete(taskId);
    this.recentlyTerminated.set(taskId, 'failed');

    const task = this.storage.getTask(taskId);
    if (task) {
      task.status = 'failed';
      task.stage = 'timeout';
      task.error = reason;
      task.completedAt = Date.now();
      task.updatedAt = Date.now();
      this.storage.saveTask(task);
    }

    this.eventBus.emit({
      id: `evt_timeout_${Date.now()}`,
      type: 'task_failed',
      sessionId: entry.sessionId,
      taskId,
      timestamp: Date.now(),
      error: reason,
    });
  }

  complete(taskId: string, summary?: string): void {
    const entry = this.activeTasks.get(taskId);
    if (entry) {
      this.cleanupTimers(entry);
      this.activeTasks.delete(taskId);
      this.recentlyTerminated.set(taskId, 'completed');
    }

    const task = this.storage.getTask(taskId);
    if (task) {
      task.status = 'completed';
      task.stage = 'completed';
      if (summary) task.resultSummary = summary;
      task.completedAt = Date.now();
      task.updatedAt = Date.now();
      this.storage.saveTask(task);
      this.recentlyTerminated.set(taskId, 'completed');
    }
  }

  fail(taskId: string, error: string): void {
    const entry = this.activeTasks.get(taskId);
    if (entry) {
      this.cleanupTimers(entry);
      this.activeTasks.delete(taskId);
    }

    const task = this.storage.getTask(taskId);
    if (task) {
      task.status = 'failed';
      task.stage = 'failed';
      task.error = error;
      task.completedAt = Date.now();
      task.updatedAt = Date.now();
      this.storage.saveTask(task);
    }
  }

  unregister(taskId: string): void {
    const entry = this.activeTasks.get(taskId);
    if (entry) {
      this.cleanupTimers(entry);
      this.activeTasks.delete(taskId);
    }
  }

  listActive(): {
    taskId: string;
    sessionId: string;
    status: TaskStatus;
    stage: string;
    agentRole?: AgentRole;
    provider?: string;
    model?: string;
    elapsedMs: number;
  }[] {
    const list = [];
    const now = Date.now();
    for (const entry of this.activeTasks.values()) {
      list.push({
        taskId: entry.taskId,
        sessionId: entry.sessionId,
        status: entry.status,
        stage: entry.stage,
        agentRole: entry.agentRole,
        provider: entry.provider,
        model: entry.model,
        elapsedMs: now - entry.startedAt,
      });
    }
    return list;
  }

  private cleanupTimers(entry: ActiveTaskEntry): void {
    if (entry.timeoutTimer) {
      clearTimeout(entry.timeoutTimer);
      entry.timeoutTimer = undefined;
    }
    if (entry.heartbeatTimer) {
      clearInterval(entry.heartbeatTimer);
      entry.heartbeatTimer = undefined;
    }
  }
}

export const globalActiveTaskRegistry = new ActiveTaskRegistry();
