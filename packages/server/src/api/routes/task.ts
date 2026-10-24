import { Router, Request, Response, NextFunction } from 'express';
import {
  NexusError,
  NexusEventBus,
  ProviderError,
  Task,
  ValidationError,
  globalEventBus,
  logger,
  sanitizeErrorMessage,
} from '@nexus/core';
import { globalStorage } from '../../storage/storage-engine.js';
import { globalModelRouter } from '../../providers/model-router.js';
import { globalCoordinator } from '../../agent/coordinator.js';
import { globalWorkspaceService } from '../../workspace/workspace-service.js';
import { globalActiveTaskRegistry } from '../../tasks/active-task-registry.js';
import { globalTracer } from '../../tracing/tracer.js';

export function createTaskRouter(): Router {
  const router = Router();

  // List tasks with optional pagination limit
  router.get('/', (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    let tasks = globalStorage.getAllTasks();
    if (limit && limit > 0) {
      tasks = tasks.slice(-limit);
    }
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

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 15_000);

    const unsubscribe = globalEventBus.onAll((event) => {
      res.write(NexusEventBus.formatSSE(event));
    });

    _req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // Create and launch new task
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { prompt, sessionId, workspaceRoot, workspacePath, provider, model } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        throw new ValidationError('Task prompt is required');
      }

      if (!globalModelRouter.hasAnyConfiguredProvider()) {
        throw new ProviderError(
          'Cannot execute task: No AI model provider is configured. Please configure an OpenAI or Google Gemini API key in Settings → Providers.',
          'router',
          'PROVIDER_NOT_CONFIGURED',
          400
        );
      }

      const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const routeSpan = globalTracer.startSpan(taskId, 'Request Route & Validation', 'route');
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

      const preflightSpan = globalTracer.startSpan(taskId, 'Provider Preflight Check', 'preflight', {
        parentId: routeSpan.span.spanId,
        provider: route.provider.id,
        model: route.model,
      });

      // Preflight credential validation before launching task runner
      const validation = await route.provider.validateCredentials();
      if (!validation.isValid) {
        preflightSpan.end({ error: validation.message });
        routeSpan.end({ error: validation.message });
        logger.warn(`Task preflight failed for provider ${route.provider.id}: ${validation.message}`);
        const cleanMsg = sanitizeErrorMessage(validation.message).replace(/\.+$/, '');
        const failedTask: Task = {
          id: taskId,
          sessionId: taskSessionId,
          prompt,
          status: 'failed',
          stage: 'failed',
          error: `PROVIDER_AUTH_FAILED: ${cleanMsg}. Please configure a valid ${route.provider.name} API key in Settings → Providers.`,
          changedFiles: [],
          activeAgents: [],
          createdAt: Date.now(),
          completedAt: Date.now(),
          providerMetadata: {
            provider: route.provider.id,
            model: route.model,
            plannerModel: route.model,
            coderModel: route.model,
            reviewerModel: route.model,
          },
        };
        globalStorage.saveTask(failedTask);

        globalEventBus.emit({
          id: `evt_${Date.now()}`,
          type: 'task_failed',
          sessionId: failedTask.sessionId,
          taskId: failedTask.id,
          timestamp: Date.now(),
          error: failedTask.error || 'Validation failed',
        });

        res.status(400).json({
          success: false,
          errorCode: 'PROVIDER_AUTH_FAILED',
          error: failedTask.error,
          task: failedTask,
        });
        return;
      }

      // Preflight model availability check
      if (typeof (route.provider as any).validateModel === 'function') {
        const modelValidation = await (route.provider as any).validateModel(route.model);
        if (!modelValidation.isValid) {
          preflightSpan.end({ error: modelValidation.message });
          routeSpan.end({ error: modelValidation.message });
          logger.warn(
            `Task preflight model check failed for ${route.provider.id} model ${route.model}: ${modelValidation.message}`
          );
          const cleanMsg = sanitizeErrorMessage(modelValidation.message).replace(/\.+$/, '');
          const errCode = modelValidation.code || 'MODEL_UNAVAILABLE';
          const failedTask: Task = {
            id: taskId,
            sessionId: taskSessionId,
            prompt,
            status: 'failed',
            stage: 'failed',
            error: `${errCode}: ${cleanMsg}`,
            changedFiles: [],
            activeAgents: [],
            createdAt: Date.now(),
            completedAt: Date.now(),
            providerMetadata: {
              provider: route.provider.id,
              model: route.model,
              plannerModel: route.model,
              coderModel: route.model,
              reviewerModel: route.model,
            },
          };
          globalStorage.saveTask(failedTask);

          globalEventBus.emit({
            id: `evt_${Date.now()}`,
            type: 'task_failed',
            sessionId: failedTask.sessionId,
            taskId: failedTask.id,
            timestamp: Date.now(),
            error: failedTask.error || 'Model unavailable',
          });

          res.status(400).json({
            success: false,
            errorCode: errCode,
            error: failedTask.error,
            task: failedTask,
          });
          return;
        }
      }

      preflightSpan.end();
      routeSpan.end();

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

  // Get timeline spans for a task
  router.get('/:id/timeline', (req: Request, res: Response) => {
    const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const timeline = globalTracer.getTimeline(taskId);
    res.json({ success: true, timeline });
  });

  // Export timeline as JSON
  router.get('/:id/timeline/export', (req: Request, res: Response) => {
    const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const json = globalTracer.exportTimelineJson(taskId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="task-${taskId}-timeline.json"`);
    res.send(json);
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
