import { Router, Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { WorkspaceError, WorkspaceInfo } from '@nexus/core';
import { globalStorage } from '../../storage/storage-engine.js';

export function createWorkspaceRouter(): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const list = globalStorage.getWorkspaces();
    res.json({ success: true, workspaces: list });
  });

  router.post('/open', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { targetPath } = req.body;
      if (!targetPath || typeof targetPath !== 'string') {
        throw new WorkspaceError('Target workspace path is required');
      }

      const resolved = path.resolve(targetPath);
      if (!fs.existsSync(resolved)) {
        throw new WorkspaceError(`Directory does not exist: ${resolved}`, 'WORKSPACE_NOT_FOUND', 404);
      }

      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        throw new WorkspaceError(`Target path is not a directory: ${resolved}`);
      }

      const workspaceInfo: WorkspaceInfo = {
        id: `ws_${Buffer.from(resolved).toString('base64url').slice(0, 16)}`,
        name: path.basename(resolved) || resolved,
        path: resolved,
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
      };

      globalStorage.saveWorkspace(workspaceInfo);

      res.json({
        success: true,
        workspace: workspaceInfo,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
