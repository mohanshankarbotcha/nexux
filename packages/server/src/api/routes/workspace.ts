import { Router, Request, Response, NextFunction } from 'express';
import { WorkspaceError } from '@nexus/core';
import { globalWorkspaceService } from '../../workspace/workspace-service.js';

export function createWorkspaceRouter(): Router {
  const router = Router();

  // List recent workspaces
  router.get('/', (req: Request, res: Response) => {
    const list = globalWorkspaceService.getRecentWorkspaces();
    res.json({ success: true, workspaces: list });
  });

  // Open or register workspace
  router.post('/open', (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetPath = req.body.targetPath || req.body.path;
      const workspace = globalWorkspaceService.openWorkspace(targetPath);
      res.json({
        success: true,
        workspace,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get file tree
  router.get('/tree', (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspacePath = (req.query.workspace || req.query.path) as string;
      if (!workspacePath) {
        throw new WorkspaceError('Workspace query parameter is required');
      }
      const depth = req.query.depth ? parseInt(req.query.depth as string, 10) : 6;
      const tree = globalWorkspaceService.getFileTree(workspacePath, depth);
      res.json({ success: true, tree });
    } catch (err) {
      next(err);
    }
  });

  // Read file content
  router.get('/file', (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspacePath = req.query.workspace as string;
      const filePath = req.query.file as string;

      if (!workspacePath || !filePath) {
        throw new WorkspaceError('Both "workspace" and "file" query parameters are required');
      }

      const startLine = req.query.startLine ? parseInt(req.query.startLine as string, 10) : undefined;
      const endLine = req.query.endLine ? parseInt(req.query.endLine as string, 10) : undefined;

      const fileData = globalWorkspaceService.readFileContent(workspacePath, filePath, startLine, endLine);
      res.json({ success: true, ...fileData });
    } catch (err) {
      next(err);
    }
  });

  // Get file metadata
  router.get('/metadata', (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspacePath = req.query.workspace as string;
      const filePath = req.query.file as string;

      if (!workspacePath || !filePath) {
        throw new WorkspaceError('Both "workspace" and "file" query parameters are required');
      }

      const metadata = globalWorkspaceService.getFileMetadata(workspacePath, filePath);
      res.json({ success: true, metadata });
    } catch (err) {
      next(err);
    }
  });

  // Search workspace text files
  router.get('/search', (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspacePath = req.query.workspace as string;
      const query = req.query.q as string;
      const pattern = req.query.pattern as string | undefined;

      if (!workspacePath || !query) {
        throw new WorkspaceError('Both "workspace" and "q" query parameters are required');
      }

      const searchResult = globalWorkspaceService.searchFiles(workspacePath, query, pattern);
      res.json({ success: true, result: searchResult });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
