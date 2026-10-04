import { Router, Request, Response, NextFunction } from 'express';
import {
  ValidationError,
  WorkspaceError,
  Session,
} from '@nexus/core';
import { globalStorage } from '../../storage/storage-engine.js';
import { globalWorkspaceService } from '../../workspace/workspace-service.js';

export function createSessionRouter(): Router {
  const router = Router();

  // List sessions (optionally filtered by workspace)
  router.get('/', (req: Request, res: Response) => {
    const workspaceQuery = (req.query.workspace || req.query.workspacePath || req.query.workspaceId) as string | undefined;

    let sessions = globalStorage.getSessions();
    if (workspaceQuery) {
      sessions = globalStorage.getSessionsForWorkspace(workspaceQuery);
    }

    res.json({
      success: true,
      sessions,
    });
  });

  // Create new session
  router.post('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { workspacePath, workspaceId, title } = req.body;
      const targetPath = workspacePath || globalWorkspaceService.getCurrentWorkspace()?.path;

      if (!targetPath) {
        throw new ValidationError('workspacePath is required to create a session');
      }

      const targetId = workspaceId || globalWorkspaceService.getCurrentWorkspace()?.id || `ws_${Date.now()}`;
      const session = globalStorage.getOrCreateSession(targetId, targetPath, title);

      res.status(201).json({
        success: true,
        session,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get session details and tasks
  router.get('/:id', (req: Request, res: Response) => {
    const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const session = globalStorage.getSession(sessionId);

    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const tasks = globalStorage.getTasksBySession(sessionId);
    const usageRecords = globalStorage.getUsageRecords().filter((u) => u.sessionId === sessionId);

    res.json({
      success: true,
      session,
      tasks,
      usageCount: usageRecords.length,
    });
  });

  // Reopen session
  router.post('/:id/reopen', (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const session = globalStorage.getSession(sessionId);

      if (!session) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      // Open workspace if not already open
      try {
        globalWorkspaceService.openWorkspace(session.workspacePath);
      } catch (err) {
        // Continue even if directory open raises warning, but report state
      }

      session.updatedAt = Date.now();
      globalStorage.saveSession(session);

      const tasks = globalStorage.getTasksBySession(sessionId);

      res.json({
        success: true,
        session,
        tasks,
        message: `Session '${session.title}' reopened successfully`,
      });
    } catch (err) {
      next(err);
    }
  });

  // Delete session
  router.delete('/:id', (req: Request, res: Response) => {
    const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const deleted = globalStorage.deleteSession(sessionId);

    if (!deleted) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    res.json({
      success: true,
      message: `Session ${sessionId} deleted`,
    });
  });

  return router;
}
