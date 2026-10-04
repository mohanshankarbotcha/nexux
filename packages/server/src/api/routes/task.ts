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

export function createTaskRouter(): Router {
  const router = Router();

  // Create new task
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
      const task: Task = {
        id: taskId,
        sessionId: sessionId || `session_${Date.now()}`,
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

      res.status(201).json({
        success: true,
        task,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get task by ID
  router.get('/:id', (req: Request, res: Response) => {
    const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const task = globalStorage.getTask(taskId);
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found' });
      return;
    }
    res.json({ success: true, task });
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
