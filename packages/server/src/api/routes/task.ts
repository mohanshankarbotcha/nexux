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

export function createTaskRouter(): Router {
  const router = Router();
  const activeTaskControllers = new Map<string, AbortController>();

  // List all tasks
  router.get('/', (_req: Request, res: Response) => {
    const tasks = globalStorage.getAllTasks();
    res.json({ success: true, tasks });
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
      const { prompt, sessionId, workspaceRoot } = req.body;
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
      const targetWorkspace = workspaceRoot || globalWorkspaceService.getCurrentWorkspace()?.path || process.cwd();

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

      const task: Task = {
        id: taskId,
        sessionId: taskSessionId,
        prompt,
        status: 'pending',
        changedFiles: [],
        activeAgents: [],
        createdAt: Date.now(),
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

      // Launch async coordinator loop in background
      const controller = new AbortController();
      activeTaskControllers.set(taskId, controller);

      globalCoordinator
        .run(prompt, {
          sessionId: taskSessionId,
          taskId,
          workspaceRoot: targetWorkspace,
          abortSignal: controller.signal,
        })
        .then((result) => {
          logger.info(`Task ${taskId} completed with status: ${result.data?.status || 'completed'}`);
        })
        .catch((err) => {
          logger.error(`Task ${taskId} execution failed:`, err);
        })
        .finally(() => {
          activeTaskControllers.delete(taskId);
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
    const controller = activeTaskControllers.get(taskId);
    if (controller) {
      controller.abort();
      activeTaskControllers.delete(taskId);
      const task = globalStorage.getTask(taskId);
      if (task) {
        task.status = 'cancelled';
        globalStorage.saveTask(task);
      }
      res.json({ success: true, message: `Task ${taskId} cancelled` });
    } else {
      res.status(404).json({ success: false, error: 'Task not found or not currently active' });
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
