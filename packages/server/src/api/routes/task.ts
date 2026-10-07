import { Router, Request, Response, NextFunction } from 'express';
import {
  NexusError,
  NexusEventBus,
  ProviderError,
  Task,
  ValidationError,
  globalEventBus,
  logger,
} from '@nexus/core';
import { globalStorage } from '../../storage/storage-engine.js';
import { globalModelRouter } from '../../providers/model-router.js';
import { globalCoordinator } from '../../agent/coordinator.js';
import { globalWorkspaceService } from '../../workspace/workspace-service.js';
import { globalActiveTaskRegistry } from '../../tasks/active-task-registry.js';

export function createTaskRouter(): Router {
  const router = Router();

  // List all tasks
  router.get('/', (_req: Request, res: Response) => {
    const tasks = globalStorage.getAllTasks();
    res.json({ success: true, tasks });
  });

  // List currently running/active tasks
  router.get('/active', (_req: Request, res: Response) => {
    const activeTasks = globalActiveTaskRegistry.listActive();
    res.json({ success: true, activeTasks });
  });

  // Global SSE stream for all workspace events
  router.get('/events/all', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const unsubscribe = globalEventBus.onAll((event) => {
      res.write(NexusEventBus.formatSSE(event));
    });

    _req.on('close', () => {
      unsubscribe();
    });
  });

  // Create and launch new task
  router.post('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { prompt, sessionId, workspaceRoot, workspacePath, provider, model } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        throw new ValidationError('Task prompt is required');
      }

      if (!globalModelRouter.hasAnyConfiguredProvider()) {
        throw new ProviderError(
          'Cannot execute task: No AI model provider is configured. Please configure an OpenAI or Google Gemini API key.',
          'router',
          'PROVIDER_NOT_CONFIGURED',
          400
        );
      }

      const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const taskSessionId = sessionId || `session_${Date.now()}`;
      // Target workspace directory
      const targetWorkspace =
        workspaceRoot ||
        workspacePath ||
        globalWorkspaceService.getCurrentWorkspace()?.path ||
        process.cwd();

      // Ensure session exists or is updated
      let session = globalStorage.getSession(taskSessionId);
      if (!session) {
        session = {
          id: taskSessionId,
          workspaceId: globalWorkspaceService.getCurrentWorkspace()?.id || `ws_${Date.now()}`,
          workspacePath: targetWorkspace,
          title: prompt.slice(0, 45),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          taskIds: [taskId],
          activeTaskId: taskId,
        };
        globalStorage.saveSession(session);
      } else {
        if (!session.taskIds.includes(taskId)) {
          session.taskIds.push(taskId);
        }
        session.activeTaskId = taskId;
        session.updatedAt = Date.now();
        globalStorage.saveSession(session);
      }

      const route = globalModelRouter.getRouteForRole('coordinator', {
        provider,
        model,
      });

      const task: Task = {
        id: taskId,
        sessionId: taskSessionId,
        prompt,
        status: 'pending',
        stage: 'created',
        changedFiles: [],
        activeAgents: [],
        createdAt: Date.now(),
        providerMetadata: {
          provider: route.provider.id,
          model: route.model,
          plannerModel: route.model,
          coderModel: route.model,
          reviewerModel: route.model,
        },
      };

      globalStorage.saveTask(task);

      globalEventBus.emit({
        id: `evt_${Date.now()}`,
        type: 'task_started',
        sessionId: task.sessionId,
        taskId: task.id,
        timestamp: Date.now(),
        prompt: task.prompt,
      });

      // Register task with central active registry
      const controller = new AbortController();
      globalActiveTaskRegistry.register(taskId, {
        sessionId: taskSessionId,
        prompt,
        workspaceRoot: targetWorkspace,
        abortController: controller,
        provider: route.provider.id,
        model: route.model,
      });

      // Launch async coordinator loop in background
      globalCoordinator
        .run(prompt, {
          sessionId: taskSessionId,
          taskId,
          workspaceRoot: targetWorkspace,
          abortSignal: controller.signal,
          provider: route.provider.id,
          model: route.model,
        })
        .then((result) => {
          logger.info(`Task ${taskId} completed with status: ${result.data?.status || 'completed'}`);
        })
        .catch((err) => {
          logger.error(`Task ${taskId} execution failed:`, err);
        })
        .finally(() => {
          globalActiveTaskRegistry.unregister(taskId);
        });

      res.status(201).json({
        success: true,
        task,
      });
    } catch (err) {
      next(err);
    }
  });

  // Cancel running task
  router.post('/:id/cancel', (req: Request, res: Response) => {
    const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = globalActiveTaskRegistry.cancel(taskId, 'User cancelled task');

    if (result.success) {
      res.json({ success: true, message: result.message, taskId });
    } else {
      // Check if task exists in storage
      const task = globalStorage.getTask(taskId);
      if (task) {
        task.status = 'cancelled';
        task.stage = 'cancelled';
        task.completedAt = Date.now();
        task.updatedAt = Date.now();
        globalStorage.saveTask(task);

        globalEventBus.emit({
          id: `evt_cancel_${Date.now()}`,
          type: 'task_cancelled',
          sessionId: task.sessionId,
          taskId,
          timestamp: Date.now(),
          reason: 'User cancelled task',
        });

        res.json({ success: true, message: `Task ${taskId} cancelled`, taskId });
      } else {
        res.status(404).json({ success: false, error: 'Task not found' });
      }
    }
  });

  // Get task by ID (supports includeEvents=true and includeUsage=true)
  router.get('/:id', (req: Request, res: Response) => {
    const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const includeEvents = req.query.includeEvents === 'true';
    const includeUsage = req.query.includeUsage === 'true';
    const task = globalStorage.getTask(taskId, { includeEvents, includeUsage });
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found' });
      return;
    }

    // Merge active status if task is currently active
    const active = globalActiveTaskRegistry.get(taskId);
    if (active) {
      task.status = active.status;
      task.stage = active.stage;
      if (active.agentRole) task.currentAgentRole = active.agentRole;
    }

    res.json({ success: true, task });
  });

  // Get persisted historical events for a task
  router.get('/:id/events/history', (req: Request, res: Response) => {
    const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const events = globalStorage.getTaskEvents(taskId);
    res.json({ success: true, events });
  });

  // Get usage records for a task
  router.get('/:id/usage', (req: Request, res: Response) => {
    const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const records = globalStorage.getUsageRecords().filter((u) => u.taskId === taskId);
    res.json({ success: true, records });
  });

  // Server-Sent Events (SSE) stream for real-time task events
  router.get('/:id/events', (req: Request, res: Response) => {
    const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    logger.debug(`Client connected to event stream for task ${taskId}`);

    const unsubscribe = globalEventBus.onTask(taskId, (event) => {
      res.write(NexusEventBus.formatSSE(event));
    });

    req.on('close', () => {
      logger.debug(`Client disconnected from event stream for task ${taskId}`);
      unsubscribe();
    });
  });

  return router;
}
